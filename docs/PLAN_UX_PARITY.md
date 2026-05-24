# Plan UX/UI Parity & Superiority vs zoom.earth

> **Origin**: side-by-side review en Chrome (2026-05-24) contra
> `https://zoom.earth/maps/temperature/` y nuestra producción
> `https://artemiop.com/mexico-weather/mapa/`.
>
> **Objetivo**: cerrar los 14 gaps detectados (1 crítico, 10 mayores,
> 4 menores) y elevar la calidad visual del mapa al nivel de zoom.earth
> en cold-load, primera impresión, y manejo de información.
>
> **Estado del feature set**: ya superamos a zoom.earth en cantidad de
> capacidades (16 overlays vs 7, ver `PLAN_SUPERIORITY.md`). Este plan
> NO añade features — pulir lo que tenemos para que se vea y sienta
> tan terminado como zoom.earth en los primeros 5 segundos de uso.

---

## Resumen ejecutivo

| Fase | Items | Esfuerzo | Impacto |
|------|-------|----------|---------|
| **P0 — crítico** | 3 (cold-load, leyenda, timeline) | ~1-2 PRs/día durante 3 días | Recupera la propuesta de valor visual. Si no se hace nada más, esto solo cierra 60% del gap |
| **P1 — paridad UX** | 5 (model toggle, city pills, sub-opciones, coords DMS, columna derecha) | ~5 PRs en 1 semana | Sensación de producto pulido vs prototipo |
| **P2 — pulido fino** | 6 (medición, viewport lock, tropical auto, etc.) | ~6 PRs en 2 semanas | Detalles que zoom.earth tiene pero pocos notarían faltando |

Total estimado: **~3 semanas de trabajo focalizado** o ~14 PRs.

---

## 🔴 P0 — Bugs críticos (la propuesta de valor está rota)

### P0.1 — Cold-load: el campo de temperatura no se pinta

#### Síntoma

Cargando cualquiera de estas URLs en fresh window:

```
https://artemiop.com/mexico-weather/mapa/#view=23.6,-102.5,5z&layer=temperature
https://artemiop.com/mexico-weather/mapa/#view=19.4,-99.1,9z&layer=temperature
https://artemiop.com/mexico-weather/forecast/?lat=19.43&lng=-99.13&name=Ciudad%20de%20M%C3%A9xico
```

El botón "Temperatura" queda marcado activo en el rail, la URL conserva
`layer=temperature`, **pero el raster del campo nunca se pinta sobre el
basemap**. zoom.earth, en la misma vista, pinta el gradiente continuo
de costa a costa inmediatamente.

Mismo bug en `/forecast/` — el mapa embebido (`fc-map`) queda en negro.

#### Root cause (hipótesis a verificar)

1. `setActiveLayer(initialLayer)` corre antes de `map.isStyleLoaded()`
   en el bootstrap (`src/lib/interactive-map.ts`). El raster source se
   intenta añadir contra un style aún no resuelto y MapLibre lo descarta
   silenciosamente.
2. El `fieldAbort = new AbortController()` del `setActiveLayer` inicial
   se aborta cuando el listener de `moveend` del primer fit-bounds dispara
   un nuevo `loadFieldGrid`.
3. El retry single-shot a 500 ms que añadimos (#164/#168) corre antes
   de que el bulk Open-Meteo responda en cold-cache (~1.2 s típico).

#### Fix

**Archivo**: `src/lib/interactive-map.ts` (alrededor de la zona de bootstrap, después de `new maplibre.Map({...})`).

```ts
// Antes:
if (initialLayer && initialLayer !== 'base') {
  void setActiveLayer(initialLayer);
}

// Después:
map.once('idle', () => {
  if (initialLayer && initialLayer !== 'base') {
    void setActiveLayer(initialLayer);
  }
});
```

Y reemplazar el retry single-shot por backoff exponencial:

```ts
async function setActiveLayerWithRetry(id: string): Promise<void> {
  const delays = [0, 300, 800, 1800, 3500]; // ~6.4 s acumulado
  for (const ms of delays) {
    if (ms > 0) await new Promise(r => setTimeout(r, ms));
    try {
      await setActiveLayer(id);
      if (map.getSource(FIELD_RASTER_SOURCE) || map.getLayer(RV_LAYER)) {
        return; // success
      }
    } catch (e) {
      // log + continue
    }
  }
}
```

#### Acceptance

- Reload `#view=23.6,-102.5,5z&layer=temperature` 10× seguidas: el campo
  pinta en cada una en ≤ 3 s.
- Reload `/forecast/?lat=19.43&lng=-99.13...` 10× seguidas: el mini-mapa
  embebido pinta el campo de temperatura.
- Test E2E (Playwright) que cargue la URL de mapa-temperatura y
  espere por `wx-field-layer` con `map.getLayer('wx-field-layer') !== undefined`.

#### Estimación

½ día. Bug ya investigado, fix conocido, falta solo aplicar + verificar.

---

### P0.2 — Leyenda de temperatura escondida en el rail

#### Síntoma

zoom.earth tiene una barra de color horizontal permanente abajo-izquierda
con la escala `°C -30 -20 -10 0 10 20 30 40 50` ocupando ~360px. Es
una pieza icónica de su UI y permite leer el valor de un color sin
buscar.

El nuestro tiene la leyenda como `<ul>` vertical metido **dentro del
panel "Capas"**, así que cuando el usuario colapsa el rail (común en
mobile o en uso prolongado), la leyenda desaparece.

#### Fix

**Archivo**: `src/components/InteractiveMap.astro` — mover el `<ul id={ids.legend}>` fuera del rail.

```astro
{/* Antes: dentro del .im-rail */}
<ul id={ids.legend} class="hidden sm:block space-y-1 pt-1 text-xs"></ul>

{/* Después: flotante abajo-izquierda como zoom.earth */}
<div
  id="legend-bar"
  class="pointer-events-none absolute bottom-2 left-2 z-10 hidden sm:flex items-center gap-1 rounded bg-white/90 px-3 py-1.5 text-xs shadow backdrop-blur-sm dark:bg-gray-900/85"
  aria-hidden="true"
>
  <span id="legend-unit" class="font-semibold text-gray-700 dark:text-gray-300"></span>
  <ul id={ids.legend} class="flex items-center gap-2"></ul>
</div>
```

**Archivo**: `src/lib/interactive-map.ts` — actualizar `renderLegend()` para layout horizontal.

```ts
// Cada stop ahora es:
//   <li class="flex items-center gap-1">
//     <span style="background:${color}" class="inline-block h-3 w-6"></span>
//     <span>${label}</span>
//   </li>
// y el contenedor padre #legend tiene flex-row gap-2.
```

#### Acceptance

- A zoom 5 y zoom 9, la barra de leyenda es visible abajo-izquierda en
  desktop sin colapsarse al togglear el rail.
- En mobile (< 640px) la leyenda se mantiene oculta para no comer
  espacio (consistente con zoom.earth mobile).
- Al cambiar de Temperatura → Humedad → Presión → Viento, la leyenda
  cambia de stops y de unidad (°C, %, hPa, km/h) sin parpadeo.

#### Estimación

½ día. Solo es reubicar DOM + CSS, no lógica.

---

### P0.3 — Timeline no visible al cargar

#### Síntoma

zoom.earth tiene una pastilla central abajo permanente con:

```
▶  ↑  ↑  ↑
   24  17 19
   may : :
▶  ↓  ↓  ↓
   ◀────────▶
```

Tres niveles de scrub (día / hora / intervalo de 15 min) además del
play. Posición fija centrada al fondo, siempre visible.

El nuestro tiene una timeline (`#timeline` existe en el DOM, confirmado
por inspección JS) pero **no es visible en el viewport por defecto**:
está posicionada fuera del área visible o tras otros elementos.

#### Fix

**Archivo**: `src/components/InteractiveMap.astro` — re-posicionar el contenedor de timeline.

```astro
<div
  id={ids.timeline}
  class="pointer-events-auto absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-full bg-gray-900/85 px-4 py-2 text-sm text-white shadow-lg backdrop-blur"
  role="group"
  aria-label="Línea de tiempo"
>
  <!-- play + date + hour + interval controls -->
</div>
```

**Archivo**: `src/lib/interactive-map.ts` — añadir 3 niveles de navegación.

```ts
// Antes: un slider continuo, un play, "ahora" link
// Después:
//   - Botón ▶/⏸ (play/pause animación)
//   - ▲▼ día (jump ±24 frames)
//   - ▲▼ hora (jump ±1 frame)
//   - ▲▼ intervalo (jump ±N frames si N=15min, o ±N si timestep)
//   - Texto "24 may 17:19" (dateLocale-aware)
//   - Botón "Ahora" para volver a frame=current
```

#### Acceptance

- A cualquier zoom, la pastilla de timeline aparece centrada al fondo
  con play visible.
- Las 3 flechas día/hora/intervalo funcionan y mueven el frame al
  delta correcto.
- En layers `raster-tile` (Radar/Satélite) usa frames de RainViewer/GIBS.
- En layers `field` y `particles` (Temp/Humedad/Presión/Viento) usa
  hourly index del FieldGrid.
- En mobile, la pastilla se compacta pero mantiene play + ▲▼ hora.

#### Estimación

1.5 días. Es donde más rediseño UI requiere; la lógica de frame ya
existe, lo nuevo es el chrome.

---

## 🟠 P1 — Paridad UX (sensación de producto terminado)

### P1.1 — Toggle de modelo NWP en el badge bottom-right

#### Estado actual

Badge estático "Open-Meteo · best match · ~9 km" en `InteractiveMap.astro`
línea 293-298. Sin interacción.

#### Estado deseado (zoom.earth)

Dos pills clickables abajo-derecha: `ICON 13 km` (activo) | `GFS 22 km`.
Toggle al hacer click cambia el modelo y refetchea los rasters/badges.
URL hash incluye `&model=icon` o `&model=gfs`.

#### Fix

1. Convertir badge en `<div>` con 4 botones: ICON, GFS, ECMWF, JMA.
2. State `activeModel` en `interactive-map.ts` (default `best_match`).
3. Modificar `buildFieldUrl()` en `mapfields.ts` para aceptar `models=`.
4. Modificar `cachedFetch` para no compartir cache entre modelos
   (incluir `model` en la cache key).
5. Hash sync: añadir `&model=icon` al parse/serialize en `maphash.ts`.
6. Re-render rasters al cambiar de modelo (forzar `fieldGrid=null` +
   `setActiveLayer(activeLayer)`).

#### Acceptance

- Click en `GFS` cambia el badge a activo, refresca el field/wind con
  datos GFS, y la URL hash refleja `model=gfs`.
- Recargar con `&model=ecmwf` arranca con ECMWF activo.
- En forecast page, el badge "Modelos: ICON · GFS · ECMWF · JMA" sigue
  funcionando independiente (es informativo, no de selección).

#### Estimación

1 día. Toda la infra (`getModelDisagreement` ya usa `models=`) existe;
falta exponerla en el mapa.

---

### P1.2 — City pills con valor numérico permanente

#### Estado actual

Pills de ciudad existen (#170 los arregló) pero solo muestran el
*nombre*. El valor del field bajo la ciudad se ve solo on-hover via
tooltip.

#### Estado deseado

A zoom ≥ 7, cada pill muestra "Ciudad de México 24°" con el nombre y
el valor del campo activo (temp, humedad, presión, viento). zoom.earth
lo hace y permite leer el clima de 10 ciudades de un vistazo.

#### Fix

**Archivo**: `src/lib/interactive-map.ts`

```ts
// En refreshCityPills(), construir el label como:
const fieldVal = fieldGrid && fieldBounds
  ? bilerpValue(fieldGrid, FIELD_GRID_ROWS, FIELD_GRID_COLS,
                fieldBounds, city.lat, city.lng, frameIndex)
  : null;
const valStr = fieldVal !== null
  ? formatFieldValue(activeLayer, fieldVal)
  : '';
const label = valStr ? `${city.name}\n${valStr}` : city.name;
```

Y un nuevo helper:

```ts
function formatFieldValue(layer: string, v: number): string {
  if (layer === 'temperature') return `${Math.round(v)}°`;
  if (layer === 'humidity')    return `${Math.round(v)}%`;
  if (layer === 'pressure')    return `${Math.round(v)} hPa`;
  if (layer === 'wind')        return `${Math.round(v)} km/h`;
  return '';
}
```

Y en `refreshFieldGrid`, llamar `refreshCityPills()` al final para
re-pintar con los nuevos valores.

#### Acceptance

- A zoom 7+ sobre MX: las pills muestran nombre + valor en 2 líneas.
- A zoom ≤ 6: solo nombre (evitar saturación).
- Al cambiar de capa Temp → Humedad, los valores actualizan a `%`.
- Al togglear la overlay "Valores de etiquetas" (nueva, ver P1.3), se
  ocultan los valores y queda solo el nombre.

#### Estimación

½ día.

---

### P1.3 — Overlay "Valores de etiquetas" (toggleable)

#### Origen

zoom.earth tiene esta opción separada de "Etiquetas". Útil para
usuarios que quieren ver solo las ciudades sin el valor (e.g., para
captura limpia).

#### Fix

Añadir entrada al `overlayDefs[]`:

```ts
{
  id: 'cityValues',
  label: 'Valores de etiquetas',
  shortcut: 'E',
  isEnabled: () => cityValuesEnabled,
  setEnabled: (on) => { cityValuesEnabled = on; refreshCityPills(); },
},
```

Y en el render de la pill, condicionar el valor a `cityValuesEnabled`.

#### Acceptance

- Toggle B desactiva los valores numéricos de las pills sin esconder
  los nombres.
- Persistir el estado en localStorage opcional.

#### Estimación

1 hora. Es solo wiring.

---

### P1.4 — Sub-opciones siempre visibles bajo capa activa

#### Síntoma

`temp-sub-options`, `humidity-sub-options`, `pressure-sub-options`,
`wind-sub-options`, `satellite-sub-options` existen en el DOM
(confirmado por inspección JS) pero `visible: false` reportado para
todos aún cuando la capa correspondiente está activa.

Probable causa: `refreshXxxSubOptions()` corre antes de que `activeLayer`
quede seteado en el cold-load, y luego no se vuelve a llamar.

#### Fix

**Archivo**: `src/lib/interactive-map.ts`, en `setActiveLayer`:

```ts
async function setActiveLayer(id: string): Promise<void> {
  // ...lógica existente...
  activeLayer = id;
  refreshLayerButtons();
  // ya llama internamente a refreshTemp/Humidity/Pressure/Wind/SatelliteSubOptions
  // pero verificar que el orden sea: activeLayer = id; ANTES de los refresh.
}
```

Verificar que `refreshLayerButtons` no se llame con `activeLayer` stale.

#### Acceptance

- Cargar `#layer=temperature` muestra el grupo "Actual / Aparente /
  Bulbo húmedo" indentado bajo Temperatura.
- Cambiar a Humedad oculta el grupo de temp y muestra "Relativa /
  Punto de rocío".
- En satélite, muestra "GeoColor / Infrarrojo / Color real".

#### Estimación

½ día (más debugging que coding).

---

### P1.5 — Coords en formato DMS

#### Estado actual

`<div id="coords">` muestra `23.6, -102.5` (decimal).

#### Estado deseado

`23° 36' N, 102° 30' O` (DMS) como zoom.earth. Más cartográfico y
reconocible para usuarios mexicanos acostumbrados a mapas IGN.

#### Fix

**Archivo**: `src/lib/interactive-map.ts`, función que actualiza coords (buscar `coords.textContent`):

```ts
function formatDms(deg: number, posLabel: string, negLabel: string): string {
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  const label = deg >= 0 ? posLabel : negLabel;
  return `${d}° ${m.toString().padStart(2, '0')}' ${label}`;
}

// Al actualizar:
const text = `${formatDms(lat, 'N', 'S')}, ${formatDms(lng, 'E', 'O')}`;
coords.textContent = text;
```

#### Acceptance

- Hover sobre el mapa muestra coords en DMS.
- Sin negativos en el output (signo va al sufijo N/S/E/O).
- Mantener `tabular-nums` para que no salte al moverse.

#### Estimación

1 hora.

---

## 🟡 P1 — Pulido visual de chrome

### P1.6 — Compactar Fuentes / Configuración a iconos

#### Estado actual

Top-right de `/mapa` tiene dos pills grandes etiquetadas "Fuentes" y
"Configuración" — desperdicio de espacio visual.

#### Estado deseado

Columna derecha con iconos solos `ℹ` y `⚙` apilados, fondo translúcido,
~30px ancho cada uno. Igual estilo que zoom.earth.

#### Fix

**Archivo**: `src/components/InteractiveMap.astro` — convertir los
`<details>` de Fuentes y Configuración a botones-icono que abren
un popover, no pills inline.

```astro
<button
  class="absolute right-3 top-{N} z-10 w-9 h-9 rounded-full bg-white/90 dark:bg-gray-900/90 shadow flex items-center justify-center"
  aria-label="Fuentes de datos"
  data-popover="fuentes"
>ℹ</button>
```

Con un popover separado que toggle hacia la izquierda.

#### Acceptance

- Top-right muestra 4 iconos apilados verticalmente: 🔍 search, ⚙
  settings, ℹ info, ⬆ share. Cada uno `w-9 h-9 rounded-full`.
- Click expande popover hacia la izquierda con el contenido actual.
- Mobile: misma columna pero apilada arriba (no top-right que choca con
  el rail).

#### Estimación

1 día.

---

### P1.7 — Búsqueda como icono colapsable

#### Estado actual

Search input ocupa ~340px del top-right siempre visible. En MX-wide a
zoom 5, no estorba; a zoom de calle, sí estorba.

#### Estado deseado

Icono 🔍 colapsado que al click expande inline a 340px. Como zoom.earth.

#### Fix

Combinar con P1.6 — el icono 🔍 es uno más de la columna derecha.
Click → expande el input + autocomplete.

#### Acceptance

- Por defecto, top-right es columna de iconos 30px.
- Click 🔍 expande el input desde el icono hacia la izquierda con
  animación 200ms.
- Esc o click-outside colapsa.

#### Estimación

½ día. Va junto con P1.6.

---

## 🟡 P2 — Detalles finos (zoom.earth los tiene)

### P2.1 — Herramientas de medición

#### Origen

zoom.earth tiene 2 iconos dedicados: "Medir distancia" (línea) y
"Medir área" (polígono). Usuarios meteorológicos los usan para evaluar
tamaño de frente, distancia de huracán a costa, área de cobertura de
radar, etc.

#### Fix

Opción A — librería: `@maplibre/maplibre-gl-draw` + cálculo Vincenty/Shoelace.

Opción B — propia: ~120 LOC. Click acumula puntos; ESC cierra; resultado
en un pill flotante.

Recomendación: opción B para no añadir 200KB de bundle.

```ts
// src/lib/map/tools/measure.ts (nuevo)
export class MeasureTool {
  mode: 'distance' | 'area' | null = null;
  points: [number, number][] = [];
  layerId = 'measure-line';
  // ...
}
```

Helpers en `mapgeo.ts`:

```ts
export function haversineKm(a: [number,number], b: [number,number]): number;
export function shoelaceKm2(pts: [number,number][]): number;
```

UI: 2 iconos en columna derecha, click activa modo, click sucesivo
acumula puntos, ESC sale.

#### Acceptance

- Click "Medir distancia", click 3 puntos en el mapa: pill muestra
  "230 km · 2 segmentos".
- Click "Medir área", click 4+ puntos: pill muestra "1,250 km²".
- ESC limpia la medición.

#### Estimación

1.5 días.

---

### P2.2 — Viewport lock (`100vh`) elimina scrollbar

#### Síntoma

En `/mapa` hay scrollbar vertical visible — el body es más alto que
el viewport, dejando un void negro debajo del mapa.

#### Fix

**Archivo**: `src/pages/mapa.astro` o el container parent.

```astro
<main class="h-screen w-screen overflow-hidden">
  <InteractiveMap ... />
</main>
```

Y verificar que `BaseLayout` no fuerce `min-h-screen` sobre `<main>`
en `/mapa` específicamente.

#### Acceptance

- `/mapa` no tiene scrollbar vertical en desktop ni mobile.
- El mapa ocupa exactamente el viewport (menos la nav top).

#### Estimación

½ hora.

---

### P2.3 — Sistemas tropicales auto-disable

#### Síntoma

Checkbox "Sistemas tropicales" marcado por default (`checked: true`)
aún cuando NHC `CurrentStorms.json` reporta 0 tormentas activas. Confunde
porque el toggle no produce visible.

#### Fix

**Archivo**: `src/lib/interactive-map.ts`

```ts
// Al cargar storms data, si features.length === 0:
if (stormsData.features.length === 0) {
  tropicalEnabled = false;
  refreshOverlayCheckboxes();
}
```

#### Acceptance

- Sin tormentas activas: checkbox unchecked, no pinta nada.
- Con ≥1 tormenta: checkbox checked, pinta.
- Si una tormenta termina mid-session: re-evaluar al next refresh.

#### Estimación

½ hora.

---

### P2.4 — Mover "Capturar (antes)" a columna derecha (tools)

#### Estado actual

Botón "📸 Capturar (antes)" está en el rail izquierdo junto a las capas.
Conceptualmente es una herramienta global, no una capa.

#### Fix

Mover los 3 botones (Capturar / Ocultar / Limpiar) a la columna derecha
junto con medición + locate.

#### Acceptance

- "Capturar" deja el rail izquierdo limpio (solo capas + opacidad).
- Tools globales agrupados a la derecha.

#### Estimación

1 hora.

---

### P2.5 — Densidad de labels del basemap

#### Síntoma

Carto raster tiles a zoom 5 muestran ~30 labels con colisiones; zoom.earth
~12 sin colisiones (raster también pero con mejor selección).

#### Análisis

Carto Dark Matter and Voyager tiles son los más limpios. Verificar que
estamos usando `dark_all` (con labels) y no `dark_nolabels`. En light,
`voyager` da mejor jerarquía que `light_all`.

#### Fix

Cambiar a `voyager_labels_under` o `voyager_nolabels` + capa symbol
propia con `text-allow-overlap: false` y `symbol-z-order: source` por
ranking de población.

Alternativa: añadir un fade-out de labels < cierto rango con
`text-opacity` interpolation por zoom.

#### Acceptance

- A zoom 5 sobre MX: max 15 city labels visibles.
- A zoom 7: hasta 25.
- A zoom 9: cualquier ciudad >50k habitantes.

#### Estimación

1 día. Toca decisiones de diseño + curar la lista de ciudades.

---

### P2.6 — Botón "Animación de viento" separado de capa

#### Análisis

zoom.earth tiene "Animación de viento" como overlay independiente
(checkbox V) además de la capa Viento. Permite ver Temperatura +
animación viento al mismo tiempo.

Nuestro Viento es una `kind: 'particles'` exclusiva con las otras capas
(switch al activarla).

#### Fix

Convertir wind en una capa-superposición: cuando se activa una `field`
layer (Temp/Humedad/Presión), un toggle adicional permite añadir las
partículas de viento encima.

Esto requiere refactor en `setActiveLayer` para permitir N capas
field + 1 particles concurrentes.

#### Acceptance

- Activar "Temperatura" + toggle "Animación de viento" muestra ambos.
- Performance: las partículas siguen a 60 fps incluso con field activo.
- Toggle de overlay persiste en localStorage.

#### Estimación

2 días. Es un refactor no trivial del modelo de capas.

---

## 🟢 Lo que YA ganamos — no romper

Mantener:

- **16 overlays MX-únicos** (ver `PLAN_SUPERIORITY.md` y commits #177-#188).
- **Snapshot compare** "Capturar antes" — único en su categoría.
- **Multi-model disagreement** chip en `/forecast/`.
- **Climate anomaly** "-1.9° vs. promedio 11 años" — verificado funcionando.
- **Alertas personales** (🔔 botón en forecast).
- **/pregunta** NL router.
- **Atajos de teclado visibles** (chips `K`, `J`, `Y`…) — zoom.earth los esconde.
- **PWA install** prompt funcional.
- **Sin tracking, sin cookies** explícito.
- **Multi-overlay simultáneo** — overlays son independientes vs capas (zoom.earth también pero con menos opciones).

---

## Secuencia recomendada de PRs

### Semana 1 (P0)

1. **PR-A** (½ día): cold-load fix con `map.once('idle', …)` + backoff retry.
2. **PR-B** (½ día): leyenda horizontal flotante bottom-left.
3. **PR-C** (1.5 días): timeline rediseñada centrada bottom con 3 niveles.

→ Resultado: el sitio se ve y siente al nivel de zoom.earth en primer
   uso. Los 60% del gap visual cerrados.

### Semana 2 (P1)

4. **PR-D** (1 día): toggle de modelo NWP (ICON/GFS/ECMWF/JMA).
5. **PR-E** (½ día): city pills con valor numérico.
6. **PR-F** (1 hora): overlay "Valores de etiquetas".
7. **PR-G** (½ día): sub-opciones inline siempre visibles.
8. **PR-H** (1 hora): coords DMS.
9. **PR-I** (1 día): columna derecha de iconos (Fuentes/Settings/Search).

→ Resultado: sensación de producto pulido, no de prototipo.

### Semana 3 (P2)

10. **PR-J** (½ hora): viewport lock 100vh.
11. **PR-K** (½ hora): sistemas tropicales auto-disable.
12. **PR-L** (1 hora): mover Capturar a columna derecha.
13. **PR-M** (1.5 días): tools de medición distancia + área.
14. **PR-N** (1 día): curar densidad de labels del basemap.
15. **PR-O** (2 días, opcional): wind como overlay además de capa.

→ Resultado: detalles que zoom.earth tiene cerrados. Ningún gap visible
   en side-by-side.

---

## Métricas de éxito

Validar al cerrar cada fase con el mismo flujo de revisión Chrome:

| Métrica | Pre-P0 | Post-P0 | Post-P1 | Post-P2 | Target (zoom.earth) |
|---------|--------|---------|---------|---------|---------------------|
| Cold-load: campo visible en ≤3s | ❌ | ✅ | ✅ | ✅ | ✅ |
| Leyenda permanente visible | ❌ | ✅ | ✅ | ✅ | ✅ |
| Timeline visible al cargar | ❌ | ✅ | ✅ | ✅ | ✅ |
| Selector de modelo NWP | ❌ | ❌ | ✅ | ✅ | ✅ |
| City pills con valor | ❌ | ❌ | ✅ | ✅ | ✅ |
| Sub-opciones inline visibles | ❌ | ❌ | ✅ | ✅ | ✅ |
| Coords DMS | ❌ | ❌ | ✅ | ✅ | ✅ |
| Iconos derecha compactos | ❌ | ❌ | ✅ | ✅ | ✅ |
| Tools de medición | ❌ | ❌ | ❌ | ✅ | ✅ |
| Sin scrollbar en /mapa | ❌ | ❌ | ❌ | ✅ | ✅ |
| Densidad labels controlada | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ |
| **Overlays MX-únicos** | ✅ 16 | ✅ 16 | ✅ 16 | ✅ 16 | ❌ (zoom.earth ~7) |
| **Snapshot compare** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Model disagreement chip** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Climate anomaly** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Personal alerts** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **/pregunta NL router** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **PWA install** | ✅ | ✅ | ✅ | ✅ | ❌ |

Post-P2: paridad en chrome/UX, **superioridad absoluta en features**.

---

## Notas de arquitectura

- **No añadir API keys.** Open-Meteo / Carto / GIBS / RainViewer siguen
  siendo el stack. MapTiler sigue descartado.
- **No introducir backend.** Todo client-side; localStorage para
  preferencias.
- **No usar tracking/analytics.** Confirmado: pre-P2 no se introduce
  ningún script externo más allá de los actuales (Sentry opt-in, ya
  existente).
- **Tests Playwright** para cada PR de P0 (cold-load especialmente).
- **No tocar `PLAN_SUPERIORITY.md`** — es la roadmap original de features.
  Este documento es complementario y trata calidad/UX vs feature count.

---

## Apéndice: Screenshots de referencia

Capturas tomadas 2026-05-24 durante el review:

- Nuestro `/mapa` zoom 5: layer rail + 16 overlays visible, basemap dark
  Carto, sin field de temperatura pintado, sin timeline visible.
- zoom.earth `/maps/temperature/` zoom 5: temperature field continuo
  cubriendo MX-Texas-Caribe, timeline centrada abajo, leyenda
  horizontal abajo-izquierda, badge ICON/GFS abajo-derecha.
- Nuestro `/mapa` zoom 9 (CDMX): igual que zoom 5 — solo basemap, sin
  field. Reproducible al 100%.
- zoom.earth zoom 9 (CDMX): pill "Ciudad de México 24°" sobre la ciudad,
  field uniforme amarillo-naranja, todos los chrome elements visibles.
- Nuestro `/forecast/` CDMX: 23° sensación 21°, anomalía -1.9° vs 11
  años (27.0°), 12 hourly cards, alertas + favoritos visibles, mini-mapa
  embebido EN NEGRO (mismo cold-load bug).

# Plan: superar a zoom.earth en todo

Estado: **propuesto** · Actualizado: 2026-05-24

Después de 31 PRs alcanzamos **paridad funcional total** con zoom.earth
y los superamos en 5 áreas (dark theme, hover tooltip, sub-options de
Presión, VIIRS night lights, privacidad). Quedan 5 brechas estructurales
y ~8 oportunidades para diferenciarnos.

Este documento es la hoja de ruta para **ser superiores en todo**, no
sólo en algo.

## Resumen ejecutivo

| Fase | Objetivo | Duración est. | Riesgo |
|---|---|---|:-:|
| **F1** Cerrar brechas estructurales | Match exacto en lo que aún somos inferiores | 4-8 semanas | medio |
| **F2** Diferenciar lo que ya hacemos mejor | Doblar la ventaja en features donde ya ganamos | 2-3 semanas | bajo |
| **F3** Features nuevas que zoom.earth no tiene | Liderazgo, no sólo paridad | 4-12 semanas | medio-alto |

Total: **3-6 meses** de trabajo enfocado para liderazgo claro.

---

## Fase 1: cerrar las 5 brechas estructurales

### 1.1 Field resolution — alcanzar densidad zoom.earth (~4 km)

**Estado actual**: 176 puntos Open-Meteo, ~5° por celda, bumps sutiles
**Objetivo**: que el field se vea **idéntico** a zoom.earth o mejor

Opciones (ordenadas por viabilidad):

**A) Aumentar a 1000 puntos via bulk API** (1-2 días)
- Open-Meteo's bulk endpoint acepta hasta 5000 ubicaciones por request
- Subir a 32×24 = 768 puntos (~2°/celda)
- Riesgo: latencia de la fetch crece de ~600ms a ~3s
- Mitigación: streaming partial render, mostrar primero la grid sparse y refinar
- Bono: alpha-cancel rápido al cambiar de capa

**B) Backend personalizado de tile pre-rendering** (2-3 semanas)
- GH Action que cada hora descarga GRIB2 de Open-Meteo ECMWF, procesa con
  Python (xarray + numpy), renderea tiles PNG en pirámide z=0..7
- Sirve desde `/tiles/temp/{z}/{x}/{y}.png` (GitHub Pages estático)
- Resolución equivalente o superior a zoom.earth
- Costo: ~50MB de tiles por capa × 7 capas × 24 frames = 8.4 GB/día generados;
  CDN GitHub Pages soporta el throughput
- Riesgo: complejidad pipeline + tiempo build

**C) WebGL field renderer** (1 semana)
- Reemplazar el bicubic en canvas con un fragment shader que toma el grid
  como textura uniforme y calcula colores en GPU por píxel
- Mismo grid de 176 pts pero sin quantization de raster intermedio
- Más rápido (~3ms vs 22ms actual) y resolución infinita
- Riesgo: shader complexity, browser compatibility

**Recomendación**: A + C en paralelo. C mejora la calidad sin más datos;
A duplica la densidad. Combinados igualan zoom.earth.

---

### 1.2 Cold-load basemap (#124) — eliminar el "blank canvas first paint"

**Estado actual**: 10+ PRs intentaron, MapLibre raster source race
**Objetivo**: primer paint **sin** click del usuario, igual que zoom.earth

Opciones:

**A) Switch a vector basemap** (3-5 días, recomendado)
- MapTiler Cloud free tier: 100k tile loads/mes (suficiente para MX traffic)
- Protomaps PMTiles single-file: self-hosted, sin límites, ~200 MB total
- Vector tiles tienen mejor first-paint behavior porque MapLibre los renderea sin la image-load race
- Bono: zoom infinito, labels nativos legibles a cualquier zoom, dark/light real (no swap de tiles)

**B) Snapshot estático + lazy MapLibre hydrate** (1 semana)
- En build time: render PNG snapshot del centro MX dark + light
- Mostrarlo como `<img>` mientras MapLibre carga en background
- Hydrate cuando el style.load fire — image swap suave
- Mantiene raster basemap; soluciona síntoma no causa raíz

**C) Pre-render server-side** (2 semanas, complejo)
- Edge function que sirve un HTML con el primer paint ya en `<canvas>`
- Hydrate en cliente

**Recomendación**: A. MapTiler Cloud es el path de menor fricción. El swap dark/light se vuelve trivial (un solo style URL con `?style=streets-night`).

---

### 1.3 Satélite + nubes combinados — match "Precipitación" de zoom.earth

**Estado actual**: GIBS GOES-East IR (grayscale), sin overlay de nubes separado
**Objetivo**: Vista satellite que muestre nubes + lluvia al mismo tiempo, color real

Implementación (1 semana):
- Reemplazar GIBS layer ID `GOES-East_ABI_Band13_Clean_Infrared` con
  `GOES-East_ABI_GeoColor` (true color, ya en sources/nasa-gibs.ts)
- Agregar overlay translucent `cloud_cover` de Open-Meteo:
  - Sample en grid 176 puntos
  - Render como raster grayscale alpha=cloud%/100
  - Toggle "Nubes" en Superposiciones (shortcut U)
- Modo "Precipitación" combinado: activa satellite color + cloud overlay + radar simultáneamente con un solo toggle

Bono: "GeoColor" tiene night-side enhancement (luces ciudades naturales),
matchea zoom.earth perfectamente.

---

### 1.4 App móvil nativa

**Estado actual**: PWA con sw.js de isolation pero sin install prompt
**Objetivo**: presencia en App Store + Google Play

Opciones:

**A) PWA install prompt + manifest** (2 días, lowest cost)
- Manifest icons completos (192, 512, maskable)
- `beforeinstallprompt` con custom UI nativa
- Add to Home Screen Safari
- No es "app store" pero es 80% de la UX nativa

**B) Capacitor wrapper** (1 semana)
- Wrap el sitio Astro en una shell iOS/Android nativa
- Publicar en TestFlight + Play Console internal
- Mantenimiento: actualizar shell cuando cambian permisos/versiones

**C) React Native app dedicada** (1-3 meses)
- Reescritura completa con código compartido (lib/)
- Performance superior pero costo alto

**Recomendación**: A primero (PWA polish). B sólo si validamos demanda real.

---

### 1.5 PRO tier / cuentas

**No buscar**. Diferenciador: privacidad-first sin tracking. Es nuestro
ángulo competitivo, no replicarlos en monetización.

---

## Fase 2: doblar ventaja donde ya ganamos

### 2.1 Hover tooltip mejorado (zoom.earth no tiene)

- Mostrar **3 métricas simultáneas** en el cursor: temp + humedad + viento
- Tooltip con icono direccional para viento (flecha)
- Show forecast confidence band si hay datos de ensemble
- Sticky on touch para mobile

Esfuerzo: 1 semana.

---

### 2.2 Sub-options completas en todas las capas

Estado actual: Temp/Hum/Pres/Wind tienen sub-options. Falta:

- **Radar**: Reflectividad (default) / Velocidad / Polarimétrico (si disponible)
- **Sol**: Posición / Sunrise-sunset isolines / UV index field
- **Satélite**: IR (Band 13) / GeoColor / Day-Night Band / True color MODIS

Open-Meteo tiene `uv_index`, `is_day`, `weather_code`. NASA GIBS tiene
las 4 sub-options de satellite ya listadas.

Esfuerzo: 1 semana.

---

### 2.3 Theme dark/light dinámico mejorado

- Auto-switch por hora local (light durante día, dark de noche)
- High-contrast option para accesibilidad
- Color-blind safe palettes (Viridis, Cividis) seleccionables en Settings

Esfuerzo: 3 días.

---

### 2.4 Overlays adicionales únicos

Items que zoom.earth no tiene:

- **Avisos SMN georeferenciados** sobre el mapa (no sólo RSS)
- **Estaciones automáticas SMN** con valores actuales (puntos clickeables)
- **Sismos USGS** (M>3.5 últimas 24h) — relevante para MX
- **Calidad de aire** (CONAGUA/SEMARNAT) sobre zonas urbanas
- **Pronóstico marítimo** (oleaje, marea) para Pacífico y Caribe

Esfuerzo: ~2 días cada uno, 2 semanas total.

---

## Fase 3: features nuevas para liderazgo

### 3.1 AI-powered consultas naturales

"¿Va a llover en CDMX el viernes?" → query parseada → forecast resumido
en español, basado en datos reales del map.

- Implementación: Cliente-side LLM (WebLLM) o llamada a API
- Esfuerzo: 2 semanas

---

### 3.2 Storm tracker con histórico

- IBTrACS data (NOAA, libre): todas las tormentas que tocaron MX desde 1851
- Toggle "Histórico" en el panel de Tropical
- Cono de probabilidad ensemble cuando hay storm activa
- Esfuerzo: 1 semana

---

### 3.3 Comparación temporal "antes/después"

- Slider tipo "hace 24h vs ahora" — splitscreen del mismo mapa
- Útil para comparar evolución de tormentas, frentes fríos, etc.
- Esfuerzo: 1 semana

---

### 3.4 Multi-model selector con disagreement view

- En lugar de "best match", expose ICON / GFS / ECMWF / GEM
- "Disagreement" view: muestra dónde los modelos divergen más (confianza
  baja del pronóstico)
- Open-Meteo expose models param directamente
- Esfuerzo: 1 semana

---

### 3.5 Personal weather monitoring

- "Cuando llueva en Tlalpan, alérteme" — set alerts on map regions
- Web Push API para notificaciones
- Sin servidor: cron-style check via Service Worker
- Esfuerzo: 2-3 semanas

---

### 3.6 Climate baseline / anomaly visualization

- "Esta temperatura está 5°C por encima del promedio histórico para mayo"
- ERA5 reanalysis baseline (NOAA Copernicus, libre)
- Color ramp de anomalía sobre el campo
- Esfuerzo: 2 semanas (requiere baseline dataset preprocessing)

---

### 3.7 Webcam integration

- Live webcams desde aeropuertos MX (libre via skyscraper feeds)
- Pin sobre cada aeropuerto, click → video embed
- Reality check para el forecast: "lo que de verdad se ve ahora"
- Esfuerzo: 1 semana

---

### 3.8 Beach + lake conditions

- Condiciones de playa: oleaje, viento, UV, marea (NOAA + Open-Meteo Marine)
- Lagos relevantes (Chapala, Pátzcuaro): temperatura agua + oleaje
- Esfuerzo: 1.5 semanas

---

## Roadmap propuesto

**Q3 2026 (jul-sep) — Cerrar brechas**
- [ ] 1.1 A: bump field a 768 puntos · 2 días
- [ ] 1.1 C: WebGL field renderer · 1 semana
- [ ] 1.2 A: MapTiler vector basemap · 1 semana
- [ ] 1.3: GeoColor satellite + cloud overlay · 1 semana
- [ ] 1.4 A: PWA polish · 2 días
- [ ] 2.1: Hover tooltip multi-métrica · 1 semana
- [ ] 2.2: Sub-options en Radar / Sol / Satélite · 1 semana

Subtotal: ~5-6 semanas

**Q4 2026 (oct-dic) — Diferenciar**
- [ ] 2.3: Theme dynamic + color-blind palettes · 3 días
- [ ] 2.4: 5 overlays únicos MX (avisos, estaciones SMN, sismos, AQ, marítimo)
- [ ] 3.1: AI consultas naturales · 2 semanas
- [ ] 3.2: Storm tracker histórico · 1 semana

Subtotal: ~5 semanas

**Q1 2027 (ene-mar) — Liderar**
- [ ] 3.3: Comparación temporal antes/después · 1 semana
- [ ] 3.4: Multi-model disagreement view · 1 semana
- [ ] 3.5: Personal alerts · 2-3 semanas
- [ ] 3.6: Climate anomaly visualization · 2 semanas
- [ ] 3.7: Webcam integration · 1 semana
- [ ] 3.8: Beach + lake conditions · 1.5 semanas

Subtotal: ~9-10 semanas

**Total: ~5 meses de trabajo enfocado para superioridad completa.**

---

## Riesgos

1. **MapTiler free tier insuficiente** — si crecemos a 100k+ pageviews/mes, necesitamos paid tier (~$25/mes) o switch a self-hosted Protomaps.
2. **Open-Meteo rate limits con 768 puntos** — testear staging primero; rollback a 176 si hay 429s.
3. **App Store approval** — requiere account paid Apple/Google ($99/año + $25 una vez); validar demanda antes.
4. **WebGL field shader complexity** — testing exhaustivo en Safari + Firefox iOS antes de ship.
5. **AI features** — requiere validar UX (cuánto vale la pena un chat sobre clima vs. simplemente buscar la ciudad).

---

## Métricas para declarar éxito

Después de F1 (cerrar brechas):
- Side-by-side blind test: 60%+ usuarios prefieren nuestro UX vs zoom.earth
- Cold-load first paint < 500ms (vs ~2-5s actual)
- Field smoothness: indistinguible de zoom.earth en blind test

Después de F2+F3 (diferenciar + liderar):
- 80%+ preferencia en blind test
- Listado en weather-comparison sites como "best free Mexico-focused weather"
- Backlinks orgánicos desde sites internacionales (currently 0)

---

## Próximo paso inmediato

Si arrancáramos hoy, la secuencia óptima es:
1. **1.1 A (bump a 768 puntos)** — 1 día, impact inmediato visible
2. **1.2 A (MapTiler vector basemap)** — 1 semana, resuelve cold-load + dark/light
3. **1.4 A (PWA polish)** — 2 días, ROI alto para mobile

Estos 3 items (~2 semanas) cierran los gaps más visibles. El resto del
plan es expansión, no defensa.

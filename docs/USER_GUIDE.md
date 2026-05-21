# User Guide

A walkthrough of what users can do on the site, the public URL schemas (for sharing/bookmarking), accessibility behaviors, and data-source attributions.

## Routes overview

| Route | What it is |
|---|---|
| `/` | **Home** — preset Mexican-city forecast cards, search box, "use my location", and a teaser linking to the interactive map. |
| `/forecast` | **Forecast detail** — shareable, client-rendered detail page driven by URL query params. |
| `/mapa` | **Interactive weather map** — MapLibre GL basemap, location pins, layer rail, opacity slider, legend, timeline scrubber + playback, shareable view state. |
| `/privacidad` | **Privacy/legal**. |
| `/rss.xml` | **RSS 2.0 feed** of SMN weather alerts (regenerated hourly). |
| `/sitemap.xml` | Sitemap. |

## User journeys

### Browse the city forecasts (home → forecast detail)

1. Open `/` — preset Mexico cities are listed with current temperature, condition, hi/lo, rain probability, and wind.
2. Click a card → expanded inline "quick peek" with the extra variables (UV, humidity, pressure, sunrise/sunset, etc.) plus a "Ver pronóstico completo →" link.
3. The full-page detail is `/forecast?lat=<n>&lng=<n>&name=<text>&tz=<TZ>` — bookmarkable, shareable, and crawlable.

### Find any place (search or "use my location")

1. From the home page or `/mapa`, type a place name into the search box. Debounced Open-Meteo geocoding returns candidate matches.
2. Press Enter (or click the first result) to navigate to `/forecast` for that location.
3. Click **"📍 Mi ubicación"** to use the browser's Geolocation API. Permission denials are non-blocking and show a small status message; search stays available.

### Explore the interactive map (`/mapa`)

1. The map opens centred on Mexico, with **pins** for preset cities and (after a search/geolocate) a single user pin. Click a pin → popup → "Ver pronóstico completo →" deep-link to `/forecast`.
2. Use the **layer rail** (top-left) to switch the active weather layer. Only one weather layer is active at a time; **Base** turns them all off.
3. When a weather layer is active, the **opacity slider** appears and changes the layer's transparency live. Each layer has a sensible default opacity (radar 80%, satellite 100%, temperature/humidity/pressure 65–75%).
4. The **legend** (left rail) reflects the active layer:
   - Radar: Ligera / Moderada / Intensa / Nieve.
   - Satellite: no intensity legend (it's imagery).
   - Temperature / Humidity / Pressure: colour ramp with stop labels.
5. The **timeline scrubber** (bottom-centre) appears whenever a weather layer with a time axis is active. Use ‹ / › to step a frame, drag the range, or press ▶ to play (loops with wrap). Pause with ⏸ or by interacting with prev/next/range.
6. **Sharing / bookmarking**: the URL hash updates as you pan, zoom, change layer, and scrub. Copy-paste the URL to share the exact view + frame; reloading restores it.

## Public URL schemas

### `/mapa#view=<lat>,<lng>,<zoom>z&layer=<id>&t=<ISO>`

| Param | Format | Meaning |
|---|---|---|
| `view` | `<lat>,<lng>,<zoom>z` (e.g. `19.43,-99.13,6.5z`) | Map centre + zoom. Validated; out-of-range values fall back to the default Mexico view. |
| `layer` | one of `base`, `radar`, `satellite`, `temperature`, `humidity`, `pressure`, `wind`, `sunlight` | Active weather layer; unknown ids fall back to `base`. |
| `t` | ISO timestamp (e.g. `2026-05-19T13:00:00.000Z`) | Selected timeline frame; the nearest frame is restored on load. Omitted when `layer=base`. |

Example: `https://artemiop.com/mexico-weather/mapa#view=19.43,-99.13,6.5z&layer=radar&t=2026-05-19T13:00:00.000Z`.

### `/forecast?lat=&lng=&name=&tz=`

| Param | Format | Meaning |
|---|---|---|
| `lat` | number in [-90, 90] | Latitude. |
| `lng` | number in [-180, 180] | Longitude. |
| `name` | URL-encoded text | Display name (UTF-8). |
| `tz` | IANA TZ id (e.g. `America/Mexico_City`); optional | Falls back to Open-Meteo's `auto` if absent or invalid. |

## Accessibility

- **Layer rail buttons** are real `<button aria-pressed>` elements with visible `focus-visible` rings. Keyboard users can Tab through them.
- **Map** has `role="application"` + an `aria-label`; MapLibre's `NavigationControl` provides keyboard pan/zoom.
- **Status messages** (`#mapmsg`) use `aria-live="polite"` so transient errors ("Capa no disponible", "No se pudo obtener tu ubicación", etc.) are announced without interrupting reading flow.
- **Timeline timestamp** (`#tl-time`) uses `aria-live="polite"` + `aria-atomic="true"` so scrubbing announces the new frame time.
- **`prefers-reduced-motion: reduce`** disables timeline autoplay (the ▶ button is disabled and labelled accordingly); manual prev / next / range scrubbing still works. MapLibre's `flyTo` animations are also suppressed under reduced motion.
- **Spanish-first**: every UI string is Spanish by default; English strings exist in the i18n table for future routing.
- **XSS-safe**: all dynamic strings injected into popups, legends, and labels pass through an HTML-escape helper.

## Responsive behavior

The site is mobile-first and tested at four representative breakpoints. There are no hard `min-width` media queries to "switch into" desktop — layout adapts continuously via Tailwind's responsive utilities and CSS grid.

| Breakpoint | Width | Reference device | Layout traits |
|---|---|---|---|
| **mobile** | 375–640 px | iPhone SE, modern Android phones in portrait | 1-column card grid; search input + "Mi ubicación" stack vertically on the narrowest widths; hero typography scales down (`text-5xl → text-4xl`); top nav stays in the upper-left corner as a thin link row; theme toggle floats top-right; feedback FAB floats bottom-right. |
| **tablet** | 641–1023 px | iPad portrait, Surface Go | 2-column card grid; search + "Mi ubicación" share a single row; the `/mapa` layer rail remains a vertical sidebar but takes less horizontal share of the viewport; hourly cards on `/forecast` scroll horizontally with a visible scrollbar. |
| **laptop** | 1024–1535 px | most laptops | 3-column card grid; map page uses the full viewport for the canvas with sidebar rail; forecast detail panels (Viento / Índice UV / Cielo y aire) align side-by-side. |
| **desktop** | ≥ 1536 px | external monitors | Same as laptop with a wider content `max-width` cap on `/` and `/forecast` (centered with side gutters); `/mapa` continues to occupy the full width because the map IS the page. |

### Per-page responsive notes

- **`/` (home)**
  - Card grid: `grid-cols-1` (mobile) → `grid-cols-2` (≥ `sm`) → `grid-cols-3` (≥ `lg`).
  - The 6th tile is always the "Más ciudades próximamente / Sugerir ciudad →" placeholder; it stays in flow at every breakpoint.
  - "Tus lugares" only renders when the user has favorites; on mobile it sits between the SMN alerts banner and the preset grid.
  - The map teaser is full-width at every breakpoint; on wide viewports a soft 2xl border-radius and inset reads as a card on the dark canvas.
- **`/forecast`**
  - 48-h hourly row is always `overflow-x: auto`; the row keeps a fixed card height and never wraps.
  - 7-day rows are full-width; the gradient temperature bar reflows to the full container width so it always reads at a glance.
  - "Detalle" panels: stack vertically on mobile, then `grid-cols-3` from `md:` upward.
- **`/mapa`**
  - The MapLibre canvas always fills 100 % of the viewport behind the absolute-positioned controls.
  - Layer rail keeps the same vertical layout from mobile to desktop; mobile users tap, desktop users hover-then-click. No collapse-to-burger.
  - Timeline scrubber stays bottom-center at all widths.
  - Opacity slider and legend sit on the left, just under the layer rail, so they don't fight the timeline for the bottom of the screen.
- **`/privacidad`**
  - Long-prose layout with a single readable column (`max-w-prose` style); identical at every breakpoint apart from the global `max-w` cap.

### Things that intentionally don't change

- **Spanish-first**: all viewports show the same Spanish strings; no locale-by-viewport switch.
- **Dark mode**: same colour palette at every breakpoint; theme toggle visible at every breakpoint.
- **Map controls** (zoom +/−): MapLibre's `NavigationControl` placement is fixed and never collapses, even on mobile.

### Known responsive gaps (not yet bugs but worth noting)

- On viewports < 1024 px the top nav (`Inicio · Mapa`) is just a thin line of links in the upper-left corner; it does not act as a sticky topbar. Bookmark this if you intend to scroll deep on a long forecast — your only way back to the home page is the `← Volver al inicio` link at the very top of `/forecast` and `/privacidad`.
- Below 480 px the search input's placeholder text (`Buscar cualquier ciudad o lugar…`) gets truncated with an ellipsis; functional but tight.

## Failure modes (non-blocking by design)

- **Geolocation denied / unavailable** → a small message ("No se pudo obtener tu ubicación."); search remains usable.
- **Geocoding network failure** → in-place "Sin resultados para «…»" or generic load-error message; nothing crashes.
- **Weather layer source unreachable** (RainViewer manifest, Open-Meteo grid, or tile fetch) → "Capa no disponible" message, layer reverts to **Base**, the rest of the map keeps working.
- **Invalid URL hash** → silently falls back to the default view (no crash).
- **Rapid pan with an active field layer** → in-flight requests are cancelled via `AbortController`; only the latest viewport's result lands.

## Data sources & attributions

- **OpenStreetMap** — basemap raster tiles. © OpenStreetMap contributors.
- **RainViewer** — radar + satellite-IR frames and tiles. © RainViewer.
- **Open-Meteo** — keyless gridded forecast (temperature, humidity, pressure, wind). © Open-Meteo.
- **SMN / CONAGUA** — weather advisory RSS used for the build-time alert feed at `/rss.xml`.
- **NASA GIBS** — referenced in the design for future satellite layers; not yet a runtime data source.

All sources are public, keyless, and CORS-enabled. The site ships zero secrets and runs as a static GitHub Pages deployment.

## Known limitations / deferrals

These are intentional scope boundaries, not bugs:

- **Wind layer under `prefers-reduced-motion: reduce`** falls back to static circle markers (no animated particles).
- **Field layers (temperature/humidity/pressure)** use a coarse 8×6 viewport-aligned grid. Adequate for country-level views; finer resolution is a polish item.
- **Time label** in the timeline is formatted in `es-MX` locale. Multi-locale time formatting is a non-goal for v1.
- **Field-layer playback animation** uses simple frame swaps without preloading; preloading/caching is a polish item.
- **Particle trails / geographic-accurate advection** are a polish item — the v1 wind particle system does not yet render trails.

## Related docs

- **E2E user-journey reference** (selectors, journey-by-journey Playwright drives, network mocks, coverage matrix): [`USER_JOURNEYS.md`](USER_JOURNEYS.md)
- **Design spec** (engineering): `docs/superpowers/specs/2026-05-18-weather-maps-design.md`
- **Implementation plans** (one per slice): `docs/superpowers/plans/2026-05-1[68-9]-weather-maps-slice-*.md`
- **Rich location forecast spec**: `docs/superpowers/specs/2026-05-16-rich-location-forecast-design.md`
- **Roadmap**: [`ROADMAP.md`](../ROADMAP.md)
- **Setup**: [`SETUP.md`](../SETUP.md)

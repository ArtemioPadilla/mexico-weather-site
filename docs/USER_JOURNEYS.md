# User Journeys (e2e test reference)

A comprehensive inventory of every user journey on the site, written to drive Playwright e2e tests — including future tests authored via the Playwright MCP. Each journey lists its goal, preconditions, concrete Playwright-shaped steps, expected outcomes, and which existing test (if any) covers it.

This is the **test-author's reference**. For the end-user-facing tour, see [`USER_GUIDE.md`](USER_GUIDE.md).

## Conventions used in this doc

- Selectors prefer **stable IDs** (`#mapq`, `#layerbtn-radar`, `#tl-range`, etc.). When an ID isn't available, prefer `page.getByRole(...)` / `page.getByLabel(...)` / `page.getByPlaceholder(...)` over CSS class names.
- The site is **Spanish-first**: text-based selectors must match `es` strings (`'Usar mi ubicación'`, `'Capa no disponible'`, etc.). The canonical strings live in `src/i18n/ui.ts`.
- The Playwright config sets `baseURL` to include the site base path. All `page.goto(...)` calls use **relative paths** (e.g. `'mapa/'`, `'forecast/?lat=…'`, `'privacidad/'`) — never absolute URLs.
- Existing test conventions and reusable network-mock helpers live in `e2e/helpers.ts`.

## External network endpoints (all keyless)

Every endpoint must be mocked in tests via `page.route(...)` for determinism. None require an API key.

| Endpoint | Used by | Mock pattern |
|---|---|---|
| `https://geocoding-api.open-meteo.com/v1/search?...` | Search box (home + map) | `**://geocoding-api.open-meteo.com/**` — see `mockOpenMeteo()` in `e2e/helpers.ts` |
| `https://api.open-meteo.com/v1/forecast?...` | City cards, `/forecast` detail, field layers (temp/humidity/pressure), wind layer | `**://api.open-meteo.com/**` (catch-all) or `**/api.open-meteo.com/v1/forecast**` (path) or `/api\.open-meteo\.com\/v1\/forecast.*wind_speed_10m/` (wind-only regex) |
| `https://api.rainviewer.com/public/weather-maps.json` | Map: radar + satellite manifest | `**/api.rainviewer.com/public/weather-maps.json` |
| `https://tilecache.rainviewer.com/**` | Map: radar + satellite tile fetches | `**/tilecache.rainviewer.com/**` — fulfill with a 1×1 transparent PNG |
| `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | Map: basemap tiles | `**/tile.openstreetmap.org/**` — fulfill with a transparent PNG (or let through; tile failure is non-blocking) |
| `navigator.geolocation` (browser API) | Search-or-locate, map locate | Use Playwright `context.grantPermissions(['geolocation'])` + `context.setGeolocation({...})`, or stub `geolocation.getCurrentPosition` via `addInitScript` |

Reusable fixtures in `e2e/fixtures/`: `geocode.cdmx.json`, `forecast.cdmx.json` (Open-Meteo replies for CDMX). New layer tests typically inline-define their mocks — see existing `e2e/mapa.spec.ts` for the pattern.

## Routes overview

| Route | File | Description |
|---|---|---|
| `/` | `src/pages/index.astro` | Home — preset city cards, search, geolocate, favorites, map teaser, alerts, feedback FAB |
| `/forecast/?lat=&lng=&name=&tz=` | `src/pages/forecast.astro` | Shareable forecast detail; client-rendered from URL params |
| `/mapa/` | `src/pages/mapa.astro` | Interactive weather map (MapLibre + 8 layers + timeline) |
| `/privacidad/` | `src/pages/privacidad.astro` | Privacy/legal page |
| `/rss.xml` | `src/pages/rss.xml.ts` | Build-time SMN alerts RSS 2.0 feed |
| `/sitemap.xml` | `src/pages/sitemap.xml.ts` | Sitemap |

Every page wraps in `BaseLayout` (`src/layouts/BaseLayout.astro`), which provides:
- A top nav with `Inicio` (→ `/`) and `Mapa` (→ `/mapa`) links
- Anti-FOUC theme bootstrap (inline script reads `localStorage.theme`)
- A scoped service worker registration (idempotent; no-op on failure)
- Theme toggle button `#theme-toggle-btn`
- Feedback FAB button `#secid-report-btn` (and `#secid-report-modal`)

---

# Selector palette (cheat sheet)

Stable IDs you can rely on across all journeys:

### Home (`/`)
| ID | What it is |
|---|---|
| `#q` | Search input (combobox role; `aria-controls="ac"`) |
| `#ac` | Autocomplete listbox |
| `#qmsg` | Search status message (`aria-live="polite"`) |
| `#geo` | "Usar mi ubicación" button |
| `#js-updated-at` | Last-refreshed timestamp |
| `#preset-grid` | Container for the 5 preset city cards |
| `#preset-data` | Inline JSON `<script>` with the preset list (data inspectable from page) |
| `#fav-section` | Favorites section (hidden until at least one fav exists) |
| `#fav-grid` | Favorites cards container |
| `#fav-msg` | Favorites SR-only status message |

### Forecast (`/forecast`)
| ID | What it is |
|---|---|
| `#fc-empty` | Empty state (shown when no `lat`/`lng` in query) |
| `#fc-status` | Loading / error status (`aria-live="polite"`) |
| `#fc-root` | Rendered forecast sections container (hidden until populated) |
| `#fc-fav` | Star button for "add to favorites" (`aria-pressed`) |

### Mapa (`/mapa`)
| ID | What it is |
|---|---|
| `#map` | The MapLibre map container (`role="application"`) |
| `#mapq` | Map search input |
| `#maploc` | Map "Mi ubicación" button |
| `#mapmsg` | Non-blocking status banner (`aria-live="polite"`) |
| `#layerbtns` | Layer-rail button container |
| `#layerbtn-base` / `#layerbtn-radar` / `#layerbtn-satellite` / `#layerbtn-temperature` / `#layerbtn-humidity` / `#layerbtn-pressure` / `#layerbtn-wind` / `#layerbtn-sunlight` | Layer buttons (`aria-pressed`) |
| `#opacitywrap` | Opacity-slider wrapper (hidden when active layer kind is `base`) |
| `#opacity` | Opacity range input (0–100) |
| `#legend` | Legend list (hidden when no legend applies) |
| `#timeline` | Timeline scrubber bar (`role="group"`, hidden when no timeline applies) |
| `#tl-prev` / `#tl-next` | Timeline step buttons |
| `#tl-play` | Timeline play/pause (`aria-pressed`; `disabled` under `prefers-reduced-motion`) |
| `#tl-range` | Timeline range input (max = `tlFrames.length - 1`) |
| `#tl-time` | Current frame timestamp label (`aria-live="polite"`, `aria-atomic="true"`) |

### Feedback FAB / Theme toggle (any page)
| ID | What it is |
|---|---|
| `#secid-report-btn` | Floating "Reportar" button |
| `#secid-report-badge` | Error-count badge (hidden when 0) |
| `#secid-report-modal` | Modal dialog (carries i18n strings + diagnostics meta in `data-*`) |
| `#secid-report-title` / `#secid-report-description` / `#secid-report-type` | Modal form fields |
| `#secid-report-close` | Modal close button |
| `#theme-toggle-btn` | Theme cycle button (Sistema → Claro → Oscuro) |

# Existing test coverage at a glance

| File | Tests | Total |
|---|---|---|
| `e2e/home.spec.ts` | loads w/ heading + 200; 5 preset cards; SMN alert link; footer privacy link | 4 |
| `e2e/search.spec.ts` | typing → autocomplete → navigate to `/forecast`; `/forecast` renders sections from params | 2 |
| `e2e/favorites.spec.ts` | star on detail → appears in "Tus lugares" → persists → remove hides section | 1 |
| `e2e/theme.spec.ts` | no-FOUC; toggle cycles + applies `.dark`; persists across reload | 3 |
| `e2e/mapa.spec.ts` | map + search visible; radar + legend; satellite (no legend); timeline scrubs; temperature; humidity; pressure; wind; sunlight | 9 |
| `e2e/privacy.spec.ts` | renders w/ heading; no cookies/tracking; source-attribution links | 3 |
| **Total** | | **22** |

Journeys flagged **NOT YET COVERED** below are candidates for new tests.

---

# Journeys by route

The journey ID format is `<route>-<n>`. Each block has the same structure so a test-authoring agent can templatise.

## Home (`/`)

### `home-1` — Home page loads, heading + nav + preset grid visible
- **Goal**: smoke check that `/` returns 200 and the basic skeleton is rendered.
- **Preconditions**: Open-Meteo mocked (cards refresh on load). No favorites in localStorage.
- **Steps**:
  1. `const res = await page.goto('')`
  2. `expect(res?.status()).toBe(200)`
  3. `await expect(page.getByRole('heading', { level: 1, name: /Clima México/ })).toBeVisible()`
  4. `await expect(page.locator('#preset-grid > *')).toHaveCount(5)`
  5. `await expect(page.getByRole('navigation')).toBeVisible()` — top nav present
- **Failure modes**: 404, missing cards, hydration failure (no JS).
- **Covered by**: `e2e/home.spec.ts` (`loads with 200 and the Clima México heading`, `renders the 5 preset city cards`).

### `home-2` — Search a place and navigate to `/forecast`
- **Goal**: combobox autocomplete + selection → URL navigation.
- **Preconditions**: `mockOpenMeteo(page)` (returns CDMX geocode fixture).
- **Steps**:
  1. `await page.goto('')`
  2. `await page.locator('#q').fill('ciudad')`
  3. Wait for `aria-expanded="true"` on `#q` (the 300 ms debounce + the fetch).
  4. `await expect(page.locator('#ac > li')).toHaveCountGreaterThan(0)`
  5. Click the first option (`#ac > li:nth-child(1)`).
  6. `await page.waitForURL(/\/forecast\/\?lat=.+&lng=.+/)`
  7. `await expect(page.locator('#fc-root')).toBeVisible()` (after the forecast load — see `forecast-1`).
- **Failure modes**: geocode network error → `#qmsg` shows; no results → "Sin resultados para…" in `#qmsg`.
- **Covered by**: `e2e/search.spec.ts` (`typing in the combobox shows autocomplete options and selecting one navigates to /forecast`).

### `home-2a` — MX alias resolution in autocomplete
- **Goal**: typing a common MX alias (e.g. `CDMX`, `DF`, `Méx`, `Mexico City`) resolves to the canonical entry via `src/data/mx-places.ts` (`resolveMxAlias` + `normalizeMx`), which is then merged into the Open-Meteo result set.
- **Preconditions**: `mockOpenMeteo(page)` returns the standard CDMX geocode fixture (or a fixture where the alias's canonical name appears in the results).
- **Steps**:
  1. `await page.goto('')`
  2. `await page.locator('#q').fill('CDMX')` (or `'DF'`, `'cdmx'` — `normalizeMx` lowercases + diacritic-folds).
  3. Wait for the debounce + fetch.
  4. `await expect(page.locator('#ac > li').first()).toContainText(/Ciudad de M[ée]xico/i)`.
- **Implementation note**: the alias resolution is in `src/lib/geocode.ts` — when `resolveMxAlias(query)` returns a canonical name that differs from the typed query, the SDK fetches both and merges before ranking/dedupe.
- **NOT YET COVERED**.

### `home-2b` — Population-based ranking + dedupe in autocomplete
- **Goal**: when multiple results share a similar name, the SDK over-fetches (`count=20`), sorts by `population` descending (`byPopulationDesc`), then dedupes to `DISPLAY_COUNT` (8). The most-populous city appears first.
- **Preconditions**: A geocode fixture returning multiple results for the same name, with `population` set on at least the principal entry.
- **Steps**:
  1. Fixture: `{"results": [{"name":"Querétaro","admin1":"Aguascalientes","population":1000,...}, {"name":"Querétaro","admin1":"Querétaro","population":900000,...}]}`.
  2. `await page.goto('')`
  3. Fill `#q` with `'Querétaro'`.
  4. `await expect(page.locator('#ac > li').first()).toContainText(/Querétaro/)` AND read the first li's subtitle — assert it contains `Querétaro` (the state, i.e. the populous canonical entry is first).
  5. `await expect(page.locator('#ac > li')).toHaveCount(...)` — exact count depends on dedupe but should be ≤ 8 (`DISPLAY_COUNT`).
- **Notes**: `byPopulationDesc` is a stable sort; ties keep API order. `dedupe` keeps the first occurrence per `(normalizeMx(name), normalizeMx(admin1||''), normalizeMx(country||''))` key, so near-duplicates collapse.
- **NOT YET COVERED**.

### `home-2c` — Autocomplete result row rendering (bold name + admin1 subtitle + "ciudad" marker)
- **Goal**: each `#ac > li` renders a primary line (bold city name + optional "ciudad" marker for `population ≥ 50000`) and a muted secondary line `admin1 · country` (when either is present).
- **Steps**:
  1. Fixture with `name="Monterrey", admin1="Nuevo León", country="México", population=1135500, feature_code="PPLA"`.
  2. `await page.goto('')`, fill `#q`, wait for autocomplete.
  3. `const li = page.locator('#ac > li').first()`.
  4. `await expect(li.locator('strong, .font-semibold, .font-bold').first()).toHaveText(/Monterrey/)`.
  5. `await expect(li).toContainText(/ciudad/i)` (marker visible because `population ≥ 50000`).
  6. `await expect(li).toContainText(/Nuevo León/)` and `await expect(li).toContainText(/México/)`.
  7. Click → URL contains `&admin=Nuevo+Le%C3%B3n` (URL-encoded) — see `forecast-6`.
- **NOT YET COVERED**.

### `home-3` — "Sin resultados" path on a query with no matches
- **Goal**: empty-search-result UX.
- **Preconditions**: Override `mockOpenMeteo` (or add a more specific route) so the geocoding endpoint returns `{"results":[]}` for a specific query.
- **Steps**:
  1. `await page.route('**://geocoding-api.open-meteo.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"generationtime_ms":0.1,"results":[]}' }))`
  2. Goto `/`, type a string longer than the min-length threshold.
  3. Wait for the debounce.
  4. `await expect(page.locator('#qmsg')).toBeVisible()` and contain `Sin resultados para`.
  5. `await expect(page.locator('#ac')).toBeHidden()`.
- **NOT YET COVERED**.

### `home-4` — Geolocation success → navigate to `/forecast`
- **Goal**: "📍 Usar mi ubicación" calls the browser API and navigates.
- **Preconditions**:
  - `await context.grantPermissions(['geolocation'])`
  - `await context.setGeolocation({ latitude: 19.43, longitude: -99.13 })`
  - `mockOpenMeteo(page)`
- **Steps**:
  1. `await page.goto('')`
  2. Click `#geo` (text: `Usar mi ubicación`).
  3. `await page.waitForURL(/\/forecast\/\?lat=19\.43.*lng=-99\.13/)`.
  4. Forecast renders (see `forecast-1`).
- **NOT YET COVERED**.

### `home-5` — Geolocation denied → non-blocking message
- **Goal**: denied path shows feedback without crashing.
- **Preconditions**: Use `await context.clearPermissions()` AND override `geolocation` in an init script to invoke the error callback with code 1 (denied).
  ```ts
  await page.addInitScript(() => {
    const g = navigator.geolocation;
    g.getCurrentPosition = (_ok, err) => err?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
  });
  ```
- **Steps**:
  1. Click `#geo`.
  2. Expect `#qmsg` visible with text matching `No se pudo obtener tu ubicación`.
  3. Expect URL unchanged (still `/`).
- **NOT YET COVERED**.

### `home-6` — Preset card → forecast peek expand → "Ver pronóstico completo"
- **Goal**: inline expand on a preset card, then navigate.
- **Preconditions**: `mockOpenMeteo(page)`.
- **Steps**:
  1. `await page.goto('')`
  2. The 5 preset cards live under `#preset-grid` — each is an interactive container. Click one (use `.first()` or `:has-text("Ciudad de México")`).
  3. An inline "vista rápida" detail appears; this is rendered via the page's bundled `<script>` from `src/data/cities.ts` (preset data embedded as `#preset-data` JSON).
  4. Click the "Ver pronóstico completo →" link.
  5. `await page.waitForURL(/\/forecast\/\?lat=.+&lng=.+&name=/)`.
- **NOT YET COVERED** (the bare "5 cards present" test exists; the peek/expand flow does not).

### `home-7` — Mapa teaser → navigate to `/mapa`
- **Goal**: teaser block links to the map page.
- **Steps**:
  1. `await page.goto('')`
  2. Locate the teaser: `page.getByRole('link', { name: /Ver mapa interactivo/ })` (text from `t.map_teaser_cta`).
  3. Click it.
  4. `await page.waitForURL(/\/mapa\/?(\?|#|$)/)`.
  5. `await expect(page.locator('#map')).toBeVisible()`.
- **NOT YET COVERED**.

### `home-8` — Favorites: add via `/forecast` → appears on home → persists across reload → remove hides section
- **Goal**: favorites round-trip.
- **Preconditions**: `mockOpenMeteo(page)`. localStorage empty.
- **Steps**:
  1. `await page.goto('forecast/?lat=19.43&lng=-99.13&name=Ciudad+de+M%C3%A9xico&tz=America%2FMexico_City')`
  2. `await expect(page.locator('#fc-fav')).toBeVisible()`
  3. Click `#fc-fav`. Expect `aria-pressed="true"`.
  4. `await page.goto('')`.
  5. `await expect(page.locator('#fav-section')).toBeVisible()`
  6. `await expect(page.locator('#fav-grid > *')).toHaveCount(1)`
  7. Reload. Expect `#fav-section` still visible (localStorage persistence).
  8. Click the "Quitar de favoritos" button on the fav card (`aria-label="Quitar de favoritos"`).
  9. `await expect(page.locator('#fav-section')).toBeHidden()`.
- **Covered by**: `e2e/favorites.spec.ts` (`star on detail → appears in Tus lugares → persists → remove hides section`).

### `home-9` — SMN alert RSS link present
- **Goal**: assert the build-time RSS link is exposed.
- **Steps**:
  1. `await page.goto('')`
  2. `await expect(page.getByRole('link', { name: /alertas|SMN/i })).toBeVisible()` and `href` ends with `rss.xml`.
- **Covered by**: `e2e/home.spec.ts` (`shows the SMN alert RSS link`).

### `home-10` — Footer privacy link present
- **Steps**: home → expect `page.getByRole('link', { name: /Privacidad/ })` with `href` ending in `/privacidad/`.
- **Covered by**: `e2e/home.spec.ts` (`has the footer privacy link`).

### `home-11` — Theme toggle cycles Sistema → Claro → Oscuro and applies `.dark`
- **Goal**: theme bootstrap + cycle.
- **Steps**:
  1. `await page.goto('')`
  2. Initial `<html>` may have `class="dark"` depending on system preference; assert no `class="dark"` is hard-coded in the served HTML (no-FOUC path).
  3. Read `#theme-toggle-btn` `aria-label` to learn the current state.
  4. Click `#theme-toggle-btn`. Observe `aria-label` changes (`Claro` → `Oscuro` → `Sistema`).
  5. After "Oscuro" assert `document.documentElement.classList.contains('dark')` === `true`.
  6. Reload and confirm the choice persists (localStorage key `theme`).
- **Covered by**: `e2e/theme.spec.ts` (3 tests).

### `home-12` — Feedback FAB opens modal and closes
- **Goal**: floating action button shows the modal; the modal traps focus on its title and closes via `#secid-report-close`.
- **Steps**:
  1. `await page.goto('')`
  2. `await expect(page.locator('#secid-report-btn')).toBeVisible()`
  3. Click `#secid-report-btn`.
  4. `await expect(page.locator('#secid-report-modal')).toBeVisible()`
  5. `await expect(page.locator('#secid-report-title-heading')).toBeVisible()`
  6. Click `#secid-report-close`. Expect `#secid-report-modal` hidden / removed from accessibility tree.
- **NOT YET COVERED**.

### `home-13` — Feedback modal submit opens a pre-filled GitHub issue
- **Goal**: filling title + steps + expected fields and submitting opens a new tab/window to `github.com/.../issues/new?...`.
- **Steps**:
  1. Open modal (as above).
  2. Fill `#secid-report-title`, `#secid-report-description`, optionally `#secid-report-type` select.
  3. Capture a `page.waitForEvent('popup')` promise before clicking the submit button.
  4. Click the modal's submit button (its `data-*` attributes carry build SHA, app version, lang).
  5. Assert the popup URL matches `https://github.com/[\w-]+/[\w-]+/issues/new\?` and includes URL-encoded title + body containing diagnostics (env, console, network if requested).
- **NOT YET COVERED**.

### `home-14` — Data refresh: city cards eventually show non-loading values
- **Goal**: confirm cards hydrate from Open-Meteo.
- **Steps**: with `mockOpenMeteo(page)`, goto `/`, expect `#js-updated-at` text to change from `Cargando datos más recientes...` to a localised time string.
- **NOT YET COVERED**.

---

## Forecast (`/forecast`)

### `forecast-1` — Render full forecast from `lat/lng/name/tz`
- **Goal**: query-driven render of current + hourly 48h + 7-day + detail panels.
- **Preconditions**: `mockOpenMeteo(page)` (uses `forecast.cdmx.json` fixture).
- **Steps**:
  1. `await page.goto('forecast/?lat=19.43&lng=-99.13&name=Ciudad+de+M%C3%A9xico&tz=America%2FMexico_City')`
  2. `await expect(page.locator('#fc-status')).toBeHidden()` (after data arrives)
  3. `await expect(page.locator('#fc-root')).toBeVisible()`
  4. Expect sections: an `h2` for hourly 48h (text `Por hora — hoy y mañana (48 h)`); an `h2`/section for `7 días`; detail panels for Viento / UV / Cielo y aire.
  5. Assert the back link is present: `page.getByRole('link', { name: /Volver al inicio/ })`.
- **Covered by**: `e2e/search.spec.ts` (`/forecast with query params renders current temp, 7-day section and detail panels`).

### `forecast-2` — Empty state when no query params
- **Goal**: `/forecast/` with no params shows the empty state.
- **Steps**:
  1. `await page.goto('forecast/')`
  2. `await expect(page.locator('#fc-empty')).toBeVisible()`
  3. The empty state contains a "Volver al inicio" link.
  4. `await expect(page.locator('#fc-root')).toBeHidden()`
- **NOT YET COVERED**.

### `forecast-3` — Network failure → terminal error message in `#fc-status`
- **Goal**: graceful failure when Open-Meteo is unreachable.
- **Preconditions**: Route `**://api.open-meteo.com/**` to fulfill 500 (or `abort`).
- **Steps**:
  1. Goto `forecast/?lat=…&lng=…`
  2. `#fc-status` eventually shows a terminal error (string from `t.load_error`: `Error al cargar. Se reintentará automáticamente.` — actual final message after retries depends on SDK behavior).
  3. `#fc-root` stays hidden.
- **NOT YET COVERED**.

### `forecast-4` — Star toggles favorite and persists
- **Goal**: per `home-8` but isolated to the forecast page.
- **Steps**: covered as part of `home-8`. The star button is `#fc-fav` with `aria-pressed`/`aria-label` toggling between "Agregar a favoritos" / "Quitar de favoritos".
- **Covered by**: `e2e/favorites.spec.ts`.

### `forecast-5` — XSS-safe `name` rendering
- **Goal**: a `name` query param containing HTML is escaped, not rendered as HTML.
- **Steps**:
  1. Goto `forecast/?lat=19.43&lng=-99.13&name=%3Cscript%3Ealert(1)%3C%2Fscript%3E`
  2. Expect no alert dialog (would be captured by Playwright's `page.on('dialog')`).
  3. Expect the rendered heading literally shows the escaped tag text, not interpreted.
- **NOT YET COVERED**.

### `forecast-6` — `&admin` query param renders an XSS-escaped subheading
- **Goal**: `/forecast/?…&admin=<text>` renders `admin` as a muted subheading under the heading, escaped via `esc()` (forecast.astro: `safeAdmin`). When `admin` is absent or empty, the page falls back to showing the coordinates as the subheading.
- **Steps (positive path)**:
  1. `await page.goto('forecast/?lat=19.43&lng=-99.13&name=Quer%C3%A9taro&tz=America%2FMexico_City&admin=Quer%C3%A9taro')`
  2. `await expect(page.locator('#fc-root p').first()).toContainText(/Querétaro/)` — admin1 shown as subline.
- **Steps (XSS safety)**:
  3. `await page.goto('forecast/?lat=19.43&lng=-99.13&name=Q&admin=%3Cscript%3Ealert(1)%3C%2Fscript%3E')`
  4. Expect no alert dialog (Playwright `page.on('dialog')` should not fire).
  5. Expect the literal escaped tag text appears in the subheading, not interpreted as HTML.
- **Steps (fallback)**:
  6. `await page.goto('forecast/?lat=19.43&lng=-99.13&name=X')` (no `admin`)
  7. Expect the subheading shows coordinates (e.g. `19.43, -99.13`), not an empty line.
- **Implementation**: `src/pages/forecast.astro` parses `params.get('admin')`; `safeAdmin` is the escaped value; subline = `safeAdmin ? esc(safeAdmin) : <coords>`.
- **NOT YET COVERED**.

---

## Mapa (`/mapa`)

The map's mocked-network pattern is established in `e2e/mapa.spec.ts`; every map test mocks the RainViewer manifest, the tile cache, and (where relevant) Open-Meteo, then uses **pre-click `waitForResponse(...)` promises** for deterministic ordering. The standard mock constants are at the top of the file:

```ts
const TRANSPARENT_PNG = Buffer.from('iVBORw0KGgoAAA…', 'base64');
const RAINVIEWER_MANIFEST = JSON.stringify({ version:'2.0', generated:…, host:'https://tilecache.rainviewer.com',
  radar: { past:[{time:…,path:'/v2/radar/p1'}], nowcast:[] },
  satellite: { infrared:[{time:…,path:'/v2/satellite/test'}] }
});
const OPEN_METEO_FIELD = JSON.stringify(Array.from({ length: 48 }, () => ({ hourly: { time:[…], temperature_2m:[…], relative_humidity_2m:[…], pressure_msl:[…] } })));
const OPEN_METEO_WIND = JSON.stringify(Array.from({ length: 48 }, () => ({ hourly: { time:[…], wind_speed_10m:[…], wind_direction_10m:[…] } })));
```

### `mapa-1` — `/mapa` loads with map + search visible
- **Goal**: smoke check.
- **Preconditions**: RainViewer manifest + tiles mocked.
- **Steps**:
  1. Mock RainViewer manifest + tiles + OSM tiles (optional).
  2. `await page.goto('mapa/')`
  3. `await expect(page.locator('#map')).toBeVisible()`
  4. `await expect(page.getByPlaceholder(/Buscar un lugar/)).toBeVisible()` (the `#mapq` input).
  5. Layer rail visible: `await expect(page.locator('#layerbtn-base')).toBeVisible()`.
- **Covered by**: `e2e/mapa.spec.ts` (`mapa page loads with map container and search`).

### `mapa-2` — Activate Radar layer → legend appears, opacity wrap shows
- **Goal**: layer activation + intensity legend (Ligera/Moderada/Intensa/Nieve).
- **Steps**:
  1. Mock RainViewer + tiles. `await page.goto('mapa/')`.
  2. `await page.waitForResponse('**/api.rainviewer.com/public/weather-maps.json')`
  3. `await expect(page.locator('#legend')).toBeHidden()`
  4. Click `#layerbtn-radar`.
  5. `await expect(page.locator('#layerbtn-radar')).toHaveAttribute('aria-pressed', 'true')`
  6. `await expect(page.locator('#legend')).toBeVisible()`
  7. `await expect(page.locator('#legend li')).toHaveCount(4)`
  8. `await expect(page.locator('#opacitywrap')).toBeVisible()`
- **Covered by**: `e2e/mapa.spec.ts` (`radar layer button activates and shows legend`).

### `mapa-3` — Activate Satellite layer → NO legend, opacity wrap shows
- **Goal**: satellite is imagery, not intensity-coded.
- **Steps**: similar to `mapa-2` but click `#layerbtn-satellite` and assert `#legend` stays hidden (or has zero `li` children), `aria-pressed="true"` on satellite, `aria-pressed="false"` on radar (mutual exclusion).
- **Covered by**: `e2e/mapa.spec.ts` (`satellite layer button activates without an intensity legend`).

### `mapa-4` — Timeline appears for Radar and the range scrubs frames
- **Goal**: scrubber visibility + interaction.
- **Steps**:
  1. Mock manifest with 4 radar frames (3 past + 1 nowcast).
  2. Activate Radar.
  3. `await expect(page.locator('#timeline')).toBeVisible()`
  4. `await expect(page.locator('#tl-range')).toHaveAttribute('max', '3')`
  5. Read `const v0 = Number(await page.locator('#tl-range').inputValue())` and `const l0 = await page.locator('#tl-time').textContent()`.
  6. Click `#tl-prev`. Expect range value to decrement by 1 (`v0 - 1`, clamped to ≥ 0) and label text to differ from `l0`.
  7. Click `#tl-next`. Expect range value to increment by 1.
  8. Click `#layerbtn-base`. Expect `#timeline` hidden.
- **Covered by**: `e2e/mapa.spec.ts` (`timeline appears for radar and the range scrubs frames`).

### `mapa-5` — Timeline play / pause + `prefers-reduced-motion` gating
- **Goal**: play button starts a 700 ms interval; under reduced motion it's disabled.
- **Steps (animated path)**:
  1. Don't emulate reduced motion. Mock + activate Radar.
  2. `await expect(page.locator('#tl-play')).toBeEnabled()`
  3. Read `const v0 = Number(await page.locator('#tl-range').inputValue())`.
  4. Click `#tl-play`. Expect `aria-pressed="true"`.
  5. `await page.waitForTimeout(800)`.
  6. Expect `#tl-range` value advanced.
  7. Click `#tl-play` again → `aria-pressed="false"`.
- **Steps (reduced-motion path)**:
  1. `await page.emulateMedia({ reducedMotion: 'reduce' })`.
  2. Activate Radar.
  3. `await expect(page.locator('#tl-play')).toBeDisabled()`.
- **NOT YET COVERED** (play/pause + reduced motion).

### `mapa-6` — Pin popup → deep link to `/forecast`
- **Goal**: clicking a preset pin opens a MapLibre popup with a "Ver pronóstico completo →" link.
- **Steps**:
  1. Mock + goto `/mapa`.
  2. Map pins are MapLibre Markers (no stable selector by ID). Use `page.locator('.maplibregl-marker').first().click()`.
  3. Expect a popup: `page.locator('.maplibregl-popup')`.
  4. The popup contains an `<a>` with text matching `Ver pronóstico completo` and an `href` containing `/forecast?lat=...&lng=...&name=...`.
- **NOT YET COVERED**.

### `mapa-7` — Search drops a user pin and flies to it
- **Goal**: map search triggers `geocode`, drops a user pin at the result, `flyTo` animates (or instantly under reduced motion).
- **Preconditions**: Mock the geocoding endpoint with one result.
- **Steps**:
  1. Mock RainViewer + Open-Meteo geocoding.
  2. Goto `/mapa`.
  3. Fill `#mapq` with a query (>1 char triggers the 350 ms debounce + geocode call).
  4. After the geocode response, expect a new `.maplibregl-marker` (in addition to the 5 presets).
  5. Optionally assert the map's centre changed (read via `map.getCenter()` through `page.evaluate`).
- **NOT YET COVERED**.

### `mapa-8` — Map geolocate button drops a user pin
- **Goal**: `#maploc` invokes `getCurrentPosition`, drops a `geo`-kind user pin, flies to it.
- **Preconditions**: `context.grantPermissions(['geolocation'])` + `context.setGeolocation({...})`.
- **Steps**:
  1. Goto `/mapa`.
  2. Click `#maploc`.
  3. Expect a new `.maplibregl-marker`; the popup name (`t.map_locate` → "Mi ubicación") should be in the marker's popup.
- **NOT YET COVERED**.

### `mapa-9` — Geolocate denied → non-blocking `#mapmsg` shows `geo_denied`
- **Goal**: denied path on `/mapa`.
- **Steps**:
  1. Stub `navigator.geolocation.getCurrentPosition` (per `home-5`) to fail with `code: 1`.
  2. Click `#maploc`.
  3. `await expect(page.locator('#mapmsg')).toBeVisible()` and contain `No se pudo obtener tu ubicación`.
- **NOT YET COVERED**.

### `mapa-10` — Temperature field layer activates → legend + timeline + viewport-resample on pan
- **Goal**: Open-Meteo bulk grid → coloured circles + legend + Open-Meteo hourly timeline.
- **Steps (activation)**:
  1. Mock manifest, tiles, and `**/api.open-meteo.com/v1/forecast**` with `OPEN_METEO_FIELD` (48-entry array).
  2. Goto `/mapa`. `await page.waitForResponse('**/api.rainviewer.com/public/weather-maps.json')`.
  3. `await expect(page.locator('#layerbtn-temperature')).toBeEnabled()`.
  4. `const fieldResp = page.waitForResponse('**/api.open-meteo.com/v1/forecast**');`
  5. Click `#layerbtn-temperature`. `await fieldResp`.
  6. Expect `aria-pressed="true"`, `#legend` visible (temperature stops), `#timeline` visible, `#opacitywrap` visible.
- **Steps (re-sample on pan)**:
  7. Pan the map (use MapLibre via `page.evaluate(() => (window as any).map?.panBy([100,0]))` — `map` isn't exposed globally by default; this assertion may need a small affordance, see `mapa-19`).
  8. Expect a second Open-Meteo request after the 500 ms debounce.
- **Covered by**: `e2e/mapa.spec.ts` (`temperature field layer activates with a legend and timeline`) — activation only; re-sample test is NOT YET COVERED.

### `mapa-11` — Humidity field layer activates
- **Goal**: same as `mapa-10`, layer = `humidity`.
- **Steps**: identical pattern with `#layerbtn-humidity`. Confirm `aria-pressed="true"`, legend shows humidity stops, timeline visible, opacity wrap visible.
- **Covered by**: `e2e/mapa.spec.ts` (`humidity field layer activates with a legend and timeline` — generated by the `['humidity','pressure']` loop).

### `mapa-12` — Pressure field layer activates
- **Steps**: identical pattern with `#layerbtn-pressure`. Legend shows pressure stops with `hPa` / numeric labels.
- **Covered by**: `e2e/mapa.spec.ts` (`pressure field layer activates with a legend and timeline` — generated by the `['humidity','pressure']` loop).

### `mapa-13` — Wind layer activates with the WebGL custom layer (animated path)
- **Goal**: clicking wind triggers `buildWindUrl` (carries `hourly=wind_speed_10m,wind_direction_10m`), creates the GL custom layer, particles render.
- **Steps**:
  1. Mock RainViewer + tiles + the wind-specific Open-Meteo route by regex `/api\.open-meteo\.com\/v1\/forecast.*wind_speed_10m/` with `OPEN_METEO_WIND`.
  2. Goto `/mapa`. `await page.waitForResponse('**/api.rainviewer.com/public/weather-maps.json')`.
  3. `const windResp = page.waitForResponse(/api\.open-meteo\.com\/v1\/forecast.*wind_speed_10m/);`
  4. Click `#layerbtn-wind`. `await windResp`.
  5. `aria-pressed="true"`, `#legend` visible (4 wind stops: Calmo / Brisa / Fuerte / Tormenta), `#timeline` visible, `#opacitywrap` visible.
  6. (Optional) Assert the WebGL particle layer exists: `await page.evaluate(() => (window as any).map?.getLayer?.('wx-wind-layer'))` — requires exposing `map` (see `mapa-19`).
- **Covered by**: `e2e/mapa.spec.ts` (`wind layer activates with a legend and timeline`) — UI state. Pixel/GL-state asserts NOT covered (pure type/build only).

### `mapa-14` — Wind layer under `prefers-reduced-motion` falls back to circles
- **Goal**: with reduced motion, the wind layer renders a static `circle` layer instead of GL particles.
- **Steps**:
  1. `await page.emulateMedia({ reducedMotion: 'reduce' })`.
  2. Same mock + activate wind as `mapa-13`.
  3. Click `#layerbtn-wind`.
  4. Assert `aria-pressed="true"`, `#legend` visible.
  5. Internally the page should add `wx-wind-circle` source/layer instead of `wx-wind-layer`. Exposing `map` would let you assert this (`map.getLayer('wx-wind-circle')` non-null, `map.getLayer('wx-wind-layer')` null).
- **NOT YET COVERED**.

### `mapa-15` — Sunlight overlay activates → NO legend, NO timeline, opacity wrap visible
- **Goal**: sunlight is a single static polygon overlay.
- **Steps**:
  1. Mock RainViewer + tiles. Goto `/mapa`. Wait for manifest.
  2. `await expect(page.locator('#layerbtn-sunlight')).toBeEnabled()`.
  3. Click `#layerbtn-sunlight`.
  4. `aria-pressed="true"`, `#legend` hidden, `#timeline` hidden, `#opacitywrap` visible.
  5. Click `#layerbtn-base`. `aria-pressed="false"` on sunlight.
- **Covered by**: `e2e/mapa.spec.ts` (`sunlight overlay activates without timeline or legend`).

### `mapa-16` — Opacity slider live-updates the active layer's paint
- **Goal**: dragging `#opacity` updates `raster-opacity` for raster-tile, `circle-opacity` for field, `fill-opacity` for sunlight, etc.
- **Steps**:
  1. Activate any layer with `#opacitywrap` visible (e.g. temperature).
  2. Set `#opacity` value: `await page.locator('#opacity').fill('30')` (then dispatch an `input` event if needed — Playwright's `fill` on a range input triggers `input` automatically in most engines; if not, use `evaluate(() => (document.getElementById('opacity') as HTMLInputElement).dispatchEvent(new Event('input', {bubbles:true})))`).
  3. Assert (via `page.evaluate` if map is exposed) that the active layer's paint property changed to ~0.3.
- **NOT YET COVERED**.

### `mapa-17` — URL hash sync: pan/zoom/layer/frame update the hash; reload restores
- **Goal**: shareable view state.
- **Steps**:
  1. Goto `mapa/`.
  2. Wait for `moveend`-driven hash sync (250 ms debounce).
  3. Expect `page.url()` to include `#view=` with realistic lat/lng/zoom.
  4. Activate Radar. Wait for the hash sync. URL hash now includes `&layer=radar` and `&t=<ISO>`.
  5. Reload: `await page.reload()`. Wait for the manifest + frame restore. Expect `#layerbtn-radar` aria-pressed `true` and `#tl-range` value matching the saved frame index.
- **NOT YET COVERED**.

### `mapa-18` — Layer source unavailable → "Capa no disponible" message → revert to Base
- **Goal**: non-blocking failure.
- **Steps**:
  1. Mock RainViewer manifest to fulfill with 500 (or an empty/invalid body).
  2. Mock OSM/tiles normally. Goto `/mapa`.
  3. Click `#layerbtn-radar`.
  4. Expect `#mapmsg` visible with text `Capa no disponible`.
  5. Expect `#layerbtn-radar` aria-pressed `false` (reverted) and `#layerbtn-base` aria-pressed `true`.
- **NOT YET COVERED**.

### `mapa-19` — (test affordance) expose the MapLibre `map` instance
- **Goal**: many of the GL-internal assertions above (paint property, layer existence, getBounds) need access to the `map` object. The page does NOT currently expose `map` globally. The smallest possible affordance for tests is to set `window.__map = map` only when a query/cookie/env flag is present (e.g. `?e2e=1`), so production stays unaffected. **This is a proposed change**, not current behavior — flagged here so test authors know why some assertions are deferred.
- **NOT YET COVERED** and requires a tiny prod change before further coverage.

---

## Privacy (`/privacidad`)

### `privacy-1` — Renders the privacy heading
- **Steps**: goto `'privacidad/'`, expect a level-1 heading containing `Privacidad`.
- **Covered by**: `e2e/privacy.spec.ts` (`/privacidad/ renders with the privacy heading`).

### `privacy-2` — No cookies / no tracking
- **Goal**: assert the page sets no cookies on load.
- **Steps**: goto, `await expect((await context.cookies()).length).toBe(0)`, assert no `<script>` references analytics domains (Google Analytics, Plausible, etc.).
- **Covered by**: `e2e/privacy.spec.ts`.

### `privacy-3` — Data-source attribution links present
- **Steps**: assert links exist for `Open-Meteo`, `RainViewer`, `OpenStreetMap`, and `SMN/CONAGUA`.
- **Covered by**: `e2e/privacy.spec.ts`.

### `privacy-4` — Back-to-home link works
- **Steps**: click "Volver al inicio" / "Inicio" → URL is `/`.
- **NOT YET COVERED**.

---

## RSS / Sitemap

### `rss-1` — `/rss.xml` returns 200 + valid XML with channel/items
- **Steps**:
  1. `const res = await page.request.get('rss.xml')`
  2. `expect(res.status()).toBe(200)`
  3. `expect(res.headers()['content-type']).toMatch(/(application|text)\/(rss\+)?xml/)`
  4. Body parses (e.g. `expect(xml).toContain('<rss')` and `expect(xml).toContain('<channel>')`).
- **NOT YET COVERED** (we already unit-test the RSS builder in `src/lib/rss.xml.test.ts`, but an e2e route check is missing).

### `sitemap-1` — `/sitemap.xml` returns 200 + valid XML
- **Steps**: same pattern as above against `sitemap.xml`.
- **NOT YET COVERED**.

---

# Cross-page journeys

### `cross-1` — Theme persists across navigation
- **Goal**: setting "Oscuro" on `/` carries over to `/mapa` and `/forecast`.
- **Steps**:
  1. Goto `/`, click `#theme-toggle-btn` until label reads "Oscuro".
  2. Goto `mapa/`. Expect `document.documentElement.classList.contains('dark') === true`.
  3. Goto `forecast/?lat=…&lng=…&name=…`. Same assertion.
- **Partially covered** by `e2e/theme.spec.ts` (persists across reload on `/`); cross-route persistence NOT explicitly tested.

### `cross-2` — Nav links: Inicio + Mapa are always present and correct
- **Steps**: on every route, `page.getByRole('link', { name: 'Inicio' })` resolves to `/`, `page.getByRole('link', { name: 'Mapa' })` resolves to `/mapa`.
- **NOT YET COVERED**.

### `cross-3` — Feedback FAB is reachable from every page
- **Steps**: on each of `/`, `/mapa`, `/forecast`, `/privacidad`: expect `#secid-report-btn` visible; open + close modal.
- **NOT YET COVERED**.

### `cross-4` — Own-scoped service worker isolates from the parent root SW
- **Goal**: the weather site registers its own service worker at `${base}sw.js` with scope `/mexico-weather/`. This isolates the site from the parent `artemiop.com/sw.js` (root-scoped) which could otherwise serve stale content. Shipped via PR #49.
- **Steps**:
  1. After `await page.goto('')`, optionally wait for `navigator.serviceWorker.ready`.
  2. `const regs = await page.evaluate(() => navigator.serviceWorker.getRegistrations?.().then(rs => rs.map(r => ({ scope: r.scope }))))`.
  3. Expect at least one registration with `scope` ending in `/mexico-weather/` (the site's own scoped SW).
- **Notes**: The registration is wrapped in `try/catch` and deferred to `load` — every failure path is inert. In test environments where SW registration is disabled, this journey should be `test.skip` with the reason.
- **NOT YET COVERED**.

---

# Responsive journeys

These journeys exercise the site at the four representative breakpoints documented in [`USER_GUIDE.md`](USER_GUIDE.md#responsive-behavior). Use Playwright's `page.setViewportSize(...)` (or per-test `test.use({ viewport: { width, height } })`) to drive each width.

Conventions:

- All viewports test the same baseline content; the *assertion* shape changes (e.g. card count per row, presence of overflow scrollbars).
- Use `mockOpenMeteo(page)` for deterministic card content — without it, fetches race + a percentage of preset cards drop to the terminal error state (see issue [#82](https://github.com/ArtemioPadilla/mexico-weather/issues/82)).

### `responsive-1` — Home grid reflows: 1 / 2 / 3 columns
- **Goal**: `#preset-grid > *` snaps to the expected column count at each breakpoint.
- **Preconditions**: `mockOpenMeteo(page)`; localStorage with no favorites.
- **Steps**:
  1. For each viewport in `[ { w: 375, cols: 1 }, { w: 768, cols: 2 }, { w: 1440, cols: 3 } ]`:
     - `await page.setViewportSize({ width: v.w, height: 900 })`
     - `await page.goto('')`
     - `await expect(page.locator('#preset-grid > *').first()).toBeVisible()`
     - Read the bounding boxes of the first 3 children; assert they share a `y` within ±2 px (cols === 3), or `y` differs by ≥ card-height (cols === 1).
- **Failure modes**: layout regression when Tailwind classes change (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`).
- **NOT YET COVERED**.

### `responsive-2` — No horizontal scroll at any tested width
- **Goal**: the page never produces a horizontal scrollbar at 375 / 768 / 1024 / 1920.
- **Steps**:
  1. For each width in `[375, 768, 1024, 1920]` on each of `/`, `/forecast?lat=19.43&lng=-99.13&name=CDMX`, `/mapa/`, `/privacidad/`:
     - Set viewport.
     - `await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)`
- **Notes**: the MapLibre canvas is the one element that legitimately extends to viewport edges; assert specifically on the body's overflow, not on the map canvas.
- **NOT YET COVERED**.

### `responsive-3` — Forecast hourly row is horizontally scrollable, never wraps
- **Goal**: the 48-h hourly row keeps its single-row layout and exposes overflow.
- **Steps**:
  1. `await page.setViewportSize({ width: 375, height: 812 })`
  2. `await page.goto('forecast/?lat=19.43&lng=-99.13&name=CDMX&tz=America%2FMexico_City')`
  3. `const row = page.locator('[data-hourly-row]')` (or a stable locator on the hourly track — confirm the selector against `src/pages/forecast.astro`).
  4. Read `await row.evaluate(el => ({ sw: el.scrollWidth, cw: el.clientWidth, oy: el.scrollHeight }))` — assert `sw > cw` (horizontal overflow exists) and that vertical overflow (`scrollHeight`) is approximately one card height (no wrap).
- **NOT YET COVERED**.

### `responsive-4` — Map controls remain reachable at mobile (375)
- **Goal**: at 375 px, the layer rail, search input, "Mi ubicación" button, opacity slider, timeline scrubber, and feedback FAB are all visible (no off-screen / overlap).
- **Steps**:
  1. Mock RainViewer + tiles. `await page.setViewportSize({ width: 375, height: 812 })`.
  2. `await page.goto('mapa/')`.
  3. For each of `#layerbtn-base`, `#layerbtn-radar`, `#mapq`, `#maploc`, `#secid-report-btn`: `await expect(locator).toBeInViewport()`.
  4. Click `#layerbtn-radar`; wait for radar.
  5. For each of `#opacity`, `#timeline`, `#legend`: assert `toBeInViewport()`.
- **Notes**: this also indirectly catches the perceived blank-canvas bug ([#72](https://github.com/ArtemioPadilla/mexico-weather/issues/72)) because the radar click forces the canvas to render; if it didn't render, the screenshot diff would show a black centre.
- **NOT YET COVERED**.

### `responsive-5` — Feedback FAB doesn't overlap critical content at any width
- **Goal**: at every width, `#secid-report-btn` (bottom-right floating action button) doesn't sit on top of the last action button / link of the page (footer privacy link on `/`, last "Ver pronóstico completo" link on `/`, etc.).
- **Steps**:
  1. For each width in `[375, 768, 1024, 1440, 1920]`:
     - Set viewport.
     - Goto `/`.
     - `await expect(page.locator('#secid-report-btn')).toBeVisible()`.
     - Scroll to the bottom of the page.
     - Compute the bounding boxes of `#secid-report-btn` and the footer `a[href$="/privacidad/"]`. Assert they don't intersect.
- **NOT YET COVERED**.

### `responsive-6` — Theme toggle sits clear of nav at all widths
- **Goal**: `#theme-toggle-btn` (floating top-right circle) never overlaps the top nav links (`Inicio` / `Mapa`) and stays inside the viewport at the narrowest tested width.
- **Steps**:
  1. For each width in `[375, 768, 1440]`:
     - Set viewport, goto `/`, wait for hydration.
     - Read the bounding boxes of `#theme-toggle-btn` and the navigation `Mapa` link.
     - Assert they don't intersect AND that `#theme-toggle-btn` `right + width <= viewport.width`.
- **NOT YET COVERED**.

---

# Coverage matrix

| Journey | Covered? |
|---|---|
| `home-1` loads + heading + 5 cards | ✅ `home.spec.ts` |
| `home-2` search → /forecast | ✅ `search.spec.ts` |
| `home-2a` MX alias resolution (CDMX/DF/Méx) | ❌ |
| `home-2b` population ranking + dedupe | ❌ |
| `home-2c` autocomplete row format (bold + admin1 subtitle + ciudad marker) | ❌ |
| `home-3` "Sin resultados" empty search | ❌ |
| `home-4` geolocate success → /forecast | ❌ |
| `home-5` geolocate denied → message | ❌ |
| `home-6` preset card peek → full forecast | ❌ |
| `home-7` mapa teaser → /mapa | ❌ |
| `home-8` favorites round-trip | ✅ `favorites.spec.ts` |
| `home-9` SMN RSS link | ✅ `home.spec.ts` |
| `home-10` footer privacy link | ✅ `home.spec.ts` |
| `home-11` theme cycle + persists | ✅ `theme.spec.ts` (3 tests) |
| `home-12` feedback FAB open/close | ❌ |
| `home-13` feedback submit → GitHub popup | ❌ |
| `home-14` card data refresh | ❌ |
| `forecast-1` full render from params | ✅ `search.spec.ts` |
| `forecast-2` empty state (no params) | ❌ |
| `forecast-3` network error | ❌ |
| `forecast-4` star toggles | ✅ (via favorites) |
| `forecast-5` XSS-safe `name` | ❌ |
| `forecast-6` `&admin` subheading + XSS safety + coords fallback | ❌ |
| `mapa-1` map + search visible | ✅ `mapa.spec.ts` |
| `mapa-2` radar layer + legend | ✅ `mapa.spec.ts` |
| `mapa-3` satellite (no legend) | ✅ `mapa.spec.ts` |
| `mapa-4` timeline scrubs | ✅ `mapa.spec.ts` |
| `mapa-5` timeline play/pause + reduced-motion | ❌ |
| `mapa-6` pin popup → /forecast | ❌ |
| `mapa-7` map search drops pin | ❌ |
| `mapa-8` map geolocate drops pin | ❌ |
| `mapa-9` map geolocate denied | ❌ |
| `mapa-10` temperature activates | ✅ `mapa.spec.ts` (activation only) |
| `mapa-11` humidity activates | ✅ `mapa.spec.ts` |
| `mapa-12` pressure activates | ✅ `mapa.spec.ts` |
| `mapa-13` wind activates | ✅ `mapa.spec.ts` |
| `mapa-14` wind under reduced-motion → circle fallback | ❌ |
| `mapa-15` sunlight overlay | ✅ `mapa.spec.ts` |
| `mapa-16` opacity slider live update | ❌ |
| `mapa-17` URL hash sync + restore | ❌ |
| `mapa-18` layer unavailable → revert + message | ❌ |
| `mapa-19` expose `map` for GL asserts | ❌ (requires tiny prod affordance) |
| `privacy-1` heading | ✅ `privacy.spec.ts` |
| `privacy-2` no cookies / no tracking | ✅ `privacy.spec.ts` |
| `privacy-3` source-attribution links | ✅ `privacy.spec.ts` |
| `privacy-4` back-to-home link | ❌ |
| `rss-1` /rss.xml 200 + XML | ❌ (unit-tested in `src/lib/rss.xml.test.ts`) |
| `sitemap-1` /sitemap.xml 200 + XML | ❌ |
| `cross-1` theme persists across routes | partial |
| `cross-2` nav links present everywhere | ❌ |
| `cross-3` feedback FAB everywhere | ❌ |
| `cross-4` own-scoped service worker registered | ❌ |
| `responsive-1` home grid reflows 1/2/3 columns | ❌ |
| `responsive-2` no horizontal scroll at any width | ❌ |
| `responsive-3` forecast hourly row scrolls, doesn't wrap | ❌ |
| `responsive-4` map controls reachable at 375 px | ❌ |
| `responsive-5` FAB doesn't overlap critical content | ❌ |
| `responsive-6` theme toggle clear of nav at all widths | ❌ |

**Existing tests: 22.** **Documented journeys: ~51.** **Coverage gap: ~34 journeys** spanning denial paths, persistence-across-routes, the feedback modal, multiple `/mapa` layer activations (humidity/pressure), reduced-motion variants, layer-unavailable error path, URL hash restore, the RSS/sitemap endpoints, the MX-aware autocomplete behaviors (alias / population ranking / row formatting), the `&admin` subheading on `/forecast`, the own-scoped service-worker registration, and the new responsive-* journeys at 375 / 768 / 1024 / 1920.

# Recommended test-authoring order (highest value first)

1. **Layer activation parity** (`mapa-11`, `mapa-12`) — humidity + pressure — small additions to the existing loop pattern in `mapa.spec.ts`. Each ~25 LOC.
2. **Layer-unavailable error path** (`mapa-18`) — proves the non-blocking failure UX one end-to-end.
3. **URL hash sync + reload restore** (`mapa-17`) — the shareable URL is a public contract.
4. **Geolocation denied paths** (`home-5`, `mapa-9`) — denial UX is invisible until it happens.
5. **Feedback FAB open/close** (`home-12`) and **submit → GitHub popup** (`home-13`).
6. **Forecast empty state** (`forecast-2`) and **network error** (`forecast-3`).
7. **Theme persists across navigation** (`cross-1`) — currently only same-route reload is tested.
8. **`mapa-5` timeline play/pause + reduced motion** — requires `page.emulateMedia({ reducedMotion: 'reduce' })`.
9. **Pin popup deep link** (`mapa-6`).
10. **Reduced-motion wind circle fallback** (`mapa-14`) and **opacity slider live update** (`mapa-16`) — depend on `mapa-19`'s tiny affordance to fully verify, but the visible UI state can be asserted immediately.
11. **RSS / sitemap route checks** (`rss-1`, `sitemap-1`).
12. **Responsive smoke set** (`responsive-1` + `responsive-2`) — small, fast, and prevent the most common layout regressions (grid-cols counts; accidental horizontal scrollbar at narrow widths).

# Notes for Playwright MCP authors

- Always mock **all** Open-Meteo and RainViewer routes before `page.goto` — the site degrades gracefully on missing data but tests should be deterministic.
- Always use the **pre-action `waitForResponse(...)` promise pattern**: capture the promise *before* the click that triggers the fetch, then `await` it after — never the other way around (see the cold-start race fix in `e2e/mapa.spec.ts`).
- Many layer/legend selectors are language-dependent (`'Capas'`, `'Capa no disponible'`, etc.). Prefer the **IDs** listed in the selector palette over text queries when possible.
- The map exposes no global; assertions on internal MapLibre state (paint properties, layer/source presence, view bounds) currently aren't possible from a Playwright spec. Adding a small `?e2e=1`-gated `window.__map = map` affordance would unlock a class of assertions (see `mapa-19`).
- The site's base path is `/mexico-weather` in production; `playwright.config.ts`'s `baseURL` already includes it. Always use **relative** `page.goto('foo/')` paths.

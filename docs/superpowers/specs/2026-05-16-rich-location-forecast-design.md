# Rich location forecast — design

Date: 2026-05-16
Status: Approved (pending written-spec review)

## Summary

Expand the Mexico weather site from five hardcoded preset cards (single-day,
4 variables) into a richer, search-driven experience while remaining a 100%
static site on GitHub Pages with **no backend and no new runtime
dependencies**:

- Search **any location** (Open-Meteo geocoding) + "use my location"
  (browser Geolocation).
- **Multi-range forecast**: current conditions, hourly (~48h, today &
  tomorrow), and 7-day daily.
- **More variables**: temperature + feels-like, condition, precipitation
  probability & amount, wind (speed/gusts/direction), UV index, cloud cover,
  humidity, pressure, visibility, sunrise/sunset.
- A shareable, client-rendered detail page (`/forecast?lat=&lng=&name=&tz=`).
- CONAGUA/SMN remains as **alerts/attribution context** (the build-time RSS
  feed from PR #18), not live merged forecast data.

"Our own API" is realized as a clean, typed, DOM-free **client SDK** in the
browser — not a hosted endpoint.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Architecture | Client-side only, static, free, no accounts/infra |
| Sources | Open-Meteo (live) + CONAGUA as alerts/attribution context |
| Forecast detail | Current + hourly (~48h) + 7-day daily |
| Variables | Core (temp/feels-like/condition/precip), Wind, UV, Sky & air |
| Page structure | Overview grid kept; cards expand inline (quick peek); full shareable detail view |
| Units / i18n | Metric only (°C, km/h, mm); Spanish-first (en where it already exists) |

## Non-goals (YAGNI v1)

- No hosted backend / edge proxy (separate deferred issue #1).
- No live CONAGUA forecast merge (no structured API; CORS/TLS infeasible client-side).
- No unit toggle, no favorites/pinning, no charting library, no reverse geocoding,
  no multi-language routing.

## Architecture

### Client SDK — `src/lib/weather.ts` (extends the PR #19 module)

Pure, DOM-free, injectable `fetch`/`sleep` (reuses PR #19 retry/backoff/429).

- `geocode(query: string, lang = 'es'): Promise<GeoResult[]>`
  - `https://geocoding-api.open-meteo.com/v1/search?name=<q>&count=8&language=<lang>&format=json`
  - free, keyless, CORS-enabled.
  - `GeoResult = { name; admin1?; country?; lat; lng; tz }`
  - No results → resolves `[]` (never throws to UI).
- `getForecast(loc: { lat; lng; tz? }): Promise<Forecast>`
  - one `api.open-meteo.com/v1/forecast` call requesting `current`,
    `hourly` (next ~48h), `daily` (7 days) for all variables.
  - `Forecast = { current: CurrentWx; hourly: HourWx[]; daily: DayWx[] }`
  - Missing optional variable degrades gracefully (field omitted, UI shows "—").
- Helpers (pure, exported, tested): `describeWeatherCode()` (existing WMO map),
  `uvLabel(uv)` → `{ value; level: 'bajo'|'moderado'|'alto'|'muy alto'|'extremo' }`,
  `windDir(deg)` → 8-point compass + arrow glyph.

The existing per-card refresh path keeps using the SDK with the existing
10-minute interval.

### Data & i18n

- Presets stay in `src/data/cities.ts` (PR #20). Unchanged shape.
- New UI strings added to `src/i18n/` following PR #20's pattern, Spanish-first.

### Pages

- `src/pages/index.astro` — overview:
  - Hero gains a **search box** with debounced (~300ms) geocoding
    autocomplete and a **"📍 usar mi ubicación"** button.
  - Preset cards enriched: current temp + condition + a compact row
    (hi/lo, rain %, wind).
  - **Inline expand** ("vista rápida"): reuses the card's already-fetched
    data to show the extra variables; includes a
    "Ver pronóstico completo →" link.
  - Selecting a search result / "use my location" / "full forecast"
    navigates to the detail page.
- `src/pages/forecast.astro` — **new static page, client-rendered from URL
  query** (`?lat=&lng=&name=&tz=`):
  - Sections in order: Back link → Current (big temp + feels-like, icon,
    hi/lo, rain, sunrise/sunset) → Hourly 48h (horizontal scroll strip +
    temperature trend line, SVG) → 7-day list → Detail panels
    (Wind / UV / Sky & air) → SMN/CONAGUA context banner → attribution footer.
  - Shareable/bookmarkable; valid HTML for crawlers even with no params.

### Interactivity

Vanilla TS via the repo's bundled-`<script>` pattern (established in PR #19).
Hourly "chart" is a hand-built inline SVG polyline + CSS strip. No island
framework, no dependencies.

## Data flow

1. **Overview load** → each preset card calls `getForecast()` (renders the
   current/today subset), on the existing 10-min refresh with retry/backoff.
2. **Inline expand** → renders extra variables from the data already fetched
   for that card (no extra request).
3. **Search** → debounced `geocode(query)` → autocomplete → on select →
   `location.href = /forecast?lat=&lng=&name=&tz=`.
4. **Use my location** → `navigator.geolocation.getCurrentPosition` → coords →
   `/forecast?lat=&lng=&name=Tu%20ubicaci%C3%B3n`.
5. **Detail page** → parse + validate query params → one `getForecast()` →
   render four sections.

## Error handling

- Geocode network failure → SDK retry; **no results** → inline
  "Sin resultados para «X»"; never throws to the user.
- Forecast failure → reuse PR #19 retry/backoff/429 → Spanish terminal
  message consistent with existing copy.
- Geolocation denied/unavailable → non-blocking message; search stays usable.
- `/forecast` missing/invalid params → "busca una ubicación" empty state with
  the search box (no crash; valid page).
- **XSS**: `name` (and any geocode-derived strings) rendered via
  `textContent`/escaped only — never `innerHTML`. Query params validated
  (lat/lng numeric, in range) before use.

## Accessibility

- Search is a combobox: `role="combobox"`, `aria-expanded`,
  `aria-activedescendant`, listbox results, full keyboard nav
  (↑/↓/Enter/Esc).
- Hourly strip keyboard-scrollable; panels labelled.
- Respect `prefers-reduced-motion` (Tailwind `motion-reduce:` on any
  transitions), consistent with PR #20.
- Detail page has a sensible `<title>`/`<h1>` reflecting the location.

## Testing

Vitest, SDK only (UI wiring untested, per repo convention), deterministic
with injected `fetch`/`sleep`, no network — same harness as PR #19:

- `geocode`: valid parse; no-results → `[]`; retry path; query encoding.
- `getForecast`: full parse (current/hourly/daily); missing optional variable
  degrades; 429/retry reuse.
- Helpers: `uvLabel()` thresholds; `windDir()` boundaries; WMO mapping.

CI (`ci.yml`) runs `check` + `build`; the suite also runs locally via
`npm test`.

## Dependencies & sequencing

- **Builds on PR #19** (`src/lib/weather.ts` SDK base) — that PR should merge
  first, or this feature branches from it. **Builds on PR #20** (data/i18n
  structure).
- **Supersedes issue #15** ("Ver en Open-Meteo" per-card link): the detail
  view replaces that link's purpose. #15 is folded into this feature and its
  issue should be closed referencing this work.
- Independent of PR #5 (SEO), PR #6 (theme), PR #7 (tooling); compatible with
  all.

## Suggested delivery slices (for the implementation plan)

1. **SDK**: `geocode`, extend `getForecast` to current/hourly/daily + all
   variables, helpers, Vitest tests.
2. **Detail page** `forecast.astro`: render all sections from query params +
   empty/error states.
3. **Overview**: search box + autocomplete + geolocation + enriched cards +
   inline expand; wire navigation; close/relink #15.

Each slice is an independent PR with the project's two-stage review.

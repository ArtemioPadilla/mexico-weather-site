# Roadmap

## Done

- Real weather data from Open-Meteo on city cards, with retry/backoff and
  graceful error/stale handling.
- Build-time RSS feed of real SMN avisos, fetched over TLS via a committed
  intermediate CA, with an informational fallback when SMN is unreachable.
- Rich location forecast: typed forecast SDK, a shareable `/forecast` detail
  page, plus search, geolocation and inline forecast peek.
- SEO and discoverability: sitemap, Open Graph meta, robots, and a
  Lighthouse CI check (informational, non-blocking).
- Privacy/legal page (`/privacidad`).
- Light / dark / system theme with a toggle.
- Tooling: ESLint, Prettier, Husky pre-commit, Dependabot.
- Custom domain (`artemiop.com`) with corrected canonical, sitemap, RSS and
  robots URLs.
- Migration to Tailwind 4 and Astro 6 (landed as part of the maps epic).
- Playwright end-to-end tests (smoke, layer activation, timeline scrubber,
  field layers — all deterministic via mocked network).
- **Interactive weather map (`/mapa`)** — the maps epic ([#56](https://github.com/ArtemioPadilla/mexico-weather/issues/56)):
  - **Slice 1** ([#57](https://github.com/ArtemioPadilla/mexico-weather/pull/57)) — `/mapa` page foundation: MapLibre GL JS basemap, preset/search/geolocated pins, popups → `/forecast` deep link, shareable URL hash, home teaser, nav link.
  - **Slice 2** ([#58](https://github.com/ArtemioPadilla/mexico-weather/pull/58)) — layer engine + RainViewer radar/precipitation layer with rain-vs-snow palette, per-layer opacity slider, legend.
  - **Slice 3** ([#59](https://github.com/ArtemioPadilla/mexico-weather/pull/59)) — RainViewer satellite/clouds layer (infrared).
  - **Slice 4** ([#60](https://github.com/ArtemioPadilla/mexico-weather/pull/60)) — timeline scrubber + playback (past → now → forecast), shareable selected frame via `t=` URL hash, `prefers-reduced-motion`-gated autoplay.
  - **Slice 5a** ([#61](https://github.com/ArtemioPadilla/mexico-weather/pull/61)) — Open-Meteo gridded-field infrastructure + temperature heat overlay (viewport-resampled).
  - **Slice 5b** ([#62](https://github.com/ArtemioPadilla/mexico-weather/pull/62)) — humidity + pressure field overlays; AbortController for rapid-pan resamples; per-point null tolerance.

## In progress / next

- **Slice 5c — GL particle wind layer** (planned + staged): hand-built MapLibre `custom` WebGL layer driven by Open-Meteo wind grid, with a `prefers-reduced-motion` static-arrow fallback.
- **Slice 6 — sunlight terminator + performance polish**: client-computed day/night terminator overlay; frame preloading/caching; bundle audit.

## Deferred / needs decision

- Own hosted API with edge caching (#1) — needs a hosting account.
- Sentry error monitoring (#2) — needs a DSN.
- Live multi-source CONAGUA merge — infeasible client-side.
- Favorites, °C/°F toggle, reverse-geocoding — YAGNI for v1.

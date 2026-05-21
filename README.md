# Mexico weather site

Public weather dashboard focused on major cities in Mexico.

The site shows city-level forecasts from Open-Meteo and links to SMN alerts,
with a built-in feedback button that opens pre-filled GitHub issues.

## Features

### City forecast

- Search any location + "use my location" with current / 48h-hourly / 7-day forecast (wind, UV, sky & air).
- Shareable detail page `/forecast?lat=&lng=&name=&tz=` rendered client-side from Open-Meteo.
- Client-side weather refresh every 10 minutes.
- Build-time generated RSS 2.0 feed of SMN weather alerts at `/rss.xml`.

### Interactive weather map (`/mapa`)

- MapLibre GL JS basemap (OpenStreetMap) with the full zoom range, pan and keyboard navigation.
- Pins for preset Mexican cities + the user's searched/geolocated location; pin popups deep-link to the city's `/forecast`.
- **Layer rail** — one primary weather layer at a time, with per-layer opacity slider and a legend:
  - **Radar / Precipitation** (RainViewer; rain vs snow palette)
  - **Satellite / Clouds** (RainViewer infrared)
  - **Temperature, Humidity, Pressure** (Open-Meteo gridded forecast, sampled over the current viewport, re-sampled on pan)
- **Timeline scrubber** with play/pause across past → now → forecast frames (radar/satellite + Open-Meteo hourly steps). Respects `prefers-reduced-motion` (no autoplay; play button disabled).
- **Shareable URL hash**: `/mapa#view=<lat>,<lng>,<zoom>z&layer=<id>&t=<ISO>` — pan, zoom, active layer, and selected frame are all bookmarkable and restored on reload.
- 100% keyless: no API keys, no backend, no secrets — all data sources are public + CORS-enabled.

### Tooling, hosting, polish

- Floating feedback modal with diagnostics capture (opens a pre-filled GitHub issue).
- Spanish-first i18n (with parallel English strings).
- Static deployment to GitHub Pages from `main`.

See **[`docs/USER_GUIDE.md`](docs/USER_GUIDE.md)** for the full user-journey walkthrough, the URL hash schema, accessibility notes, and data-source attributions. For the test-author's reference (every interactive selector, journey-by-journey Playwright drives, mock endpoints, and current e2e coverage), see **[`docs/USER_JOURNEYS.md`](docs/USER_JOURNEYS.md)**.

## Tech stack

- Astro 6
- Tailwind CSS 4
- TypeScript
- MapLibre GL JS (lazy-loaded, only on `/mapa`)
- Vitest (unit) + Playwright (e2e)
- GitHub Actions (CI + Pages deploy)

## Local development

1. Install dependencies.
2. Start the Astro dev server.

```bash
npm install
npm run dev
```

Then open the local URL shown in your terminal.

## Scripts

- `npm run dev`: Start local development server.
- `npm run check`: Run Astro diagnostics.
- `npm run type-check`: Run TypeScript checks.
- `npm run build`: Build static files into `dist`.
- `npm run preview`: Preview the production build.
- `npm test`: Run tests with Vitest.

## Code style

ESLint and Prettier are configured for this project (`npm run lint`, `npm run format`). A Husky pre-commit hook runs ESLint --fix on staged JS/TS/Astro files and Prettier on staged JSON/CSS config files. The repository is not yet fully Prettier-formatted, so `format:check` and a full `npm run format` are intentionally not enforced in CI — running them would produce a large diff unrelated to feature work.

## Deployment

The repository deploys automatically to GitHub Pages from `main`.

- Astro base path is configured as `/mexico-weather`.
- Build output is uploaded from `dist`.

See `SETUP.md` for environment and workflow details.

## Project structure

```text
src/
  pages/
    index.astro           # home (city cards, search, geolocate, /mapa teaser)
    forecast.astro        # shareable forecast detail (query-param driven)
    mapa.astro            # interactive weather map (MapLibre, lazy-loaded)
    privacidad.astro      # privacy/legal page
    rss.xml.ts            # build-time SMN advisories feed
    sitemap.xml.ts
  layouts/BaseLayout.astro
  components/common/      # FeedbackFAB, ThemeToggle
  lib/                    # pure, DOM-free, Vitest-covered modules:
                          #   weather, forecast, geocode, theme, rss,
                          #   maphash, mappins, maplayers, maptimeline,
                          #   mapfields, mapwind
  i18n/ui.ts              # Spanish-first + English UI strings
  data/cities.ts          # preset MX cities

docs/
  USER_GUIDE.md           # user journeys + URL schema + a11y + attributions
  superpowers/specs/      # design specs (one per feature epic)
  superpowers/plans/      # bite-sized implementation plans (one per slice)
```

## Bundled agent skill & CLI

This repo also bundles the consolidated Mexico-weather tooling:

- A Claude agent skill at `skill/SKILL.md` (cities, rain-window algorithm, SMN/WMO interpretation).
- A stdlib-only CLI at `scripts/weather_mx.py` — run `python3 scripts/weather_mx.py "CDMX"`.
- The SMN RSS feed at `/rss.xml` is auto-generated hourly by `.github/workflows/smn-rss.yml` from `scripts/smn-rss/smn_rss.py`.

## License

MIT

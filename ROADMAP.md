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
- 69 unit tests (Vitest) covering weather, forecast, geocode, RSS and theme.

## In progress / next

- End-to-end tests (Playwright).
- Migration to Tailwind 4 and Astro 6.

## Deferred / needs decision

- Own hosted API with edge caching (#1) — needs a hosting account.
- Sentry error monitoring (#2) — needs a DSN.
- Live multi-source CONAGUA merge — infeasible client-side.
- Favorites, °C/°F toggle, reverse-geocoding — YAGNI for v1.

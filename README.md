# Mexico weather site

Public weather dashboard focused on major cities in Mexico.

The site shows city-level forecasts from Open-Meteo and links to SMN alerts,
with a built-in feedback button that opens pre-filled GitHub issues.

## Features

- Search any location + "use my location" with current / 48h-hourly / 7-day forecast (wind, UV, sky & air).
- Client-side weather refresh every 10 minutes.
- Build-time generated RSS 2.0 feed of SMN weather alerts at `/rss.xml`.
- Floating feedback modal with diagnostics capture.
- Static deployment to GitHub Pages.

## Tech stack

- Astro 4
- Tailwind CSS
- TypeScript
- Vitest
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

## Deployment

The repository deploys automatically to GitHub Pages from `main`.

- Astro base path is configured as `/mexico-weather-site`.
- Build output is uploaded from `dist`.

See `SETUP.md` for environment and workflow details.

## Project structure

```text
src/
	pages/
		index.astro
	layouts/
		BaseLayout.astro
	components/common/
		FeedbackFAB.astro
```

## License

MIT

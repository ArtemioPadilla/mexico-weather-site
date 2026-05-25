import { test, expect } from '@playwright/test';
import { mockOpenMeteo } from './helpers';

/** Minimal 1×1 transparent PNG (base64) — satisfies MapLibre tile requests. */
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Minimal valid RainViewer manifest accepted by parseRainviewerManifest. */
const RAINVIEWER_MANIFEST = JSON.stringify({
  version: '2.0',
  generated: 1779138033,
  host: 'https://tilecache.rainviewer.com',
  radar: {
    past: [
      { time: 1779130200, path: '/v2/radar/p1' },
      { time: 1779130500, path: '/v2/radar/p2' },
      { time: 1779130800, path: '/v2/radar/p3' },
    ],
    nowcast: [{ time: 1779131100, path: '/v2/radar/f1' }],
  },
  satellite: { infrared: [{ time: 1779130800, path: '/v2/satellite/test' }] },
});

/** Minimal Open-Meteo bulk response: 140 points (14x10 grid — denser field
 *  sampling than the original 8x6 for visibly continuous gradients), 2 hourly
 *  steps, all field vars. Length must match the production grid size so
 *  parseFieldResponse accepts the mock. Grid is 32×24 = 768 since #172. */
const OPEN_METEO_FIELD = JSON.stringify(
  Array.from({ length: 32 * 24 }, () => ({
    hourly: {
      time: ['2026-05-19T00:00', '2026-05-19T01:00'],
      temperature_2m: [22, 23],
      relative_humidity_2m: [60, 65],
      pressure_msl: [1013, 1012],
      surface_pressure: [1010, 1009],
      apparent_temperature: [22, 23],
      dew_point_2m: [15, 16],
      wet_bulb_temperature_2m: [18, 19],
    },
  })),
);

/** Minimal Open-Meteo wind bulk response: 48 points (8x6 grid), 2 hourly steps. */
const OPEN_METEO_WIND = JSON.stringify(
  Array.from({ length: 48 }, () => ({
    hourly: {
      time: ['2026-05-19T00:00', '2026-05-19T01:00'],
      wind_speed_10m: [5, 6],
      wind_direction_10m: [180, 200],
      wind_gusts_10m: [8, 9],
    },
  })),
);

test.describe('mapa page', () => {
  test('mapa page loads with map container and search', async ({ page }) => {
    const res = await page.goto('mapa/');
    expect(res?.status()).toBe(200);
    await expect(page.locator('#map')).toBeVisible();
    // P1.7 — Search is icon-only until clicked. Wait for the toggle
    // AND verify the layer rail finished init (a known sentinel that
    // the JS handlers have wired up) before clicking.
    await expect(page.locator('#mw-search-toggle')).toBeVisible();
    await expect(page.locator('#layerbtn-base')).toBeVisible();
    await page.locator('#mw-search-toggle').click();
    await expect(page.getByPlaceholder(/Buscar un lugar/)).toBeVisible();
  });

  test('radar layer button activates and shows legend', async ({ page }) => {
    // Intercept the RainViewer manifest — no live network needed.
    await page.route('**/api.rainviewer.com/public/weather-maps.json', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: RAINVIEWER_MANIFEST,
      }),
    );

    // Intercept all RainViewer tile requests so MapLibre doesn't hit the network.
    await page.route('**/tilecache.rainviewer.com/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: TRANSPARENT_PNG,
      }),
    );

    await page.goto('mapa/');

    const radarBtn = page.locator('#layerbtn-radar');
    await expect(radarBtn).toBeVisible();
    await expect(page.locator('#legend')).toBeHidden();

    // Wait for the mocked manifest response to be received, then ensure the
    // button is interactive before clicking — eliminates any race with rvData.
    await page.waitForResponse('**/api.rainviewer.com/public/weather-maps.json');
    await expect(radarBtn).toBeEnabled();

    await radarBtn.click();

    // Asserts UI state only — no dependency on external tile pixels.
    await expect(radarBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#legend')).toBeVisible();
    await expect(page.locator('#legend li')).toHaveCount(4);
  });

  test('satellite layer button activates without an intensity legend', async ({ page }) => {
    await page.route('**/api.rainviewer.com/public/weather-maps.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: RAINVIEWER_MANIFEST }),
    );
    await page.route('**/tilecache.rainviewer.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG }),
    );

    await page.goto('mapa/');

    const satBtn = page.locator('#layerbtn-satellite');
    await expect(satBtn).toBeVisible();
    await page.waitForResponse('**/api.rainviewer.com/public/weather-maps.json');
    await expect(satBtn).toBeEnabled();

    await satBtn.click();

    await expect(satBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#layerbtn-radar')).toHaveAttribute('aria-pressed', 'false');
    // Satellite is imagery, not intensity-coded: the radar legend stays hidden.
    await expect(page.locator('#legend')).toBeHidden();
  });

  test('timeline appears for radar and the range scrubs frames', async ({ page }) => {
    await page.route('**/api.rainviewer.com/public/weather-maps.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: RAINVIEWER_MANIFEST }),
    );
    await page.route('**/tilecache.rainviewer.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG }),
    );

    await page.goto('mapa/');
    await page.waitForResponse('**/api.rainviewer.com/public/weather-maps.json');

    // P0.3 — Timeline pill is always visible now (was conditionally
    // 'hidden' before). Initial state is the dash placeholder.
    await expect(page.locator('#timeline')).toBeVisible();
    await expect(page.locator('#tl-time')).toHaveText('—');

    await page.locator('#layerbtn-radar').click();
    await expect(page.locator('#timeline')).toBeVisible();

    const range = page.locator('#tl-range');
    // 4 radar frames (3 past + 1 nowcast) → max index 3.
    await expect(range).toHaveAttribute('max', '3');

    const label = page.locator('#tl-time');
    const v0 = Number(await range.inputValue());
    const l0 = await label.textContent();

    // Prev steps back exactly one frame (clamped, no wrap) and updates the label.
    await page.locator('#tl-prev').click();
    const v1 = Number(await range.inputValue());
    expect(v1).toBe(Math.max(0, v0 - 1));
    expect(v1).toBeLessThan(v0);
    await expect(label).not.toHaveText(l0 ?? '');

    // Next steps forward exactly one frame.
    await page.locator('#tl-next').click();
    expect(Number(await range.inputValue())).toBe(v1 + 1);

    // Switching back to Base resets the timeline label to the placeholder.
    // (Pill itself stays visible — see P0.3.)
    await page.locator('#layerbtn-base').click();
    await expect(page.locator('#tl-time')).toHaveText('—');
  });

  test('temperature field layer activates with a legend and timeline', async ({ page }) => {
    await page.route('**/api.rainviewer.com/public/weather-maps.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: RAINVIEWER_MANIFEST }),
    );
    await page.route('**/tilecache.rainviewer.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG }),
    );
    await page.route('**/api.open-meteo.com/v1/forecast**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: OPEN_METEO_FIELD }),
    );

    await page.goto('mapa/');
    await page.waitForResponse('**/api.rainviewer.com/public/weather-maps.json');

    const tempBtn = page.locator('#layerbtn-temperature');
    await expect(tempBtn).toBeEnabled();
    const fieldResp = page.waitForResponse('**/api.open-meteo.com/v1/forecast**');
    await tempBtn.click();
    await fieldResp;

    await expect(page.locator('#layerbtn-temperature')).toHaveAttribute('aria-pressed', 'true');
    // P0.2 — legend moved into a floating bar; check the parent
    // wrapper which controls visibility.
    await expect(page.locator('#legend-bar')).toBeVisible();
    await expect(page.locator('#timeline')).toBeVisible();
    await expect(page.locator('#opacitywrap')).toBeVisible();

    await page.locator('#layerbtn-base').click();
    await expect(page.locator('#legend-bar')).toBeHidden();
    // P0.3 — timeline pill stays visible, only its label resets.
    await expect(page.locator('#tl-time')).toHaveText('—');
  });

  for (const layer of ['humidity', 'pressure'] as const) {
    test(`${layer} field layer activates with a legend and timeline`, async ({ page }) => {
      await page.route('**/api.rainviewer.com/public/weather-maps.json', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: RAINVIEWER_MANIFEST }),
      );
      await page.route('**/tilecache.rainviewer.com/**', (route) =>
        route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG }),
      );
      await page.route('**/api.open-meteo.com/v1/forecast**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: OPEN_METEO_FIELD }),
      );

      await page.goto('mapa/');
      await page.waitForResponse('**/api.rainviewer.com/public/weather-maps.json');

      const btn = page.locator(`#layerbtn-${layer}`);
      await expect(btn).toBeEnabled();
      const fieldResp = page.waitForResponse('**/api.open-meteo.com/v1/forecast**');
      await btn.click();
      await fieldResp;

      await expect(btn).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#legend-bar')).toBeVisible();
      await expect(page.locator('#timeline')).toBeVisible();
      await expect(page.locator('#opacitywrap')).toBeVisible();

      await page.locator('#layerbtn-base').click();
      await expect(page.locator('#legend-bar')).toBeHidden();
      await expect(page.locator('#tl-time')).toHaveText('—');
    });
  }

  test('wind layer activates with a legend and timeline', async ({ page }) => {
    await page.route('**/api.rainviewer.com/public/weather-maps.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: RAINVIEWER_MANIFEST }),
    );
    await page.route('**/tilecache.rainviewer.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG }),
    );
    // Wind bulk URL carries `hourly=wind_speed_10m,wind_direction_10m`; route by query.
    await page.route(/api\.open-meteo\.com\/v1\/forecast.*wind_speed_10m/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: OPEN_METEO_WIND }),
    );

    await page.goto('mapa/');
    await page.waitForResponse('**/api.rainviewer.com/public/weather-maps.json');

    const btn = page.locator('#layerbtn-wind');
    await expect(btn).toBeEnabled();
    const windResp = page.waitForResponse(/api\.open-meteo\.com\/v1\/forecast.*wind_speed_10m/);
    await btn.click();
    await windResp;

    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#legend-bar')).toBeVisible();
    await expect(page.locator('#timeline')).toBeVisible();
    await expect(page.locator('#opacitywrap')).toBeVisible();

    await page.locator('#layerbtn-base').click();
    await expect(page.locator('#legend-bar')).toBeHidden();
    await expect(page.locator('#tl-time')).toHaveText('—');
  });

  test('search input shows an autocomplete listbox with multiple options before fly', async ({
    page,
  }) => {
    // Mocks: geocode (CDMX fixture has 2 results) + RainViewer + OSM tiles.
    await mockOpenMeteo(page);
    await page.route('**/api.rainviewer.com/public/weather-maps.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: RAINVIEWER_MANIFEST }),
    );
    await page.route('**/tile.openstreetmap.org/**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG }),
    );

    await page.goto('mapa/');

    // Wait for the map's preset pins (5 cities) to render before snapshotting
    // the marker count — they're added by renderPins() on `map.on('load')`.
    await expect(page.locator('.maplibregl-marker')).toHaveCount(5);
    const presetCount = 5;

    // P1.7 — Search is collapsed by default; expand it via the icon.
    await page.locator('#mw-search-toggle').click();
    const mapq = page.locator('#mapq');
    await expect(mapq).toBeVisible();
    await expect(mapq).toHaveAttribute('aria-expanded', 'false');
    await mapq.fill('Ciudad');

    const listbox = page.locator('#mapac');
    await expect(listbox).toBeVisible();
    await expect(mapq).toHaveAttribute('aria-expanded', 'true');

    // The CDMX fixture returns 2 distinct results (Ciudad de México +
    // Mexicali). The combobox must show more than one option so the user
    // can verify which match they want — issue #81's regression assertion.
    const options = page.locator('#mapac > li');
    await expect(options).toHaveCount(2);

    // Marker count is unchanged: no auto-fly, no auto-pin happened.
    await expect(page.locator('.maplibregl-marker')).toHaveCount(presetCount);

    // Clicking an option drops a user pin (+1 marker) and closes the list.
    await options.first().click();
    await expect(listbox).toBeHidden();
    await expect(mapq).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.maplibregl-marker')).toHaveCount(presetCount + 1);
  });

  test('sunlight overlay activates without timeline or legend', async ({ page }) => {
    await page.route('**/api.rainviewer.com/public/weather-maps.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: RAINVIEWER_MANIFEST }),
    );
    await page.route('**/tilecache.rainviewer.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG }),
    );

    await page.goto('mapa/');
    await page.waitForResponse('**/api.rainviewer.com/public/weather-maps.json');

    const btn = page.locator('#layerbtn-sunlight');
    await expect(btn).toBeEnabled();
    await btn.click();

    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#legend-bar')).toBeHidden();
    // P0.3 — timeline stays mounted; just check the placeholder text.
    await expect(page.locator('#tl-time')).toHaveText('—');
    await expect(page.locator('#opacitywrap')).toBeVisible();

    await page.locator('#layerbtn-base').click();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
  });
});

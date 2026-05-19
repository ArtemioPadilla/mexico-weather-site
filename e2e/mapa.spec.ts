import { test, expect } from '@playwright/test';

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

test.describe('mapa page', () => {
  test('mapa page loads with map container and search', async ({ page }) => {
    const res = await page.goto('mapa/');
    expect(res?.status()).toBe(200);
    await expect(page.locator('#map')).toBeVisible();
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

    // Hidden until a raster layer is active.
    await expect(page.locator('#timeline')).toBeHidden();

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

    // Switching back to Base hides the timeline.
    await page.locator('#layerbtn-base').click();
    await expect(page.locator('#timeline')).toBeHidden();
  });
});

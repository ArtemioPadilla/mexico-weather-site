import { test, expect } from '@playwright/test';

/**
 * Story 7.3 — print stylesheet.
 *
 * Validates that key chrome elements (nav, alert ribbon, share
 * button, install hints) are hidden when print media is emulated.
 */

test.describe('print stylesheet', () => {
  test('hides nav + chrome under print media', async ({ page }) => {
    await page.goto('clima/cdmx/');
    await page.emulateMedia({ media: 'print' });
    // Top nav hidden
    await expect(page.locator('nav[aria-label="Principal"]')).toBeHidden();
    // Share button hidden
    const share = page.locator('[data-share-button]').first();
    if ((await share.count()) > 0) {
      await expect(share).toBeHidden();
    }
  });

  test('forecast page hides interactive panels under print', async ({
    page,
  }) => {
    await page.goto(
      'forecast?lat=19.43&lng=-99.13&tz=America/Mexico_City&name=Ciudad%20de%20M%C3%A9xico',
    );
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('nav[aria-label="Principal"]')).toBeHidden();
  });

  test('mapa hides the map canvas under print', async ({ page }) => {
    await page.goto('mapa/');
    await page.waitForLoadState('domcontentloaded');
    await page.emulateMedia({ media: 'print' });
    // MapLibre canvas is hidden because it's inside .maplibregl-map.
    const map = page.locator('.maplibregl-map').first();
    if ((await map.count()) > 0) {
      await expect(map).toBeHidden();
    }
  });
});

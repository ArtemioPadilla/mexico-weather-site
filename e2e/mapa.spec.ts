import { test, expect } from '@playwright/test';

test.describe('mapa page', () => {
  test('mapa page loads with map container and search', async ({ page }) => {
    const res = await page.goto('mapa/');
    expect(res?.status()).toBe(200);
    await expect(page.locator('#map')).toBeVisible();
    await expect(page.getByPlaceholder(/Buscar un lugar/)).toBeVisible();
  });

  // TODO(weather-maps): re-enable when RainViewer is reachable in CI/sandbox
  test.skip('radar layer button activates and shows legend', async ({ page }) => {
    await page.goto('mapa/');
    const radarBtn = page.locator('#layerbtn-radar');
    await expect(radarBtn).toBeVisible();
    await expect(page.locator('#legend')).toBeHidden();
    await radarBtn.click();
    // Asserts UI state only — no dependency on external tile pixels.
    await expect(radarBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#legend')).toBeVisible();
    await expect(page.locator('#legend li')).toHaveCount(4);
  });
});

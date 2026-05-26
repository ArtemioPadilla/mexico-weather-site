import { test, expect } from '@playwright/test';

/**
 * Story 4.2 — index page search filter.
 *
 * Each category index has a search input that filters the list
 * client-side, diacritic-insensitive substring match on name + admin.
 */

const PAGES = [
  { name: 'clima', url: 'clima/', expectedMin: 25 },
  { name: 'playa', url: 'playa/', expectedMin: 10 },
  { name: 'estado', url: 'estado/', expectedMin: 30 },
  { name: 'volcan', url: 'volcan/', expectedMin: 5 },
];

test.describe('catalog index filter', () => {
  for (const p of PAGES) {
    test(`/${p.name}/: typing filters visible items`, async ({ page }) => {
      await page.goto(p.url);
      const input = page.locator('#catalog-filter');
      await expect(input).toBeVisible();
      const all = page.locator('[data-catalog-item]');
      const initialCount = await all.count();
      expect(initialCount).toBeGreaterThanOrEqual(p.expectedMin);

      // Type a string that matches very few items.
      await input.fill('zzz-nonexistent-xyz');
      await page.waitForTimeout(200);
      const empty = page.locator('#catalog-empty');
      await expect(empty).toBeVisible();
    });
  }

  test('clima filter is diacritic-insensitive', async ({ page }) => {
    await page.goto('clima/');
    await page.locator('#catalog-filter').fill('merida');
    await page.waitForTimeout(200);
    // The Mérida link should still be visible
    await expect(page.getByRole('link', { name: /Mérida/ })).toBeVisible();
  });
});

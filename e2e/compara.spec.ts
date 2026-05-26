import { test, expect } from '@playwright/test';

/**
 * Story 5.1 — compare view.
 */

test.describe('/compara/', () => {
  test('renders 2 default columns when no slugs param', async ({ page }) => {
    await page.goto('compara/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    const cards = page.locator('#cmp-grid article');
    await expect(cards).toHaveCount(2);
  });

  test('renders 3 columns from ?slugs= URL', async ({ page }) => {
    await page.goto('compara/?slugs=cdmx,guadalajara,monterrey');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    const cards = page.locator('#cmp-grid article');
    await expect(cards).toHaveCount(3);
  });

  test('clicking a toggle adds a city, click again removes', async ({ page }) => {
    await page.goto('compara/?slugs=cdmx');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(300);
    // Click Guadalajara toggle to add
    const gdl = page.locator('button[data-cmp-toggle][data-slug="guadalajara"]');
    await gdl.click();
    await expect(page.locator('#cmp-grid article')).toHaveCount(2);
    await expect(gdl).toHaveAttribute('aria-pressed', 'true');
    // Click again to remove
    await gdl.click();
    await expect(page.locator('#cmp-grid article')).toHaveCount(1);
  });

  test('caps at 4 cities — 5th selection blocked + warning shown', async ({
    page,
  }) => {
    await page.goto('compara/?slugs=cdmx,guadalajara,monterrey,puebla');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(300);
    const slots = page.locator('#cmp-grid article');
    await expect(slots).toHaveCount(4);
    // Try to add a 5th
    await page.locator('button[data-cmp-toggle][data-slug="merida"]').click();
    await expect(page.locator('#cmp-cap')).toBeVisible();
    await expect(slots).toHaveCount(4);
  });

  test('linked from catalog dropdown is reachable', async ({ page }) => {
    await page.goto('compara/');
    await expect(page).toHaveTitle(/Comparar clima/);
  });
});

import { test, expect } from '@playwright/test';

/**
 * Story 6.1 + 6.2 — language toggle.
 *
 * The toggle persists via sessionStorage and reloads the page. On
 * reload, an inline pre-paint script in BaseLayout reads the
 * sessionStorage key and:
 *   - Sets <html lang> to the chosen language
 *   - Swaps every element carrying data-i18n-en to its English text
 */

test.describe('language toggle', () => {
  test('default render is Spanish', async ({ page }) => {
    await page.goto('');
    const home = page.getByRole('link', { name: 'Inicio' }).first();
    await expect(home).toBeVisible();
  });

  test('toggle swaps to English on reload', async ({ page }) => {
    await page.goto('');
    // Verify ES first
    await expect(page.getByRole('link', { name: 'Inicio' }).first()).toBeVisible();

    // Click the toggle (currently labeled EN, since we're on ES)
    await page.locator('#lang-toggle-btn').click();
    // After reload, nav should be in English
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('link', { name: 'Home' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Map' }).first()).toBeVisible();
  });

  test('language preference persists across pages', async ({ page }) => {
    await page.goto('');
    await page.locator('#lang-toggle-btn').click();
    await page.waitForLoadState('domcontentloaded');
    // Navigate to another page
    await page.goto('clima/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('link', { name: 'Home' }).first()).toBeVisible();
  });

  test('?lang=en URL param activates English on first load (Story 6.3)', async ({
    page,
  }) => {
    // Fresh visit via the hreflang sibling URL.
    await page.goto('clima/cdmx/?lang=en');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    // Nav strings should be English.
    await expect(page.getByRole('link', { name: 'Home' }).first()).toBeVisible();
  });

  test('hreflang link tags are present on landing pages', async ({ page }) => {
    await page.goto('clima/cdmx/');
    const es = page.locator('link[rel="alternate"][hreflang="es-MX"]');
    const en = page.locator('link[rel="alternate"][hreflang="en-US"]');
    const xdef = page.locator('link[rel="alternate"][hreflang="x-default"]');
    await expect(es).toHaveCount(1);
    await expect(en).toHaveCount(1);
    await expect(xdef).toHaveCount(1);
    const enHref = await en.getAttribute('href');
    expect(enHref).toContain('lang=en');
  });
});

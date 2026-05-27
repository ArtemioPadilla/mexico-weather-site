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

  test('city landing translates body strings to English', async ({ page }) => {
    await page.goto('clima/cdmx/?lang=en');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    // The H1 was "Clima en Ciudad de México, CDMX" — should now read "Weather in...".
    await expect(
      page.getByRole('heading', { level: 1, name: /Weather in Ciudad de México/ }),
    ).toBeVisible();
    // Breadcrumb middle hop.
    await expect(page.getByText('Weather by city').first()).toBeVisible();
    // Next-days section heading.
    await expect(page.getByRole('heading', { level: 2, name: 'Next days' })).toBeVisible();
    // CTA button.
    await expect(
      page.getByText(/See full forecast for Ciudad de México/),
    ).toBeVisible();
  });

  test('beach landing translates to English', async ({ page }) => {
    await page.goto('playa/cancun/?lang=en');
    await page.waitForLoadState('domcontentloaded');
    await expect(
      page.getByRole('heading', { level: 1, name: /Sea at Cancún/ }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Now at the coast' })).toBeVisible();
    // Wave height / Sea temperature labels are inside the marine
    // panel which only shows after data loads; assert they're in
    // the DOM (rather than visible) since the snapshot may 404 in
    // CI before the workflow has run.
    await expect(page.locator('text=Wave height').first()).toBeAttached();
    await expect(page.locator('text=Sea temperature').first()).toBeAttached();
  });

  test('state landing translates to English', async ({ page }) => {
    await page.goto('estado/jalisco/?lang=en');
    await page.waitForLoadState('domcontentloaded');
    await expect(
      page.getByRole('heading', { level: 1, name: /Weather in Jalisco/ }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Capital' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Cities' })).toBeVisible();
  });

  test('volcano landing translates to English', async ({ page }) => {
    await page.goto('volcan/popocatepetl/?lang=en');
    await page.waitForLoadState('domcontentloaded');
    await expect(
      page.getByRole('heading', { level: 1, name: /Popocatépetl volcano/ }),
    ).toBeVisible();
    await expect(page.getByText('Elevation').first()).toBeVisible();
    await expect(page.getByText('Last eruption').first()).toBeVisible();
  });
});

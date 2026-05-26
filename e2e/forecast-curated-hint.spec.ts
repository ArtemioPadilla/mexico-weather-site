import { test, expect } from '@playwright/test';
import { mockOpenMeteo } from './helpers';

/**
 * Story 2.2 — reverse-geocode hint on /forecast.
 */

test.describe('curated-page hint on /forecast', () => {
  test.beforeEach(async ({ page }) => {
    await mockOpenMeteo(page);
  });

  test('shows hint linking to /clima/cdmx/ when coords match CDMX', async ({
    page,
  }) => {
    await page.goto(
      'forecast?lat=19.43&lng=-99.13&tz=America/Mexico_City&name=Ciudad%20de%20M%C3%A9xico',
    );
    const hint = page.locator('#fc-curated-hint');
    await expect(hint).toBeVisible();
    const link = page.locator('#fc-curated-link');
    await expect(link).toHaveAttribute('href', /\/clima\/cdmx\/$/);
    await expect(link).toContainText('Ciudad de México');
  });

  test('no hint for off-list coords', async ({ page }) => {
    // Mid-Hidalgo, not in TOP_CITIES.
    await page.goto(
      'forecast?lat=20.5&lng=-98.5&tz=America/Mexico_City&name=Random',
    );
    const hint = page.locator('#fc-curated-hint');
    await expect(hint).toBeHidden();
  });

  test('dismiss persists via sessionStorage', async ({ page }) => {
    await page.goto(
      'forecast?lat=19.43&lng=-99.13&tz=America/Mexico_City&name=Ciudad%20de%20M%C3%A9xico',
    );
    const hint = page.locator('#fc-curated-hint');
    await expect(hint).toBeVisible();
    await page.locator('#fc-curated-dismiss').click();
    await expect(hint).toBeHidden();
    // Navigate within the same session — should stay dismissed.
    await page.goto(
      'forecast?lat=20.66&lng=-103.35&tz=America/Mexico_City&name=Guadalajara',
    );
    await expect(page.locator('#fc-curated-hint')).toBeHidden();
  });
});

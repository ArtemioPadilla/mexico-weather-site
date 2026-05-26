import { test, expect } from '@playwright/test';
import { mockOpenMeteo } from './helpers';

/**
 * Story 9.1 — outdoor planner mode.
 */

test.describe('outdoor mode toggle on /forecast', () => {
  test.beforeEach(async ({ page }) => {
    await mockOpenMeteo(page);
  });

  test('toggle hides low-priority detail panels', async ({ page }) => {
    await page.goto(
      'forecast?lat=19.43&lng=-99.13&tz=America/Mexico_City&name=CDMX',
    );
    // Wait for the forecast to render
    await page.waitForSelector('#fc-root:not(.hidden)', { timeout: 10000 });

    // Sky-air panel (humidity/pressure/visibility) starts visible
    const skyPanel = page.locator('[data-low-priority]').first();
    await expect(skyPanel).toBeVisible();

    // Click outdoor mode toggle
    await page.locator('#fc-outdoor-mode').check();
    // Now hidden
    await expect(skyPanel).toBeHidden();
    // Class is applied
    await expect(page.locator('#fc-root')).toHaveClass(/outdoor-mode/);
  });

  test('outdoor mode persists across page navigation', async ({ page }) => {
    await page.goto(
      'forecast?lat=19.43&lng=-99.13&tz=America/Mexico_City&name=CDMX',
    );
    await page.waitForSelector('#fc-root:not(.hidden)', { timeout: 10000 });
    await page.locator('#fc-outdoor-mode').check();

    // Navigate to another forecast URL — outdoor mode should re-apply
    await page.goto(
      'forecast?lat=20.66&lng=-103.35&tz=America/Mexico_City&name=Guadalajara',
    );
    await page.waitForSelector('#fc-root:not(.hidden)', { timeout: 10000 });
    await expect(page.locator('#fc-outdoor-mode')).toBeChecked();
    await expect(page.locator('#fc-root')).toHaveClass(/outdoor-mode/);
  });
});

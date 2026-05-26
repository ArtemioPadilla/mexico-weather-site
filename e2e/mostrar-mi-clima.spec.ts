import { test, expect } from '@playwright/test';

/**
 * Story 2.1 — "Mostrar mi clima" button on /.
 *
 * Uses Playwright's geolocation mocking to feed deterministic
 * coordinates to the page, then asserts the resulting redirect
 * matches the expected curated landing (CDMX) vs URL-param /forecast
 * (off-list coords) vs error toast (outside MX).
 */

test.describe('Mostrar mi clima button', () => {
  test('button is the primary CTA above the search bar', async ({ page }) => {
    await page.goto('');
    const btn = page.locator('#geo');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText(/Mostrar mi clima/);
    // Bigger than the search input — verify by checking it's a wide
    // block, not the compact side-button from the prior layout.
    const box = await btn.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(300);
  });

  test('CDMX coords funnel to /clima/cdmx/ (curated landing)', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 19.43, longitude: -99.13 });
    await page.goto('');

    await page.locator('#geo').click();
    await page.waitForURL(/\/clima\/cdmx\/?$/, { timeout: 15000 });
    await expect(
      page.getByRole('heading', { level: 1, name: /Ciudad de México/ }),
    ).toBeVisible();
  });

  test('off-list MX coords funnel to /forecast/?lat=&lng=', async ({
    page,
    context,
  }) => {
    // A small town in the middle of Hidalgo that's NOT in TOP_CITIES
    // but IS inside the MX polygon set.
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 20.5, longitude: -98.5 });
    await page.goto('');

    await page.locator('#geo').click();
    await page.waitForURL(/\/forecast\?/, { timeout: 15000 });
    const url = new URL(page.url());
    expect(Number(url.searchParams.get('lat'))).toBeCloseTo(20.5, 3);
    expect(Number(url.searchParams.get('lng'))).toBeCloseTo(-98.5, 3);
  });

  test('coords outside MX show an explanatory toast, no redirect', async ({
    page,
    context,
  }) => {
    // San Antonio, Texas — well outside any MX state polygon.
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 29.42, longitude: -98.49 });
    await page.goto('');
    const homeUrl = page.url();

    await page.locator('#geo').click();
    // Toast appears with the outside-MX message.
    await expect(
      page.getByText(/fuera de México/i),
    ).toBeVisible({ timeout: 15000 });
    // Page didn't navigate.
    expect(page.url()).toBe(homeUrl);
    // Button is re-enabled (not stuck in "Buscando…").
    await expect(page.locator('#geo')).toBeEnabled();
  });
});

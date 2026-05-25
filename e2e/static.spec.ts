import { test, expect } from '@playwright/test';

test.describe('static routes', () => {
  test('privacy-4: privacy page back-link returns to home', async ({ page }) => {
    await page.goto('privacidad/');
    const back = page
      .getByRole('link', { name: /Volver al inicio|Inicio/ })
      .first();
    await expect(back).toBeVisible();
    await back.click();
    await page.waitForURL(/\/mexico-weather\/$/);
    await expect(
      page.getByRole('heading', { level: 1, name: /Clima México/ }),
    ).toBeVisible();
  });

  test('rss-1: /rss.xml returns 200 and valid XML', async ({ page }) => {
    const res = await page.request.get('rss.xml');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(
      /(application|text)\/(rss\+)?xml/,
    );
    const body = await res.text();
    expect(body).toContain('<rss');
    expect(body).toContain('<channel>');
    expect(body).toContain('<item>');
  });

  test('sitemap-1: /sitemap.xml returns 200 and valid XML', async ({ page }) => {
    const res = await page.request.get('sitemap.xml');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/xml/);
    const body = await res.text();
    expect(body).toMatch(/<(urlset|sitemapindex)/);
    // City + beach landing pages should appear so search engines can
    // discover them.
    expect(body).toContain('clima/cdmx/');
    expect(body).toContain('playa/cancun/');
    expect(body).toContain('estado/jalisco/');
    expect(body).toContain('volcan/popocatepetl/');
  });

  test('index-1: /clima/ index lists all 30 cities', async ({ page }) => {
    await page.goto('clima/');
    await expect(page).toHaveTitle(/Clima por ciudad en México/);
    const links = page.locator('main a[href*="/clima/"]');
    // Each city has one link; plus the home breadcrumb.
    const count = await links.count();
    expect(count).toBeGreaterThanOrEqual(30);
  });

  test('clima-1: /clima/cdmx/ has SEO title + H1 with city name', async ({ page }) => {
    await page.goto('clima/cdmx/');
    await expect(page).toHaveTitle(/Clima en Ciudad de México/);
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toContainText('Ciudad de México');
    // The CTA must link to the interactive forecast with the right params.
    const cta = page.getByRole('link', {
      name: /Ver pronóstico completo de Ciudad de México/,
    });
    await expect(cta).toBeVisible();
    const href = await cta.getAttribute('href');
    expect(href).toMatch(/forecast\/\?lat=19\.43/);
    expect(href).toMatch(/lng=-99\.13/);
  });

  test('volcan-1: /volcan/popocatepetl/ has volcano title + CENAPRED link', async ({
    page,
  }) => {
    await page.goto('volcan/popocatepetl/');
    await expect(page).toHaveTitle(/Popocatépetl/);
    await expect(
      page.getByRole('heading', { level: 1, name: /Popocatépetl/ }),
    ).toBeVisible();
    const cenapred = page.getByRole('link', { name: /CENAPRED/ }).first();
    await expect(cenapred).toBeVisible();
    const href = await cenapred.getAttribute('href');
    expect(href).toContain('cenapred');
  });

  test('estado-1: /estado/jalisco/ lists Guadalajara as a city', async ({ page }) => {
    await page.goto('estado/jalisco/');
    await expect(page).toHaveTitle(/Clima en Jalisco/);
    await expect(
      page.getByRole('heading', { level: 1, name: /Jalisco/ }),
    ).toBeVisible();
    // Guadalajara should appear in the Ciudades section and link to /clima/guadalajara/.
    const gdlLink = page.getByRole('link', { name: /Guadalajara/ }).first();
    await expect(gdlLink).toBeVisible();
    const href = await gdlLink.getAttribute('href');
    expect(href).toContain('/clima/guadalajara/');
  });

  test('playa-1: /playa/cancun/ has marine-focused title + H1', async ({ page }) => {
    await page.goto('playa/cancun/');
    await expect(page).toHaveTitle(/oleaje en Cancún/);
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toContainText('Cancún');
    await expect(h1).toContainText('Quintana Roo');
  });
});

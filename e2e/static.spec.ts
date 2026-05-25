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

  test('playa-1: /playa/cancun/ has marine-focused title + H1', async ({ page }) => {
    await page.goto('playa/cancun/');
    await expect(page).toHaveTitle(/oleaje en Cancún/);
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toContainText('Cancún');
    await expect(h1).toContainText('Quintana Roo');
  });
});

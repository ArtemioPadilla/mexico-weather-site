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
  });
});

import { test, expect } from '@playwright/test';
import { mockOpenMeteo } from './helpers';

test.describe('search & forecast (deterministic, mocked Open-Meteo)', () => {
  test.beforeEach(async ({ page }) => {
    await mockOpenMeteo(page);
  });

  test('typing in the combobox shows autocomplete options and selecting one navigates to /forecast', async ({
    page,
  }) => {
    await page.goto('');

    const combo = page.getByRole('combobox', {
      name: 'Buscar cualquier ciudad o lugar…',
    });
    await combo.fill('Ciudad de México');

    // The geocode fixture is served via page.route — an option must appear.
    const listbox = page.getByRole('listbox');
    const option = page.getByRole('option', { name: /Ciudad de México/ });
    await expect(listbox).toBeVisible();
    await expect(option.first()).toBeVisible();

    await option.first().click();

    await page.waitForURL(/\/forecast\?/);
    const url = new URL(page.url());
    expect(url.pathname).toMatch(/\/forecast$/);
    expect(Number(url.searchParams.get('lat'))).toBeCloseTo(19.42847, 3);
    expect(Number(url.searchParams.get('lng'))).toBeCloseTo(-99.12766, 3);
    expect(url.searchParams.get('name')).toBe('Ciudad de México');
  });

  test('/forecast with query params renders current temp, 7-day section and detail panels', async ({
    page,
  }) => {
    await page.goto(
      'forecast?lat=19.43&lng=-99.13&tz=America/Mexico_City&name=Ciudad%20de%20M%C3%A9xico',
    );

    // Current conditions header from the forecast fixture.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Ciudad de México' }),
    ).toBeVisible();
    // Current temperature is 24.7 → rounded to 25°.
    await expect(page.getByText('25°', { exact: true })).toBeVisible();

    // 7-day outlook section.
    await expect(
      page.getByRole('heading', { name: '7 días' }),
    ).toBeVisible();

    // The 7-day rows must render a temperature-range bar fill: at least one
    // <i> with an inline `left:` style under the #fc-root section.
    const barFill = page.locator('#fc-root i[style*="left:"]').first();
    await expect(barFill).toHaveCount(1);
    const style = (await barFill.getAttribute('style')) ?? '';
    expect(style).toMatch(/left:\d/);

    // Hourly (48 h) section.
    await expect(
      page.getByRole('heading', { name: /Por hora/ }),
    ).toBeVisible();

    // Detail panels: Viento / Índice UV / Cielo y aire.
    await expect(
      page.getByRole('heading', { name: 'Detalle' }),
    ).toBeVisible();
    const root = page.locator('#fc-root');
    await expect(root.getByText('Viento', { exact: true })).toBeVisible();
    await expect(root.getByText('Índice UV', { exact: true })).toBeVisible();
    await expect(root.getByText('Cielo y aire', { exact: true })).toBeVisible();

    // Concrete numbers from the fixture must be rendered (wind 14.5 → 15 km/h,
    // UV 7.2 → 7). Sanity check that the panel is not all em-dashes.
    await expect(root.getByText('15 km/h')).toBeVisible();
    const rootText = (await root.textContent()) ?? '';
    const dashes = (rootText.match(/—/g) ?? []).length;
    expect(dashes).toBeLessThan(5);
  });
});

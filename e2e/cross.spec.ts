import { test, expect } from '@playwright/test';
import { mockOpenMeteo } from './helpers';

test.describe('cross-route journeys', () => {
  test('cross-1: theme persists across /, /mapa, /forecast', async ({
    page,
  }) => {
    await mockOpenMeteo(page);

    // Land on home, cycle theme toggle until we reach "Oscuro".
    await page.goto('');
    const toggle = page.locator('#theme-toggle-btn');
    await expect(toggle).toBeVisible();
    for (let i = 0; i < 4; i++) {
      const label = (await toggle.getAttribute('aria-label')) ?? '';
      if (/Oscuro/.test(label)) break;
      await toggle.click();
    }
    await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);

    // Navigate to /mapa and confirm dark class still applies.
    await page.goto('mapa/');
    await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);

    // Navigate to /forecast and confirm again.
    await page.goto(
      'forecast/?lat=19.43&lng=-99.13&name=Ciudad+de+M%C3%A9xico&tz=America%2FMexico_City',
    );
    await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);
  });

  test('cross-2: Inicio + Mapa nav links visible on every route', async ({
    page,
  }) => {
    await mockOpenMeteo(page);
    const routes = [
      '',
      'mapa/',
      'forecast/?lat=19.43&lng=-99.13&name=CDMX&tz=America%2FMexico_City',
      'privacidad/',
    ];
    for (const route of routes) {
      await page.goto(route);
      const inicio = page.getByRole('link', { name: 'Inicio', exact: true });
      const mapa = page.getByRole('link', { name: 'Mapa', exact: true });
      await expect(inicio.first()).toBeVisible();
      await expect(mapa.first()).toBeVisible();
      await expect(inicio.first()).toHaveAttribute('href', /\/mexico-weather\/$/);
      await expect(mapa.first()).toHaveAttribute('href', /\/mexico-weather\/mapa\/?$/);
    }
  });

  test('cross-3: feedback FAB reachable from every route', async ({ page }) => {
    await mockOpenMeteo(page);
    const routes = [
      '',
      'mapa/',
      'forecast/?lat=19.43&lng=-99.13&name=CDMX&tz=America%2FMexico_City',
      'privacidad/',
    ];
    for (const route of routes) {
      await page.goto(route);
      const fab = page.locator('#secid-report-btn');
      await expect(fab).toBeVisible();
    }
  });

  test('cross-4: own-scoped service worker registered under /mexico-weather/', async ({
    page,
  }) => {
    await mockOpenMeteo(page);
    await page.goto('');
    // SW registration is deferred and best-effort; skip cleanly if the runner
    // disables service workers entirely.
    const scopes = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return null;
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        return regs.map((r) => r.scope);
      } catch {
        return null;
      }
    });
    test.skip(scopes === null, 'service worker API unavailable in this runner');
    expect(scopes!.some((s) => /\/mexico-weather\/$/.test(s))).toBe(true);
  });
});

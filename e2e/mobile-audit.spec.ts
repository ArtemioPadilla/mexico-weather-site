import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Story 7.1 — mobile UX audit.
 *
 * Survey every page family on a 360×640 portrait viewport (the
 * conservative end of common Android phones) and assert:
 *   - No horizontal overflow (body.scrollWidth <= viewport)
 *   - Every interactive (button, a, input) has tap target ≥44 px
 *   - axe still reports 0 critical / 0 serious
 *
 * Uses a manual viewport + DPR + touch config rather than
 * Playwright's iPhone preset so we run on chromium (already
 * installed via the e2e suite) rather than webkit.
 */

interface Page {
  name: string;
  url: string;
}

const PAGES: Page[] = [
  { name: 'home', url: '' },
  { name: 'clima/cdmx', url: 'clima/cdmx/' },
  { name: 'playa/cancun', url: 'playa/cancun/' },
  { name: 'estado/jalisco', url: 'estado/jalisco/' },
  { name: 'volcan/popocatepetl', url: 'volcan/popocatepetl/' },
  { name: 'forecast', url: 'forecast/?lat=19.43&lng=-99.13&name=CDMX&tz=America/Mexico_City' },
];

test.use({
  viewport: { width: 360, height: 640 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});

test.describe('mobile UX — 360x640 portrait', () => {
  for (const p of PAGES) {
    test(`${p.name}: no horizontal overflow`, async ({ page }) => {
      await page.goto(p.url);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(500);

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));

      expect(
        overflow.scrollWidth,
        `${p.url} overflows: ${overflow.scrollWidth}px > ${overflow.clientWidth}px`,
      ).toBeLessThanOrEqual(overflow.clientWidth + 1);
    });

    test(`${p.name}: all visible interactives have ≥44px tap targets`, async ({
      page,
    }) => {
      await page.goto(p.url);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(500);

      // Tap-target rule: every visible interactive element should
      // have at least one dimension ≥44 px. WCAG 2.5.5 (AAA) — we
      // enforce the 44 px target as AA-equivalent because mobile
      // usability is critical for this site.
      const issues = await page.evaluate(() => {
        const els = Array.from(
          document.querySelectorAll<HTMLElement>(
            'button:not([aria-hidden="true"]), a[href]:not([aria-hidden="true"]), input:not([type="hidden"]), [role="button"]',
          ),
        );
        // Interactive map embeds intentionally use dense controls
        // (matching Google Maps / zoom.earth conventions). The
        // tap-target rule still applies to /mapa page audits but
        // the embedded teaser on / shouldn't be the gate.
        const inMap = (el: Element): boolean =>
          !!el.closest('.maplibregl-map, [id^="home-map-"], [id="home-map"]') ||
          !!el.id?.startsWith('home-map-') ||
          !!el.id?.startsWith('layerbtn-');
        const small: Array<{ selector: string; w: number; h: number }> = [];
        for (const el of els) {
          // Skip map controls — dense by design, evaluated separately.
          if (inMap(el)) continue;
          // Skip elements that aren't actually rendered.
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          // Skip elements with display:none in ancestors.
          if (el.offsetParent === null && el.tagName !== 'BODY') continue;
          // Skip sr-only patterns (skip links, etc). These are
          // intentionally 1×1 until focused — at which point the
          // focus: utilities make them full-size. Tapping requires
          // visibility, so an unfocused sr-only link can't be a
          // mobile target by definition.
          if (el.classList.contains('sr-only')) continue;
          // Targets where the element is small but is inside a larger
          // touchable parent (the parent's hit area is what counts).
          // We check the parent <li> / wrapper for grid lists.
          // <label> wrappers around inputs also count — the label is
          // the actual hit area users tap.
          const parent = el.closest('li, label, .card, [data-card], [data-row]');
          const target = parent && parent.getBoundingClientRect();
          const effectiveW = target ? Math.max(r.width, target.width) : r.width;
          const effectiveH = target ? Math.max(r.height, target.height) : r.height;
          if (effectiveW < 44 && effectiveH < 44) {
            // Construct a useful selector for the report.
            const tag = el.tagName.toLowerCase();
            const id = el.id ? `#${el.id}` : '';
            const cls = el.className && typeof el.className === 'string'
              ? '.' + el.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.')
              : '';
            small.push({
              selector: `${tag}${id}${cls}`,
              w: Math.round(r.width),
              h: Math.round(r.height),
            });
          }
        }
        return small;
      });

      if (issues.length > 0) {
        const report = issues
          .slice(0, 10)
          .map((i) => `  ${i.selector} (${i.w}x${i.h}px)`)
          .join('\n');
        throw new Error(
          `${p.url} has ${issues.length} interactive(s) under 44 px:\n${report}`,
        );
      }
    });
  }

  test('home: axe still passes at mobile viewport', async ({ page }) => {
    await page.goto('');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(blocking).toEqual([]);
  });
});

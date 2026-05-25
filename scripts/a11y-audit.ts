/**
 * Ad-hoc a11y audit script — runs axe-core against each top-level
 * route and prints critical + serious violations grouped by rule.
 *
 *   npx tsx scripts/a11y-audit.ts
 *
 * Requires the dev server running (`npm run dev`) on localhost:4321.
 */
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';

const ROUTES = [
  '/mexico-weather/',
  '/mexico-weather/mapa/',
  '/mexico-weather/forecast/?lat=19.43&lng=-99.13&name=Ciudad+de+M%C3%A9xico',
  '/mexico-weather/pregunta/',
  '/mexico-weather/privacidad/',
];

const BASE = 'http://localhost:4321';

async function run(): Promise<void> {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  let totalCritical = 0;
  let totalSerious = 0;
  for (const route of ROUTES) {
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 20000 });
      // Give interactive maps a beat to mount.
      await page.waitForTimeout(2000);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const critical = results.violations.filter((v) => v.impact === 'critical');
      const serious = results.violations.filter((v) => v.impact === 'serious');
      totalCritical += critical.length;
      totalSerious += serious.length;
      console.log(`\n── ${route}`);
      if (critical.length === 0 && serious.length === 0) {
        console.log('  no critical/serious violations');
      }
      for (const v of [...critical, ...serious]) {
        console.log(`  [${v.impact}] ${v.id} — ${v.help}`);
        console.log(`    ${v.helpUrl}`);
        for (const node of v.nodes.slice(0, 3)) {
          console.log(`    target: ${node.target.join(', ')}`);
          console.log(`    html: ${node.html.slice(0, 120)}`);
        }
      }
    } catch (e) {
      console.log(`\n── ${route}: ERROR ${(e as Error).message}`);
    }
    await page.close();
  }
  await browser.close();
  console.log(
    `\n══ Total: ${totalCritical} critical, ${totalSerious} serious violations`,
  );
  process.exit(totalCritical > 0 ? 1 : 0);
}

void run();

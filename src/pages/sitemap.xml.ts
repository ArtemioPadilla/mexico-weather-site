import type { APIRoute } from 'astro';
import { siteBase } from '../utils/paths';
import { TOP_CITIES } from '../lib/top-cities';
import { TOP_BEACHES } from '../lib/top-beaches';
import { MX_STATES } from '../lib/mx-states';

/**
 * Hand-built sitemap (no @astrojs/sitemap dependency — follows the
 * project's pattern of hand-rolled XML endpoints).
 */
export const GET: APIRoute = ({ site }) => {
  const basePath = siteBase();

  const pages = [
    '',
    'privacidad/',
    'mapa/',
    'forecast/',
    'pregunta/',
    ...TOP_CITIES.map((c) => `clima/${c.slug}/`),
    ...TOP_BEACHES.map((b) => `playa/${b.slug}/`),
    ...MX_STATES.map((s) => `estado/${s.slug}/`),
  ];
  const urls = pages
    .map((page) => new URL(`${basePath}${page}`, site).href)
    .map((loc) => `  <url>\n    <loc>${loc}</loc>\n  </url>`)
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
    },
  });
};

import type { APIRoute } from 'astro';

export const prerender = true;

/**
 * RSS 2.0 feed of meteorological alerts ("avisos meteorológicos") for Mexico.
 *
 * SMN source
 * ----------
 * The Servicio Meteorológico Nacional (SMN/CONAGUA) does NOT publish a
 * structured (CAP/RSS/JSON) feed of its "avisos meteorológicos" — those are
 * only available as HTML pages and PDFs. Its single stable, machine-readable
 * source is the official municipal-forecast Web Service documented at
 * https://smn.conagua.gob.mx/es/web-service-api :
 *
 *   GET https://smn.conagua.gob.mx/tools/GUI/webservices/?method=1
 *   -> gzip-compressed JSON ("DailyForecast_MX"), ~10k municipalities,
 *      refreshed hourly. Fields include probprec (precipitation probability),
 *      desciel (sky description), prec, raf (wind gusts), etc. The response is
 *      decompressed with the standard Web `DecompressionStream` API (no
 *      Node-only modules, so no extra dependencies / type packages).
 *
 * Note: SMN serves an incomplete TLS certificate chain, so Node's `fetch`
 * may reject it in some environments. That simply triggers the fallback
 * below — the build never fails and the feed is always valid.
 *
 * We consume that official SMN data and derive build-time "avisos" from the
 * municipalities whose forecast for today indicates significant weather
 * (high precipitation probability or notable wind gusts). Each becomes one
 * RSS <item>.
 *
 * Fallback (critical)
 * -------------------
 * The upstream fetch + gunzip + parse is wrapped in a timeout + try/catch.
 * If anything fails (network, timeout, bad data, nothing significant), the
 * build still succeeds and the feed is still valid RSS 2.0 containing a
 * single informational item pointing to the official SMN avisos page. The
 * feed is therefore never 404 and never invalid, and a network failure can
 * never break `npm run build`.
 */

// Derived from Astro's build-time env (astro.config.mjs `site` + `base`) so
// the feed URL can never drift from the deployed site configuration.
const SITE_URL =
  (import.meta.env.SITE ?? '').replace(/\/$/, '') +
  (import.meta.env.BASE_URL ?? '').replace(/\/$/, '');
const SMN_FORECAST_URL =
  'https://smn.conagua.gob.mx/tools/GUI/webservices/?method=1';
const SMN_AVISOS_URL =
  'https://smn.conagua.gob.mx/es/pronosticos/avisos/aviso-de-ciclon-tropical-en-el-oceano-pacifico';
const FETCH_TIMEOUT_MS = 12_000;
const MAX_ITEMS = 60;
// A municipality is "noteworthy" if heavy rain is likely or wind gusts are strong.
const MIN_PRECIP_PROBABILITY = 80;
const MIN_WIND_GUST_KMH = 50;

interface SmnForecast {
  nes: string; // estado
  nmun: string; // municipio
  ndia: string; // forecast day index ("0" = today)
  probprec: string; // precipitation probability (%)
  prec: string; // precipitation (l/m2)
  raf: string; // wind gusts (km/h)
  desciel: string; // sky description
  tmax: string;
  tmin: string;
}

interface FeedItem {
  title: string;
  description: string;
  link: string;
  guid: string;
  pubDate: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toNumber(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function fetchSmnForecast(): Promise<SmnForecast[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(SMN_FORECAST_URL, {
      signal: controller.signal,
      headers: { 'User-Agent': 'mexico-weather-site (build-time RSS)' },
    });
    if (!response.ok || !response.body) {
      throw new Error(`SMN responded with HTTP ${response.status}`);
    }
    // SMN normally gzip-compresses the payload; only decompress when the
    // server actually advertises gzip, otherwise read the body directly.
    const encoding = response.headers.get('Content-Encoding');
    const stream =
      encoding === 'gzip'
        ? response.body.pipeThrough(new DecompressionStream('gzip'))
        : response.body;
    const json = await new Response(stream).text();
    const data = JSON.parse(json) as SmnForecast[];
    if (!Array.isArray(data)) {
      throw new Error('SMN payload is not an array');
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function buildAvisoItems(forecasts: SmnForecast[]): FeedItem[] {
  const pubDate = new Date().toUTCString();
  return forecasts
    .filter((f) => f && f.ndia === '0')
    .filter(
      (f) =>
        toNumber(f.probprec) >= MIN_PRECIP_PROBABILITY ||
        toNumber(f.raf) >= MIN_WIND_GUST_KMH,
    )
    .sort((a, b) => toNumber(b.probprec) - toNumber(a.probprec))
    .slice(0, MAX_ITEMS)
    .map((f) => {
      const place = `${f.nmun}, ${f.nes}`;
      const probprec = toNumber(f.probprec);
      const gust = toNumber(f.raf);
      const title = `Aviso meteorológico — ${place}`;
      const description =
        `Pronóstico SMN para hoy en ${place}: ${f.desciel}, ` +
        `probabilidad de precipitación ${probprec}% ` +
        `(${toNumber(f.prec)} l/m²), rachas de viento de ${gust} km/h, ` +
        `temperatura ${toNumber(f.tmin)}°C a ${toNumber(f.tmax)}°C.`;
      return {
        title,
        description,
        link: SMN_AVISOS_URL,
        guid:
          `smn-aviso-${f.nes}-${f.nmun}-${new Date().toISOString().slice(0, 10)}`
            .toLowerCase()
            .replace(/\s+/g, '-'),
        pubDate,
      };
    });
}

function fallbackItem(): FeedItem {
  return {
    title: 'Avisos meteorológicos del SMN',
    description:
      'No fue posible obtener los datos del Servicio Meteorológico ' +
      'Nacional al generar el sitio. Consulta los avisos meteorológicos ' +
      'oficiales y vigentes directamente en el portal del SMN/CONAGUA.',
    link: SMN_AVISOS_URL,
    guid: 'smn-aviso-fallback',
    pubDate: new Date().toUTCString(),
  };
}

function renderFeed(items: FeedItem[]): string {
  const lastBuildDate = new Date().toUTCString();
  const itemsXml = items
    .map(
      (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <description>${escapeXml(item.description)}</description>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="false">${escapeXml(item.guid)}</guid>
      <pubDate>${escapeXml(item.pubDate)}</pubDate>
    </item>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Clima México — Avisos del SMN</title>
    <link>${escapeXml(SITE_URL)}</link>
    <description>Avisos meteorológicos para México derivados de los datos oficiales del Servicio Meteorológico Nacional (SMN/CONAGUA).</description>
    <language>es-MX</language>
    <lastBuildDate>${escapeXml(lastBuildDate)}</lastBuildDate>
    <generator>mexico-weather-site (Astro)</generator>
${itemsXml}
  </channel>
</rss>
`;
}

export const GET: APIRoute = async () => {
  let items: FeedItem[];
  try {
    const forecasts = await fetchSmnForecast();
    items = buildAvisoItems(forecasts);
    // If SMN data is reachable but nothing is noteworthy, still emit a valid
    // feed with an informational item instead of an empty channel.
    if (items.length === 0) {
      items = [
        {
          title: 'Sin avisos meteorológicos relevantes',
          description:
            'Según los datos del SMN, no se prevén lluvias intensas ni ' +
            'vientos fuertes en el país al momento de generar el sitio. ' +
            'Consulta el portal del SMN/CONAGUA para avisos vigentes.',
          link: SMN_AVISOS_URL,
          guid: `smn-aviso-none-${new Date().toISOString().slice(0, 10)}`,
          pubDate: new Date().toUTCString(),
        },
      ];
    }
  } catch (error) {
    // Never let an upstream failure break the build: emit a valid feed.
    console.warn(
      '[rss.xml] SMN source unavailable, using fallback item:',
      error instanceof Error ? error.message : error,
    );
    items = [fallbackItem()];
  }

  return new Response(renderFeed(items), {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
};

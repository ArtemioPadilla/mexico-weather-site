import { describe, it, expect } from 'vitest';
import {
  escapeXml,
  toNumber,
  buildAvisoItems,
  fallbackItem,
  renderFeed,
  MIN_PRECIP_PROBABILITY,
  MIN_WIND_GUST_KMH,
  type SmnForecast,
  type FeedItem,
} from '../pages/rss.xml';

function smn(overrides: Partial<SmnForecast> = {}): SmnForecast {
  return {
    nes: 'Jalisco',
    nmun: 'Guadalajara',
    ndia: '0',
    probprec: '10',
    prec: '0',
    raf: '10',
    desciel: 'Despejado',
    tmax: '30',
    tmin: '15',
    ...overrides,
  };
}

describe('escapeXml', () => {
  it('escapes all five XML special characters', () => {
    expect(escapeXml('& < > " \'')).toBe(
      '&amp; &lt; &gt; &quot; &apos;',
    );
  });

  it('escapes ampersand first so entities are not double-escaped wrongly', () => {
    expect(escapeXml('Tom & Jerry <b>')).toBe('Tom &amp; Jerry &lt;b&gt;');
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeXml('Guadalajara, Jalisco')).toBe('Guadalajara, Jalisco');
  });
});

describe('toNumber', () => {
  it('parses numeric strings', () => {
    expect(toNumber('42')).toBe(42);
    expect(toNumber('3.5')).toBe(3.5);
  });

  it('returns 0 for undefined, empty or non-numeric input', () => {
    expect(toNumber(undefined)).toBe(0);
    expect(toNumber('')).toBe(0);
    expect(toNumber('abc')).toBe(0);
    expect(toNumber('NaN')).toBe(0);
  });
});

describe('buildAvisoItems threshold logic', () => {
  it('includes a municipality when precip probability >= MIN_PRECIP_PROBABILITY', () => {
    const items = buildAvisoItems([
      smn({ probprec: String(MIN_PRECIP_PROBABILITY) }),
    ]);
    expect(items).toHaveLength(1);
  });

  it('excludes a municipality just below the precip threshold and calm wind', () => {
    const items = buildAvisoItems([
      smn({
        probprec: String(MIN_PRECIP_PROBABILITY - 1),
        raf: String(MIN_WIND_GUST_KMH - 1),
      }),
    ]);
    expect(items).toHaveLength(0);
  });

  it('includes a municipality when wind gust >= MIN_WIND_GUST_KMH even with low precip', () => {
    const items = buildAvisoItems([
      smn({ probprec: '0', raf: String(MIN_WIND_GUST_KMH) }),
    ]);
    expect(items).toHaveLength(1);
  });

  it('only considers today (ndia === "0")', () => {
    const items = buildAvisoItems([
      smn({ ndia: '1', probprec: '100' }),
      smn({ ndia: '0', probprec: '95', nmun: 'Zapopan' }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].title).toContain('Zapopan');
  });

  it('sorts by descending precipitation probability', () => {
    const items = buildAvisoItems([
      smn({ probprec: '85', nmun: 'A' }),
      smn({ probprec: '99', nmun: 'B' }),
      smn({ probprec: '90', nmun: 'C' }),
    ]);
    expect(items.map((i) => i.title)).toEqual([
      'Aviso meteorológico — B, Jalisco',
      'Aviso meteorológico — C, Jalisco',
      'Aviso meteorológico — A, Jalisco',
    ]);
  });

  it('produces a well-formed feed item with all required fields', () => {
    const [item] = buildAvisoItems([
      smn({ nmun: 'Mérida', nes: 'Yucatán', probprec: '90', raf: '60' }),
    ]);
    expect(item.title).toBe('Aviso meteorológico — Mérida, Yucatán');
    expect(item.description).toContain('Mérida, Yucatán');
    expect(item.description).toContain('probabilidad de precipitación 90%');
    expect(item.description).toContain('rachas de viento de 60 km/h');
    expect(item.link).toMatch(/^https:\/\/smn\.conagua\.gob\.mx/);
    expect(item.guid).toMatch(/^smn-aviso-/);
    expect(item.guid).toBe(item.guid.toLowerCase());
    // pubDate must be a valid RFC-822 / UTC date string.
    expect(Number.isNaN(Date.parse(item.pubDate))).toBe(false);
  });

  it('returns an empty array when nothing is noteworthy', () => {
    expect(buildAvisoItems([smn(), smn({ nmun: 'Tlaquepaque' })])).toEqual([]);
  });
});

describe('fallbackItem', () => {
  it('is a well-formed informational item', () => {
    const item = fallbackItem();
    expect(item.title).toBe('Avisos meteorológicos del SMN');
    expect(item.guid).toBe('smn-aviso-fallback');
    expect(item.link).toMatch(/^https:\/\/smn\.conagua\.gob\.mx/);
    expect(item.description.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(item.pubDate))).toBe(false);
  });
});

describe('renderFeed', () => {
  const sampleItems: FeedItem[] = buildAvisoItems([
    smn({ nmun: 'Acapulco', nes: 'Guerrero', probprec: '95', raf: '70' }),
  ]);

  it('produces a valid RSS 2.0 document shape', () => {
    const xml = renderFeed(sampleItems);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain('<channel>');
    expect(xml).toContain(
      '<title>Clima México — Avisos del SMN</title>',
    );
    expect(xml).toContain('<link>');
    expect(xml).toContain('<language>es-MX</language>');
    expect(xml).toContain('<lastBuildDate>');
    expect(xml.trimEnd().endsWith('</rss>')).toBe(true);
  });

  it('renders at least one item with all required child elements', () => {
    const xml = renderFeed(sampleItems);
    expect(xml).toContain('<item>');
    expect(xml).toContain('<title>Aviso meteorológico — Acapulco, Guerrero</title>');
    expect(xml).toMatch(/<description>.+<\/description>/);
    expect(xml).toMatch(/<link>https:\/\/smn\.conagua\.gob\.mx.+<\/link>/);
    expect(xml).toContain('<guid isPermaLink="false">');
    expect(xml).toMatch(/<pubDate>.+<\/pubDate>/);
  });

  it('escapes XML special characters in item content', () => {
    const xml = renderFeed([
      {
        title: 'A & B <test>',
        description: 'quote " and apostrophe \'',
        link: 'https://example.com/?a=1&b=2',
        guid: 'g&1',
        pubDate: new Date(0).toUTCString(),
      },
    ]);
    expect(xml).toContain('<title>A &amp; B &lt;test&gt;</title>');
    expect(xml).toContain(
      '<description>quote &quot; and apostrophe &apos;</description>',
    );
    expect(xml).toContain(
      '<link>https://example.com/?a=1&amp;b=2</link>',
    );
    expect(xml).not.toContain('<test>');
  });

  it('renders a well-formed fallback feed when the source yields nothing', () => {
    const xml = renderFeed([fallbackItem()]);
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain(
      '<title>Avisos meteorológicos del SMN</title>',
    );
    expect(xml).toContain(
      '<guid isPermaLink="false">smn-aviso-fallback</guid>',
    );
    expect(xml.trimEnd().endsWith('</rss>')).toBe(true);
  });
});

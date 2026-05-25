import { describe, expect, it } from 'vitest';
import {
  beachLd,
  breadcrumbLd,
  cityLd,
  stateLd,
} from './structured-data';

describe('structured-data builders', () => {
  it('cityLd produces a WebPage with embedded City + geo', () => {
    const ld = cityLd({
      name: 'Ciudad de México',
      admin: 'CDMX',
      lat: 19.43,
      lng: -99.13,
      canonical: 'https://example.com/clima/cdmx/',
    }) as Record<string, unknown>;
    expect(ld['@context']).toBe('https://schema.org');
    expect(ld['@type']).toBe('WebPage');
    expect(ld.url).toBe('https://example.com/clima/cdmx/');
    const about = ld.about as Record<string, unknown>;
    expect(about['@type']).toBe('City');
    expect(about.name).toBe('Ciudad de México');
    const geo = about.geo as Record<string, unknown>;
    expect(geo.latitude).toBe(19.43);
    expect(geo.longitude).toBe(-99.13);
  });

  it('beachLd embeds a Beach', () => {
    const ld = beachLd({
      name: 'Cancún',
      admin: 'Quintana Roo',
      lat: 21.16,
      lng: -86.85,
      canonical: 'https://example.com/playa/cancun/',
    }) as Record<string, unknown>;
    const about = ld.about as Record<string, unknown>;
    expect(about['@type']).toBe('Beach');
    expect(about.name).toBe('Cancún');
  });

  it('stateLd embeds an AdministrativeArea + capital City', () => {
    const ld = stateLd({
      name: 'Jalisco',
      capital: 'Guadalajara',
      capitalLat: 20.66,
      capitalLng: -103.35,
      canonical: 'https://example.com/estado/jalisco/',
    }) as Record<string, unknown>;
    const about = ld.about as Record<string, unknown>;
    expect(about['@type']).toBe('AdministrativeArea');
    const contains = about.containsPlace as Record<string, unknown>;
    expect(contains['@type']).toBe('City');
    expect(contains.name).toBe('Guadalajara');
  });

  it('breadcrumbLd numbers items 1..N in order', () => {
    const ld = breadcrumbLd([
      { name: 'Inicio', url: 'https://example.com/' },
      { name: 'Estados', url: 'https://example.com/' },
      { name: 'Jalisco', url: 'https://example.com/estado/jalisco/' },
    ]) as { itemListElement: Array<{ position: number; name: string }> };
    expect(ld.itemListElement[0]?.position).toBe(1);
    expect(ld.itemListElement[0]?.name).toBe('Inicio');
    expect(ld.itemListElement[2]?.position).toBe(3);
    expect(ld.itemListElement[2]?.name).toBe('Jalisco');
  });

  it('serializes to JSON without losing fields', () => {
    const ld = cityLd({
      name: 'Mérida',
      admin: 'Yucatán',
      lat: 20.97,
      lng: -89.61,
      canonical: 'https://example.com/clima/merida/',
    });
    // Round-trip — guards against accidental Symbols/undefineds.
    const reparsed = JSON.parse(JSON.stringify(ld)) as Record<string, unknown>;
    expect(reparsed['@type']).toBe('WebPage');
  });
});

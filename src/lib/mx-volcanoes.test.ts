import { describe, expect, it } from 'vitest';
import { MX_VOLCANOES, findVolcanoBySlug } from './mx-volcanoes';

describe('MX_VOLCANOES', () => {
  it('lists the canonical monitored volcanoes', () => {
    // 7 entries: Popo, Colima, El Chichón, Tacaná, Pico de Orizaba,
    // Iztaccíhuatl, Nevado de Toluca.
    expect(MX_VOLCANOES.length).toBe(7);
  });

  it('every slug is unique', () => {
    const slugs = MX_VOLCANOES.map((v) => v.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('every slug is URL-safe', () => {
    for (const v of MX_VOLCANOES) {
      expect(v.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('every entry has plausible coords + elevation', () => {
    for (const v of MX_VOLCANOES) {
      // MX volcanic belt span: 14–22 N, -107 to -92 W.
      expect(v.lat).toBeGreaterThan(14);
      expect(v.lat).toBeLessThan(22);
      expect(v.lng).toBeGreaterThan(-107);
      expect(v.lng).toBeLessThan(-92);
      // Elevation: El Chichón at ~1150 m is the floor, Pico de Orizaba
      // at 5636 m is the ceiling.
      expect(v.elevationM).toBeGreaterThan(1000);
      expect(v.elevationM).toBeLessThan(6000);
    }
  });

  it('Popocatépetl carries a CENAPRED report URL', () => {
    // The most-monitored volcano; if it ever drops the cenapredUrl
    // we likely broke the landing-page CTA.
    const popo = findVolcanoBySlug('popocatepetl');
    expect(popo?.cenapredUrl).toMatch(/cenapred/i);
  });

  it('findVolcanoBySlug returns undefined for unknown slugs', () => {
    expect(findVolcanoBySlug('not-a-volcano')).toBeUndefined();
  });
});

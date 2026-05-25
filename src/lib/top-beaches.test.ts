import { describe, expect, it } from 'vitest';
import { TOP_BEACHES, findBeachBySlug } from './top-beaches';

describe('TOP_BEACHES', () => {
  it('has 14 entries matching MX_BEACHES in build-marine-snapshot.py', () => {
    expect(TOP_BEACHES.length).toBe(14);
  });

  it('every slug is unique', () => {
    const slugs = TOP_BEACHES.map((b) => b.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('every slug is URL-safe', () => {
    for (const b of TOP_BEACHES) {
      expect(b.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('every entry has coords on the MX coast', () => {
    // Loose bbox: 15N–32N, -118W–-86W.
    for (const b of TOP_BEACHES) {
      expect(b.lat).toBeGreaterThan(15);
      expect(b.lat).toBeLessThan(32.5);
      expect(b.lng).toBeGreaterThan(-118);
      expect(b.lng).toBeLessThan(-86);
    }
  });

  it('findBeachBySlug returns the matching beach', () => {
    expect(findBeachBySlug('cancun')?.name).toBe('Cancún');
  });

  it('findBeachBySlug returns undefined for unknown slugs', () => {
    expect(findBeachBySlug('not-a-beach')).toBeUndefined();
  });
});

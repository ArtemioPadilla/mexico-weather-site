import { describe, it, expect } from 'vitest';
import { parseMapHash, buildMapHash, DEFAULT_VIEW } from './maphash';

describe('parseMapHash', () => {
  it('returns DEFAULT_VIEW for empty/garbage input', () => {
    expect(parseMapHash('')).toEqual(DEFAULT_VIEW);
    expect(parseMapHash('#nonsense')).toEqual(DEFAULT_VIEW);
  });

  it('parses a full valid hash', () => {
    const s = parseMapHash('#view=19.43,-99.13,6.5z&layer=base&t=2026-05-18T00:00:00Z');
    expect(s).toEqual({
      lat: 19.43,
      lng: -99.13,
      zoom: 6.5,
      layer: 'base',
      t: '2026-05-18T00:00:00Z',
    });
  });

  it('tolerates a missing leading # and missing t', () => {
    expect(parseMapHash('view=0,0,3z&layer=base')).toEqual({
      lat: 0,
      lng: 0,
      zoom: 3,
      layer: 'base',
      t: null,
    });
  });

  it('falls back to default view on out-of-range coords or zoom', () => {
    expect(parseMapHash('#view=200,0,3z&layer=base')).toEqual(DEFAULT_VIEW);
    expect(parseMapHash('#view=0,0,99z&layer=base')).toEqual(DEFAULT_VIEW);
  });

  it('falls back to base for an unknown layer id', () => {
    expect(parseMapHash('#view=0,0,3z&layer=bogus').layer).toBe('base');
  });

  it('preserves a registry-known layer id (radar)', () => {
    expect(parseMapHash('#view=0,0,3z&layer=radar').layer).toBe('radar');
  });
});

describe('buildMapHash', () => {
  it('round-trips through parseMapHash', () => {
    const state = { lat: 25.67, lng: -100.31, zoom: 7.25, layer: 'base', t: null };
    expect(parseMapHash(buildMapHash(state))).toEqual(state);
  });

  it('rounds coordinates to 4 dp and zoom to 2 dp', () => {
    expect(buildMapHash({ lat: 1.234567, lng: -2.345678, zoom: 3.14159, layer: 'base', t: null }))
      .toBe('#view=1.2346,-2.3457,3.14z&layer=base');
  });

  it('includes t when present', () => {
    expect(
      buildMapHash({ lat: 0, lng: 0, zoom: 3, layer: 'base', t: '2026-05-18T00:00:00Z' }),
    ).toBe('#view=0,0,3z&layer=base&t=2026-05-18T00:00:00Z');
  });
});

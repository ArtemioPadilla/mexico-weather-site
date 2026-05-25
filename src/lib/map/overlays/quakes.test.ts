import { describe, expect, it } from 'vitest';
import {
  MX_QUAKES_BBOX,
  filterToMxBbox,
  inMxBbox,
  QUAKES_URL,
} from './quakes';

describe('quakes overlay helpers', () => {
  it('MX_QUAKES_BBOX covers MX + Caribbean + southern US border', () => {
    expect(MX_QUAKES_BBOX.west).toBe(-120);
    expect(MX_QUAKES_BBOX.east).toBe(-85);
    expect(MX_QUAKES_BBOX.south).toBe(12);
    expect(MX_QUAKES_BBOX.north).toBe(35);
  });

  it('inMxBbox accepts coords inside the bbox', () => {
    expect(inMxBbox(-99.13, 19.43)).toBe(true); // CDMX
    expect(inMxBbox(-100.31, 25.67)).toBe(true); // MTY
    expect(inMxBbox(-117.04, 32.51)).toBe(true); // Tijuana edge
  });

  it('inMxBbox rejects coords outside (NYC, Tokyo, Buenos Aires)', () => {
    expect(inMxBbox(-74, 40.7)).toBe(false); // NYC
    expect(inMxBbox(139.7, 35.7)).toBe(false); // Tokyo
    expect(inMxBbox(-58.4, -34.6)).toBe(false); // BA
  });

  it('filterToMxBbox keeps only MX-relevant features', () => {
    const fc = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: { mag: 5 },
          geometry: { type: 'Point' as const, coordinates: [-99, 19] },
        },
        {
          type: 'Feature' as const,
          properties: { mag: 4 },
          geometry: { type: 'Point' as const, coordinates: [139, 35] },
        },
        {
          // Defensive: missing coordinates
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'Point' as const, coordinates: [] },
        },
      ],
    };
    const out = filterToMxBbox(fc);
    expect(out.features.length).toBe(1);
    expect(
      (out.features[0].geometry as { coordinates: number[] }).coordinates,
    ).toEqual([-99, 19]);
  });

  it('QUAKES_URL is the USGS 2.5-week feed', () => {
    expect(QUAKES_URL).toMatch(/2\.5_week\.geojson$/);
    expect(QUAKES_URL.startsWith('https://earthquake.usgs.gov/')).toBe(true);
  });
});

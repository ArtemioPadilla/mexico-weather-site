import { describe, expect, it } from 'vitest';
import { computeIsobars } from './isobars';

const BOUNDS = { south: 14, west: -118, north: 33, east: -86 };

describe('computeIsobars', () => {
  it('returns empty FC when grid dimensions are invalid', () => {
    const fc = computeIsobars({
      values: [1, 2, 3],
      cols: 5,
      rows: 5,
      ...BOUNDS,
    });
    expect(fc.features).toEqual([]);
  });

  it('returns empty FC for degenerate grid', () => {
    const fc = computeIsobars({
      values: [1, 2],
      cols: 2,
      rows: 1,
      ...BOUNDS,
    });
    expect(fc.features).toEqual([]);
  });

  it('produces LineString features with pressure property', () => {
    // Build a 4x4 grid with a clear gradient so d3-contour finds isolines.
    const values: number[] = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        values.push(1000 + c * 8 + r * 8);
      }
    }
    const fc = computeIsobars({
      values,
      cols: 4,
      rows: 4,
      ...BOUNDS,
      thresholds: [1008, 1016, 1024],
    });
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features.length).toBeGreaterThan(0);
    for (const f of fc.features) {
      expect(f.geometry.type).toBe('LineString');
      expect(typeof f.properties.pressure).toBe('number');
      // Coordinates must be lng/lat within bounds.
      for (const [lng, lat] of f.geometry.coordinates) {
        expect(lng).toBeGreaterThanOrEqual(BOUNDS.west);
        expect(lng).toBeLessThanOrEqual(BOUNDS.east);
        expect(lat).toBeGreaterThanOrEqual(BOUNDS.south);
        expect(lat).toBeLessThanOrEqual(BOUNDS.north);
      }
    }
  });

  it('returns empty FC when no thresholds intersect the field', () => {
    // Uniform value of 1000; no isolines crossing 1020 should appear.
    const values = Array.from({ length: 9 }, () => 1000);
    const fc = computeIsobars({
      values,
      cols: 3,
      rows: 3,
      ...BOUNDS,
      thresholds: [1020],
    });
    expect(fc.features).toEqual([]);
  });

  it('uses default threshold set when none provided', () => {
    const values: number[] = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        values.push(990 + c * 12 + r * 12);
      }
    }
    const fc = computeIsobars({
      values,
      cols: 4,
      rows: 4,
      ...BOUNDS,
    });
    expect(fc.features.length).toBeGreaterThan(0);
  });
});

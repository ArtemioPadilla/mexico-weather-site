import { describe, it, expect } from 'vitest';
import { solarPosition, terminatorPolygon } from './mapsun';

describe('solarPosition', () => {
  it('is on the equator near the equinoxes', () => {
    const eq = solarPosition(Date.UTC(2026, 2, 20, 17, 0, 0));
    expect(Math.abs(eq.lat)).toBeLessThan(1);
  });
  it('is in the northern hemisphere around the june solstice', () => {
    const jun = solarPosition(Date.UTC(2026, 5, 21, 12, 0, 0));
    expect(jun.lat).toBeGreaterThan(22);
    expect(jun.lat).toBeLessThan(24);
  });
  it('is in the southern hemisphere around the december solstice', () => {
    const dec = solarPosition(Date.UTC(2026, 11, 21, 12, 0, 0));
    expect(dec.lat).toBeLessThan(-22);
    expect(dec.lat).toBeGreaterThan(-24);
  });
  it('subsolar longitude tracks UTC noon ≈ 0°, midnight ≈ ±180°', () => {
    const noon = solarPosition(Date.UTC(2026, 2, 20, 12, 0, 0));
    expect(Math.abs(noon.lng)).toBeLessThan(5);
    const midnight = solarPosition(Date.UTC(2026, 2, 20, 0, 0, 0));
    expect(Math.abs(midnight.lng)).toBeGreaterThan(175);
  });
});

describe('terminatorPolygon', () => {
  it('returns a closed Polygon with samples+2 ring vertices around the night side', () => {
    const poly = terminatorPolygon(Date.UTC(2026, 5, 21, 12, 0, 0), 120);
    expect(poly.type).toBe('Polygon');
    expect(poly.coordinates).toHaveLength(1);
    const ring = poly.coordinates[0];
    expect(ring.length).toBe(120 + 2 + 1);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    for (const [lng, lat] of ring) {
      expect(lat).toBeGreaterThanOrEqual(-90.001);
      expect(lat).toBeLessThanOrEqual(90.001);
      expect(lng).toBeGreaterThanOrEqual(-180.001);
      expect(lng).toBeLessThanOrEqual(180.001);
    }
  });
  it('returns a polygon for arbitrary distanceDeg used by the soft-terminator gradient', () => {
    const ts = Date.UTC(2026, 5, 21, 12, 0, 0);
    const inner = terminatorPolygon(ts, 60, 91.5);
    const mid = terminatorPolygon(ts, 60, 90);
    const outer = terminatorPolygon(ts, 60, 88.5);
    for (const poly of [inner, mid, outer]) {
      expect(poly.type).toBe('Polygon');
      const ring = poly.coordinates[0];
      expect(ring.length).toBe(60 + 2 + 1);
      expect(ring[0]).toEqual(ring[ring.length - 1]);
      for (const [lng, lat] of ring) {
        expect(Number.isFinite(lng)).toBe(true);
        expect(Number.isFinite(lat)).toBe(true);
        expect(lat).toBeGreaterThanOrEqual(-90.001);
        expect(lat).toBeLessThanOrEqual(90.001);
      }
    }
  });
});

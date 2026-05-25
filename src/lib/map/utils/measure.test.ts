import { describe, expect, it } from 'vitest';
import {
  formatArea,
  formatDistance,
  haversineKm,
  polylineLengthKm,
  sphericalAreaKm2,
} from './measure';

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm([-99.13, 19.43], [-99.13, 19.43])).toBe(0);
  });

  it('CDMX → Monterrey is ~696 km (NHC reference)', () => {
    const d = haversineKm([-99.13, 19.43], [-100.31, 25.67]);
    expect(d).toBeGreaterThan(690);
    expect(d).toBeLessThan(710);
  });

  it('CDMX → Guadalajara is ~462 km', () => {
    const d = haversineKm([-99.13, 19.43], [-103.35, 20.66]);
    expect(d).toBeGreaterThan(455);
    expect(d).toBeLessThan(470);
  });
});

describe('polylineLengthKm', () => {
  it('sums consecutive segments', () => {
    const pts: [number, number][] = [
      [-99.13, 19.43], // CDMX
      [-103.35, 20.66], // GDL
      [-100.31, 25.67], // MTY
    ];
    const total = polylineLengthKm(pts);
    expect(total).toBeGreaterThan(900);
    expect(total).toBeLessThan(1100);
  });

  it('returns 0 for a single point', () => {
    expect(polylineLengthKm([[-99.13, 19.43]])).toBe(0);
  });

  it('returns 0 for empty array', () => {
    expect(polylineLengthKm([])).toBe(0);
  });
});

describe('sphericalAreaKm2', () => {
  it('returns 0 for degenerate polygons (<3 points)', () => {
    expect(sphericalAreaKm2([])).toBe(0);
    expect(sphericalAreaKm2([[-99, 19]])).toBe(0);
    expect(sphericalAreaKm2([[-99, 19], [-98, 19]])).toBe(0);
  });

  it('computes area of a 1° square in the tropics (~12,400 km²)', () => {
    // 1° square centered at equator ≈ 111 * 111 = 12,321 km²
    const pts: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const a = sphericalAreaKm2(pts);
    expect(a).toBeGreaterThan(12_000);
    expect(a).toBeLessThan(12_500);
  });

  it('handles MX-sized triangle', () => {
    // CDMX-GDL-MTY triangle (~140k km² per spherical-excess)
    const pts: [number, number][] = [
      [-99.13, 19.43],
      [-103.35, 20.66],
      [-100.31, 25.67],
    ];
    const a = sphericalAreaKm2(pts);
    expect(a).toBeGreaterThan(100_000);
    expect(a).toBeLessThan(200_000);
  });
});

describe('formatDistance', () => {
  it('shows metres under 1 km', () => {
    expect(formatDistance(0.85)).toBe('850 m');
  });

  it('shows km with 1 dp under 100 km', () => {
    expect(formatDistance(12.4)).toBe('12.4 km');
  });

  it('shows whole km with thousand separators ≥ 100 km', () => {
    expect(formatDistance(1234.5)).toMatch(/1[,.]235 km/);
  });
});

describe('formatArea', () => {
  it('shows m² under 1 km²', () => {
    const out = formatArea(0.32);
    expect(out).toMatch(/m²$/);
  });

  it('shows km² with thousand separators', () => {
    const out = formatArea(12_345);
    expect(out).toMatch(/12[,.]345 km²/);
  });
});

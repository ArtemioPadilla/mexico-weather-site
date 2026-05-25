import { describe, expect, it } from 'vitest';
import { MX_LAKES, createLakesOverlay } from './lakes';
import { MX_WEBCAMS, createWebcamsOverlay } from './webcams';
import {
  HIST_STORMS_MX,
  categoryColor,
  createHistStormsOverlay,
} from './hist-storms';

type Layers = Set<string>;
type Sources = Set<string>;

function mapMock(): {
  map: Parameters<typeof createLakesOverlay>[0];
  layers: Layers;
  sources: Sources;
} {
  const layers: Layers = new Set();
  const sources: Sources = new Set();
  const map = {
    getSource: (id: string): unknown => (sources.has(id) ? {} : undefined),
    getLayer: (id: string): unknown => (layers.has(id) ? {} : undefined),
    addSource: (id: string): void => {
      sources.add(id);
    },
    addLayer: (def: { id: string }): void => {
      layers.add(def.id);
    },
    removeLayer: (id: string): void => {
      layers.delete(id);
    },
    removeSource: (id: string): void => {
      sources.delete(id);
    },
    on: (): void => undefined,
    getCanvas: (): { style: { cursor: string } } => ({ style: { cursor: '' } }),
  } as unknown as Parameters<typeof createLakesOverlay>[0];
  return { map, layers, sources };
}

describe('lakes overlay', () => {
  it('lists 11 canonical MX lakes + reservoirs', () => {
    expect(MX_LAKES).toHaveLength(11);
    expect(MX_LAKES.map((l) => l.name)).toContain('Chapala');
  });

  it('all inside MX bbox', () => {
    for (const l of MX_LAKES) {
      expect(l.lng).toBeGreaterThan(-118);
      expect(l.lng).toBeLessThan(-86);
      expect(l.lat).toBeGreaterThan(14);
      expect(l.lat).toBeLessThan(32);
    }
  });

  it('factory toggles add/remove cleanly', () => {
    const { map, layers, sources } = mapMock();
    const overlay = createLakesOverlay(map);
    overlay.setEnabled(true);
    expect(layers.has('wx-lakes-circle')).toBe(true);
    expect(layers.has('wx-lakes-label')).toBe(true);
    overlay.setEnabled(false);
    expect(layers.size).toBe(0);
    expect(sources.size).toBe(0);
  });
});

describe('webcams overlay', () => {
  it('lists 7 destinations with stable URL host', () => {
    expect(MX_WEBCAMS).toHaveLength(7);
    for (const w of MX_WEBCAMS) {
      expect(w.url.startsWith('https://')).toBe(true);
    }
  });

  it('factory toggles add/remove cleanly', () => {
    const { map, layers } = mapMock();
    const overlay = createWebcamsOverlay(map);
    overlay.setEnabled(true);
    expect(layers.has('wx-webcams-circle')).toBe(true);
    overlay.setEnabled(false);
    expect(layers.size).toBe(0);
  });
});

describe('hist-storms overlay', () => {
  it('Otis, Patricia, Hilary present with their categories', () => {
    expect(HIST_STORMS_MX.map((s) => s.name)).toEqual([
      'Otis',
      'Patricia',
      'Hilary',
    ]);
    expect(HIST_STORMS_MX.find((s) => s.name === 'Otis')?.cat).toBe(5);
  });

  it('categoryColor maps Saffir-Simpson categories sensibly', () => {
    expect(categoryColor(5)).toBe('#7f1d1d');
    expect(categoryColor(4)).toBe('#dc2626');
    expect(categoryColor(3)).toBe('#f97316');
    expect(categoryColor(2)).toBe('#facc15');
    expect(categoryColor(1)).toBe('#22c55e');
    expect(categoryColor(0)).toBe('#22c55e');
  });

  it('every storm has ≥2 track points', () => {
    for (const s of HIST_STORMS_MX) {
      expect(s.coords.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('factory adds line + label layers', () => {
    const { map, layers } = mapMock();
    const overlay = createHistStormsOverlay(map);
    overlay.setEnabled(true);
    expect(layers.has('wx-histstorms-line')).toBe(true);
    expect(layers.has('wx-histstorms-label')).toBe(true);
    overlay.setEnabled(false);
    expect(layers.size).toBe(0);
  });
});

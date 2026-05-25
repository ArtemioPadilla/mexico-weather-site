import { describe, expect, it } from 'vitest';
import { sunZoomOpacityExpr, createSunLayer } from './sun-layer';

describe('sunZoomOpacityExpr', () => {
  it('builds an interpolate expression with the correct stops', () => {
    const expr = sunZoomOpacityExpr(0.42) as unknown[];
    expect(expr[0]).toBe('interpolate');
    expect(expr[1]).toEqual(['linear']);
    expect(expr[2]).toEqual(['zoom']);
    // Stops: z=0 → 0.4×base, z=4 → 0.4×base, z=6 → base
    expect(expr[3]).toBe(0);
    expect(expr[4]).toBeCloseTo(0.168, 3); // 0.42 × 0.4
    expect(expr[5]).toBe(4);
    expect(expr[6]).toBeCloseTo(0.168, 3);
    expect(expr[7]).toBe(6);
    expect(expr[8]).toBeCloseTo(0.42, 3);
  });
});

describe('createSunLayer', () => {
  it('factory returns refresh / remove / startTicker', () => {
    const sources = new Set<string>();
    const layers = new Set<string>();
    const map = {
      getSource: (id: string): unknown =>
        sources.has(id) ? { setData: (): void => undefined } : undefined,
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
      setPaintProperty: (): void => undefined,
    } as unknown as Parameters<typeof createSunLayer>[0];

    const layer = createSunLayer(map, () => 1);
    expect(typeof layer.refresh).toBe('function');
    expect(typeof layer.remove).toBe('function');
    expect(typeof layer.startTicker).toBe('function');
    layer.refresh();
    expect(layers.has('wx-sun-layer-outer')).toBe(true);
    expect(layers.has('wx-sun-layer')).toBe(true);
    layer.remove();
    expect(layers.size).toBe(0);
    expect(sources.size).toBe(0);
  });
});

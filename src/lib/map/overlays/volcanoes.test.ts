import { describe, expect, it } from 'vitest';
import { MX_VOLCANOES, createVolcanoesOverlay } from './volcanoes';

describe('volcanoes overlay', () => {
  it('MX_VOLCANOES has the 8 canonical active volcanoes', () => {
    expect(MX_VOLCANOES.map((v) => v.name)).toEqual([
      'Popocatépetl',
      'Colima (Fuego)',
      'El Chichón',
      'Tacaná',
      'Citlaltépetl',
      'Tres Vírgenes',
      'Bárcena (San Benedicto)',
      'Evermann (Socorro)',
    ]);
  });

  it('all coordinates inside MX bbox (-118..-86 lng, 14..32 lat)', () => {
    for (const v of MX_VOLCANOES) {
      expect(v.lng).toBeGreaterThan(-118);
      expect(v.lng).toBeLessThan(-86);
      expect(v.lat).toBeGreaterThan(14);
      expect(v.lat).toBeLessThan(32);
    }
  });

  it('factory exposes the expected overlay surface', () => {
    // Map mock with idempotent source/layer registry — enough to
    // verify the contract.
    const sources = new Set<string>();
    const layers = new Set<string>();
    // Loose Map mock — only the methods our overlay uses.
    const map = {
      getSource: (id: string): unknown => (sources.has(id) ? { setData: (): void => undefined } : undefined),
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
    } as unknown as Parameters<typeof createVolcanoesOverlay>[0];

    const overlay = createVolcanoesOverlay(map);
    expect(overlay.isEnabled()).toBe(false);
    overlay.setEnabled(true);
    expect(overlay.isEnabled()).toBe(true);
    expect(layers.has('wx-volcanoes-circle')).toBe(true);
    expect(layers.has('wx-volcanoes-label')).toBe(true);
    overlay.setEnabled(false);
    expect(overlay.isEnabled()).toBe(false);
    expect(layers.size).toBe(0);
    expect(sources.size).toBe(0);
  });

  it('toggling on twice is idempotent', () => {
    const layers = new Set<string>();
    const sources = new Set<string>();
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
    } as unknown as Parameters<typeof createVolcanoesOverlay>[0];

    const overlay = createVolcanoesOverlay(map);
    overlay.setEnabled(true);
    overlay.setEnabled(true); // no-op
    expect(layers.size).toBe(2);
  });
});

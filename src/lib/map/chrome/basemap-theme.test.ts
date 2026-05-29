import { describe, expect, it } from 'vitest';
import {
  CARTO_DARK_NOLABELS,
  CARTO_DARK_TILES,
  CARTO_LIGHT_NOLABELS,
  CARTO_LIGHT_TILES,
  LABEL_ZOOM_THRESHOLD,
  pickBasemapTiles,
} from './basemap-theme';

describe('pickBasemapTiles', () => {
  it('dark + dense → dark_all', () => {
    expect(pickBasemapTiles(true, true)).toBe(CARTO_DARK_TILES);
  });

  it('dark + !dense → dark_nolabels (P2.5 low-zoom)', () => {
    expect(pickBasemapTiles(true, false)).toBe(CARTO_DARK_NOLABELS);
  });

  it('light + dense → CARTO light_all (Positron, reliable 4-subdomain CDN)', () => {
    expect(pickBasemapTiles(false, true)).toBe(CARTO_LIGHT_TILES);
  });

  it('light basemap never uses single-host tile.openstreetmap.org', () => {
    // Regression guard: the single-host OSM source blanked the map in
    // light mode at zoom ≥5 (no parallelism under MapLibre's tile burst).
    for (const dense of [true, false]) {
      for (const url of pickBasemapTiles(false, dense)) {
        expect(url).not.toContain('tile.openstreetmap.org');
      }
    }
  });

  it('light + !dense → CARTO voyager_nolabels', () => {
    expect(pickBasemapTiles(false, false)).toBe(CARTO_LIGHT_NOLABELS);
  });

  it('LABEL_ZOOM_THRESHOLD is 5 (matches plan P2.5)', () => {
    expect(LABEL_ZOOM_THRESHOLD).toBe(5);
  });
});

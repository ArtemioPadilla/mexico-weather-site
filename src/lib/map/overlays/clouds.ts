/**
 * Cloud-cover overlay (zoom.earth "Nubes").
 *
 * Open-Meteo cloud_cover sampled on the same MX grid as the field
 * layers, rendered as a translucent white raster where alpha tracks
 * the cloud_cover %. Sits above any base layer.
 *
 * The factory owns the AbortController + blob URL lifecycle so the
 * caller doesn't have to.
 */
import type maplibregl from 'maplibre-gl';
import {
  buildFieldUrl,
  type FieldGrid,
  parseFieldResponse,
  viewportGrid,
} from '../../mapfields';
import { type RasterBounds, renderFieldRaster } from '../../mapraster';

const SOURCE_ID = 'wx-clouds-src';
const LAYER_ID = 'wx-clouds-layer';

export interface CloudsOverlay {
  isEnabled: () => boolean;
  setEnabled: (on: boolean) => Promise<void>;
}

export interface CloudsOverlayDeps {
  fetch: typeof fetch;
  bounds: RasterBounds;
  gridCols: number;
  gridRows: number;
  /** Optional NWP model id (passed through to buildFieldUrl). */
  getModel?: () => string;
  /** Optional site base. When set + model is best_match, the overlay
   *  reads the static cloud_cover snapshot from
   *  ${base}data/field-grids/cloud_cover.json before the live API. */
  base?: string;
}

export function createCloudsOverlay(
  map: maplibregl.Map,
  deps: CloudsOverlayDeps,
): CloudsOverlay {
  let abort: AbortController | null = null;
  let blobUrl: string | null = null;

  function revokeBlob(): void {
    if (blobUrl) {
      try {
        URL.revokeObjectURL(blobUrl);
      } catch {
        /* test envs without URL.revokeObjectURL — ignore */
      }
      blobUrl = null;
    }
  }

  return {
    isEnabled: (): boolean => !!map.getLayer(LAYER_ID),
    setEnabled: async (on: boolean): Promise<void> => {
      if (!on) {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
        abort?.abort();
        revokeBlob();
        return;
      }
      if (map.getSource(SOURCE_ID)) return;
      abort?.abort();
      const ac = new AbortController();
      abort = ac;
      const bounds: RasterBounds = { ...deps.bounds };
      const grid = viewportGrid(bounds, deps.gridCols, deps.gridRows);
      try {
        let cloudGrid: FieldGrid | null = null;

        // Static-first: only on best_match (or no explicit model)
        // does the snapshot match the live response exactly.
        const model = deps.getModel?.();
        const canUseStatic = !model || model === 'best_match';
        if (deps.base && canUseStatic) {
          try {
            const r = await deps.fetch(
              `${deps.base}data/field-grids/cloud_cover.json`,
              { signal: ac.signal },
            );
            if (r.ok && !ac.signal.aborted) {
              const snap = (await r.json()) as FieldGrid | null;
              if (
                snap &&
                Array.isArray(snap.points) &&
                snap.points.length === grid.length &&
                Array.isArray(snap.times) &&
                snap.times.length > 0
              ) {
                cloudGrid = snap;
              }
            }
          } catch {
            /* fall through to live */
          }
        }
        if (ac.signal.aborted) return;

        if (!cloudGrid) {
          const url = buildFieldUrl(grid, 'cloud_cover', model);
          const res = await deps.fetch(url, { signal: ac.signal });
          if (!res.ok || ac.signal.aborted) return;
          cloudGrid = parseFieldResponse(
            await res.json(),
            grid,
            'cloud_cover',
          );
        }
        if (!cloudGrid || ac.signal.aborted) return;
        // Render grayscale raster: alpha = clamp(cloud% / 100, 0..0.85).
        // White colour so light cloud reads as haze, dense cloud reads
        // as solid white — matches zoom.earth's cloud appearance.
        const render = await renderFieldRaster(
          cloudGrid,
          deps.gridRows,
          deps.gridCols,
          bounds,
          0, // first frame
          () => '#f8fafc', // near-white; alpha encodes density
          { width: 800, height: 560, alpha: 255 },
        );
        if (!render || ac.signal.aborted) return;
        blobUrl = render.blobUrl;
        map.addSource(SOURCE_ID, {
          type: 'image',
          url: render.blobUrl,
          coordinates: render.coords,
        });
        map.addLayer({
          id: LAYER_ID,
          type: 'raster',
          source: SOURCE_ID,
          paint: {
            'raster-opacity': 0.55,
            'raster-resampling': 'linear',
          },
        });
      } catch {
        /* network failure — silently skip */
      } finally {
        if (abort === ac) abort = null;
      }
    },
  };
}

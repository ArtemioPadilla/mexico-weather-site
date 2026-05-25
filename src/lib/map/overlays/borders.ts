/**
 * Borders overlay (zoom.earth "Líneas fronteras").
 *
 * White admin boundaries of MX + neighbors fetched on demand from
 * the static JSON shipped at /data/borders-na.json.
 */
import type { FeatureCollection } from 'geojson';
import type maplibregl from 'maplibre-gl';

const SOURCE_ID = 'wx-borders-src';
const LAYER_ID = 'wx-borders-line';

export interface BordersOverlay {
  isEnabled: () => boolean;
  setEnabled: (on: boolean) => Promise<void>;
}

export interface BordersOverlayDeps {
  fetch: typeof fetch;
  base: string;
}

export function createBordersOverlay(
  map: maplibregl.Map,
  deps: BordersOverlayDeps,
): BordersOverlay {
  let fetchPromise: Promise<FeatureCollection> | null = null;
  const loadData = (): Promise<FeatureCollection> => {
    if (fetchPromise) return fetchPromise;
    fetchPromise = deps
      .fetch(`${deps.base}data/borders-na.json`)
      .then((r) =>
        r.ok
          ? (r.json() as Promise<FeatureCollection>)
          : ({
              type: 'FeatureCollection',
              features: [],
            } as FeatureCollection),
      )
      .catch(
        () =>
          ({ type: 'FeatureCollection', features: [] } as FeatureCollection),
      );
    return fetchPromise;
  };
  return {
    isEnabled: (): boolean => !!map.getLayer(LAYER_ID),
    setEnabled: async (on: boolean): Promise<void> => {
      if (!on) {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
        return;
      }
      if (map.getSource(SOURCE_ID)) return;
      const data = await loadData();
      if (map.getSource(SOURCE_ID)) return;
      map.addSource(SOURCE_ID, { type: 'geojson', data });
      map.addLayer({
        id: LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        paint: {
          'line-color': '#ffffff',
          'line-width': 0.9,
          'line-opacity': 0.7,
        },
      });
    },
  };
}

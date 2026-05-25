/**
 * USGS earthquakes overlay — MX-unique (plan 2.4).
 *
 * Source: USGS earthquake.usgs.gov GeoJSON (keyless, CORS-enabled,
 * updated ~every minute). We pull the 2.5-week feed (mag ≥ 2.5 over
 * the past 7 days, worldwide) and filter client-side to a generous
 * MX-relevant bbox so the layer stays focused.
 *
 * Factory pattern matching the registry interface
 * { isEnabled, setEnabled }. Caches the fetch promise so toggling
 * on/off doesn't hit the network again.
 */
import type { FeatureCollection } from 'geojson';
import type maplibregl from 'maplibre-gl';

const SOURCE_ID = 'wx-quakes-src';
const CIRCLE_LAYER_ID = 'wx-quakes-circle';
export const QUAKES_URL =
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson';

/** MX-relevant bbox: covers all of Mexico, the Caribbean subduction
 *  zone, and the southern US border where felt quakes affect MX users. */
export const MX_QUAKES_BBOX = {
  west: -120,
  east: -85,
  south: 12,
  north: 35,
} as const;

export function inMxBbox(lng: number, lat: number): boolean {
  return (
    lng >= MX_QUAKES_BBOX.west &&
    lng <= MX_QUAKES_BBOX.east &&
    lat >= MX_QUAKES_BBOX.south &&
    lat <= MX_QUAKES_BBOX.north
  );
}

export function filterToMxBbox(fc: FeatureCollection): FeatureCollection {
  const features = (fc.features ?? []).filter((f) => {
    const c = (f.geometry as { coordinates?: number[] } | undefined)
      ?.coordinates;
    if (!Array.isArray(c) || c.length < 2) return false;
    return inMxBbox(c[0], c[1]);
  });
  return { type: 'FeatureCollection', features } as FeatureCollection;
}

export interface QuakesOverlay {
  isEnabled: () => boolean;
  setEnabled: (on: boolean) => Promise<void>;
}

export interface QuakesOverlayDeps {
  fetch: typeof fetch;
}

export function createQuakesOverlay(
  map: maplibregl.Map,
  deps: QuakesOverlayDeps,
): QuakesOverlay {
  let fetchPromise: Promise<FeatureCollection> | null = null;

  const loadData = (): Promise<FeatureCollection> => {
    if (fetchPromise) return fetchPromise;
    fetchPromise = deps
      .fetch(QUAKES_URL)
      .then(async (r) => {
        if (!r.ok) {
          return { type: 'FeatureCollection', features: [] } as FeatureCollection;
        }
        const fc = (await r.json()) as FeatureCollection;
        return filterToMxBbox(fc);
      })
      .catch(
        () =>
          ({ type: 'FeatureCollection', features: [] } as FeatureCollection),
      );
    return fetchPromise;
  };

  return {
    isEnabled: (): boolean => !!map.getLayer(CIRCLE_LAYER_ID),
    setEnabled: async (on: boolean): Promise<void> => {
      if (!on) {
        if (map.getLayer(CIRCLE_LAYER_ID)) map.removeLayer(CIRCLE_LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
        return;
      }
      if (map.getSource(SOURCE_ID)) return;
      const data = await loadData();
      if (map.getSource(SOURCE_ID)) return; // raced with another toggle
      map.addSource(SOURCE_ID, { type: 'geojson', data });
      map.addLayer({
        id: CIRCLE_LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'mag'],
            2.5, 3,
            4, 6,
            5, 10,
            6, 16,
            7, 22,
          ],
          'circle-color': [
            'interpolate',
            ['linear'],
            ['get', 'mag'],
            2.5, '#22c55e',
            4, '#facc15',
            5, '#f97316',
            6, '#ef4444',
            7, '#7f1d1d',
          ],
          'circle-opacity': 0.75,
          'circle-stroke-color': '#1e293b',
          'circle-stroke-width': 0.8,
        },
      });
    },
  };
}

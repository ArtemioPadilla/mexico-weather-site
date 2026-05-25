/**
 * Night line overlay (zoom.earth "Límite nocturno").
 *
 * The day/night terminator drawn as a thin dashed line, independent
 * of the active base layer. Reuses terminatorPolygon() from mapsun.ts
 * and refreshes every 5 minutes (Earth rotates 15°/h).
 */
import type { FeatureCollection } from 'geojson';
import type maplibregl from 'maplibre-gl';
import { terminatorPolygon } from '../../mapsun';

const SOURCE_ID = 'wx-night-line-src';
const LAYER_ID = 'wx-night-line-layer';
const REFRESH_MS = 5 * 60 * 1000;

export function nightLineFeatureCollection(
  at: number = Date.now(),
): FeatureCollection {
  const poly = terminatorPolygon(at, 180, 90);
  const rings = (poly.coordinates ?? []) as [number, number][][];
  const features = rings.map((ring) => ({
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates: ring },
  }));
  return { type: 'FeatureCollection', features };
}

export interface NightLineOverlay {
  isEnabled: () => boolean;
  setEnabled: (on: boolean) => void;
}

export function createNightLineOverlay(
  map: maplibregl.Map,
): NightLineOverlay {
  let refreshTimer = 0;
  return {
    isEnabled: (): boolean => !!map.getLayer(LAYER_ID),
    setEnabled: (on: boolean): void => {
      if (!on) {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
        if (refreshTimer) {
          window.clearInterval(refreshTimer);
          refreshTimer = 0;
        }
        return;
      }
      if (map.getSource(SOURCE_ID)) return;
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: nightLineFeatureCollection(),
      });
      map.addLayer({
        id: LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        paint: {
          'line-color': '#fde68a',
          'line-width': 1.6,
          'line-opacity': 0.55,
          'line-dasharray': [3, 3],
        },
      });
      refreshTimer = window.setInterval(() => {
        const src = map.getSource(SOURCE_ID) as
          | maplibregl.GeoJSONSource
          | undefined;
        if (src) src.setData(nightLineFeatureCollection());
      }, REFRESH_MS);
    },
  };
}

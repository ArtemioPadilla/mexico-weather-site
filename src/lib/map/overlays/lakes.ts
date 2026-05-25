/**
 * Lagos y presas overlay — MX-unique (plan 3.8).
 *
 * Static labeled points for major MX lakes + reservoirs. No live
 * water-level data because CONAGUA's feeds aren't CORS-friendly.
 *
 * Factory pattern; static list exported for reuse.
 */
import type { FeatureCollection } from 'geojson';
import type maplibregl from 'maplibre-gl';

const SOURCE_ID = 'wx-lakes-src';
const CIRCLE_LAYER_ID = 'wx-lakes-circle';
const LABEL_LAYER_ID = 'wx-lakes-label';

export interface Lake {
  name: string;
  lng: number;
  lat: number;
}

export const MX_LAKES: Lake[] = [
  { name: 'Chapala', lng: -103.0, lat: 20.2 },
  { name: 'Cuitzeo', lng: -101.15, lat: 19.95 },
  { name: 'Pátzcuaro', lng: -101.62, lat: 19.59 },
  { name: 'Catemaco', lng: -95.1, lat: 18.4 },
  { name: 'Cerro Prieto (Pres.)', lng: -100.06, lat: 25.43 },
  { name: 'El Cuchillo (Pres.)', lng: -99.27, lat: 25.73 },
  { name: 'Aguamilpa (Pres.)', lng: -104.84, lat: 21.84 },
  { name: 'Falcón (Pres.)', lng: -99.17, lat: 26.55 },
  { name: 'Amistad (Pres.)', lng: -101.04, lat: 29.45 },
  { name: 'Nezahualcóyotl (Malpaso)', lng: -93.6, lat: 17.18 },
  { name: 'Vicente Guerrero (Pres.)', lng: -98.65, lat: 23.85 },
];

export interface LakesOverlay {
  isEnabled: () => boolean;
  setEnabled: (on: boolean) => void;
}

export function createLakesOverlay(
  map: maplibregl.Map,
  lakes: Lake[] = MX_LAKES,
): LakesOverlay {
  return {
    isEnabled: (): boolean => !!map.getLayer(CIRCLE_LAYER_ID),
    setEnabled: (on: boolean): void => {
      if (!on) {
        if (map.getLayer(LABEL_LAYER_ID)) map.removeLayer(LABEL_LAYER_ID);
        if (map.getLayer(CIRCLE_LAYER_ID)) map.removeLayer(CIRCLE_LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
        return;
      }
      if (map.getSource(SOURCE_ID)) return;
      const data: FeatureCollection = {
        type: 'FeatureCollection',
        features: lakes.map((l) => ({
          type: 'Feature',
          properties: { name: l.name, label: `💧 ${l.name}` },
          geometry: { type: 'Point', coordinates: [l.lng, l.lat] },
        })),
      };
      map.addSource(SOURCE_ID, { type: 'geojson', data });
      map.addLayer({
        id: CIRCLE_LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': 5,
          'circle-color': '#0891b2',
          'circle-opacity': 0.85,
          'circle-stroke-color': '#cffafe',
          'circle-stroke-width': 1.1,
        },
      });
      map.addLayer({
        id: LABEL_LAYER_ID,
        type: 'symbol',
        source: SOURCE_ID,
        minzoom: 5,
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 10,
          'text-offset': [0, 1.1],
          'text-anchor': 'top',
          'text-allow-overlap': false,
          'text-optional': true,
        },
        paint: {
          'text-color': '#0e7490',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.1,
        },
      });
    },
  };
}

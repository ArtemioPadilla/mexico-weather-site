/**
 * Active volcanoes overlay — MX-unique (plan 2.4).
 *
 * Static list of currently-monitored active volcanoes in Mexico
 * (CENAPRED list). Renders as red circles + 🌋-prefixed labels.
 * No external fetches.
 *
 * Factory pattern: `createVolcanoesOverlay(map)` returns an object
 * with the same shape the overlay registry expects:
 *   { isEnabled: () => boolean, setEnabled: (on: boolean) => void }
 *
 * Extracted from interactive-map.ts (refactor — see PLAN_UX_PARITY.md
 * §"Refactor" follow-up).
 */
import type { FeatureCollection } from 'geojson';
import type maplibregl from 'maplibre-gl';

const SOURCE_ID = 'wx-volcanoes-src';
const CIRCLE_LAYER_ID = 'wx-volcanoes-circle';
const LABEL_LAYER_ID = 'wx-volcanoes-label';

export interface Volcano {
  name: string;
  lng: number;
  lat: number;
}

export const MX_VOLCANOES: Volcano[] = [
  { name: 'Popocatépetl', lng: -98.6225, lat: 19.0231 },
  { name: 'Colima (Fuego)', lng: -103.6175, lat: 19.5142 },
  { name: 'El Chichón', lng: -93.2289, lat: 17.36 },
  { name: 'Tacaná', lng: -92.111, lat: 15.13 },
  { name: 'Citlaltépetl', lng: -97.268, lat: 19.03 },
  { name: 'Tres Vírgenes', lng: -112.59, lat: 27.47 },
  { name: 'Bárcena (San Benedicto)', lng: -110.812, lat: 19.302 },
  { name: 'Evermann (Socorro)', lng: -111.045, lat: 18.78 },
];

export interface VolcanoesOverlay {
  isEnabled: () => boolean;
  setEnabled: (on: boolean) => void;
}

export function createVolcanoesOverlay(
  map: maplibregl.Map,
  volcanoes: Volcano[] = MX_VOLCANOES,
): VolcanoesOverlay {
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
        features: volcanoes.map((v) => ({
          type: 'Feature',
          properties: { name: v.name, label: `🌋 ${v.name}` },
          geometry: { type: 'Point', coordinates: [v.lng, v.lat] },
        })),
      };
      map.addSource(SOURCE_ID, { type: 'geojson', data });
      map.addLayer({
        id: CIRCLE_LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': 6,
          'circle-color': '#dc2626',
          'circle-opacity': 0.85,
          'circle-stroke-color': '#fef3c7',
          'circle-stroke-width': 1.2,
        },
      });
      map.addLayer({
        id: LABEL_LAYER_ID,
        type: 'symbol',
        source: SOURCE_ID,
        minzoom: 5,
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-offset': [0, 1.1],
          'text-anchor': 'top',
          'text-allow-overlap': false,
          'text-optional': true,
        },
        paint: {
          'text-color': '#dc2626',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.2,
        },
      });
    },
  };
}

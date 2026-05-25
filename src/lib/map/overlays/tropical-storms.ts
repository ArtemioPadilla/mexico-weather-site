/**
 * Tropical storms overlay (zoom.earth "Sistemas tropicales").
 *
 * Active NHC Atlantic + East Pacific systems rendered as classification-
 * coloured circles + a name label. During hurricane off-season (Dec-May
 * typically) the data is empty and the overlay auto-disables.
 *
 * The factory takes:
 *   - a `source` with `fetch(): Promise<readonly NhcStorm[]>` (typically
 *     nhcSource from src/lib/map/sources/nhc.ts so this remains testable),
 *   - an optional `onEmpty()` callback fired when NHC returns zero storms;
 *     the wiring layer uses this to auto-uncheck the overlay checkbox.
 */
import type { FeatureCollection } from 'geojson';
import type maplibregl from 'maplibre-gl';
import type { NhcStorm } from '../sources/nhc';

const SOURCE_ID = 'wx-storms-src';
const CIRCLE_LAYER_ID = 'wx-storms-circle';
const LABEL_LAYER_ID = 'wx-storms-label';

export type { NhcStorm } from '../sources/nhc';

export interface TropicalStormsSource {
  fetch: () => Promise<readonly NhcStorm[]>;
}

export function stormsFeatureCollection(
  storms: readonly NhcStorm[],
): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: storms.map((s) => ({
      type: 'Feature',
      properties: {
        name: s.name,
        classification: s.classification,
        intensityKt: s.intensityKt ?? 0,
        label: `${s.classification} ${s.name}`,
      },
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
    })),
  };
}

export interface TropicalStormsOverlay {
  isEnabled: () => boolean;
  /** Toggle visibility of the layers (the data is fetched separately
   *  via refresh(); this is a pure visibility flip). */
  setEnabled: (on: boolean) => void;
  /** Re-fetch from NHC and update the source data. Safe to call any
   *  number of times — idempotent across calls. */
  refresh: () => Promise<void>;
}

export function createTropicalStormsOverlay(
  map: maplibregl.Map,
  source: TropicalStormsSource,
  onEmpty?: () => void,
): TropicalStormsOverlay {
  function ensureLayers(initial: FeatureCollection): void {
    if (map.getSource(SOURCE_ID)) return;
    map.addSource(SOURCE_ID, { type: 'geojson', data: initial });
    map.addLayer({
      id: CIRCLE_LAYER_ID,
      type: 'circle',
      source: SOURCE_ID,
      paint: {
        // HU/MH red; TS orange; TD yellow; default orange.
        'circle-color': [
          'match',
          ['get', 'classification'],
          'HU', '#dc2626',
          'MH', '#b91c1c',
          'TS', '#f97316',
          'TD', '#eab308',
          '#f97316',
        ],
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['get', 'intensityKt'],
          0, 6,
          50, 9,
          100, 13,
          150, 18,
        ],
        'circle-opacity': 0.85,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
      },
    });
    map.addLayer({
      id: LABEL_LAYER_ID,
      type: 'symbol',
      source: SOURCE_ID,
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 11,
        'text-offset': [0, 1.6],
        'text-anchor': 'top',
        'text-font': ['Open Sans Semibold'],
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': 'rgba(0,0,0,0.8)',
        'text-halo-width': 1.4,
      },
    });
  }

  return {
    isEnabled: (): boolean => {
      const c = map.getLayer(CIRCLE_LAYER_ID);
      if (!c) return false;
      return map.getLayoutProperty(CIRCLE_LAYER_ID, 'visibility') !== 'none';
    },
    setEnabled: (on: boolean): void => {
      const vis = on ? 'visible' : 'none';
      if (map.getLayer(CIRCLE_LAYER_ID))
        map.setLayoutProperty(CIRCLE_LAYER_ID, 'visibility', vis);
      if (map.getLayer(LABEL_LAYER_ID))
        map.setLayoutProperty(LABEL_LAYER_ID, 'visibility', vis);
    },
    refresh: async (): Promise<void> => {
      let storms: readonly NhcStorm[];
      try {
        storms = await source.fetch();
      } catch {
        storms = [];
      }
      const fc = stormsFeatureCollection(storms);
      const existing = map.getSource(SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (existing) {
        existing.setData(fc);
      } else {
        ensureLayers(fc);
      }
      if (storms.length === 0 && onEmpty) onEmpty();
    },
  };
}

/**
 * Pressure isobars layer.
 *
 * Renders d3-contour iso-lines over the active pressure field as thin
 * white polylines. Visible only when the pressure layer is active —
 * the wiring code in interactive-map.ts gates refresh() accordingly.
 *
 * The factory exposes update() / remove() so the caller can keep its
 * existing tick (post-frame, post-pan) flow.
 */
import type { FeatureCollection } from 'geojson';
import type maplibregl from 'maplibre-gl';
import { computeIsobars } from '../utils/isobars';

const SOURCE_ID = 'wx-isobars-src';
const LAYER_ID = 'wx-isobars-line';

export interface IsobarsLayer {
  /** Add/update the layer with iso-lines for the given field values
   *  laid out row-major. Internally builds the GeoJSON via
   *  computeIsobars() and either creates the source/layer (first
   *  call) or replaces its data (subsequent calls). */
  update: (input: {
    values: number[];
    cols: number;
    rows: number;
    bounds: { south: number; west: number; north: number; east: number };
  }) => void;
  /** Tear down the source + layer. */
  remove: () => void;
}

export function createIsobarsLayer(map: maplibregl.Map): IsobarsLayer {
  return {
    update: (input): void => {
      const fc: FeatureCollection = computeIsobars({
        values: input.values,
        cols: input.cols,
        rows: input.rows,
        south: input.bounds.south,
        west: input.bounds.west,
        north: input.bounds.north,
        east: input.bounds.east,
      });
      const existing = map.getSource(SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (existing) {
        existing.setData(fc);
        return;
      }
      map.addSource(SOURCE_ID, { type: 'geojson', data: fc });
      map.addLayer({
        id: LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        paint: {
          'line-color': '#ffffff',
          'line-width': 1.0,
          'line-opacity': 0.55,
        },
      });
    },
    remove: (): void => {
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    },
  };
}

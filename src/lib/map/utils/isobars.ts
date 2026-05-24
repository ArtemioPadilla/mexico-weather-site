/**
 * Compute pressure isobars (iso-contour lines) from a gridded field for
 * rendering on top of a MapLibre map.
 *
 * Pure: takes a numeric value array + grid dimensions + geographic bounds
 * and returns a GeoJSON FeatureCollection of LineStrings whose `pressure`
 * property is the threshold for that line. Plugins can style them however
 * they want (white thin lines for zoom.earth-style isobars).
 */

import { contours } from 'd3-contour';
import type {
  FeatureCollection,
  LineString,
  MultiPolygon,
  Position,
} from 'geojson';

export interface IsobarsParams {
  /** Row-major array of values; length === cols × rows. */
  values: readonly number[];
  cols: number;
  rows: number;
  /** Geographic bounds the grid spans. */
  south: number;
  west: number;
  north: number;
  east: number;
  /** Contour thresholds. Defaults to standard pressure isobars (hPa). */
  thresholds?: readonly number[];
}

const DEFAULT_THRESHOLDS = [
  988, 992, 996, 1000, 1004, 1008, 1012, 1016, 1020, 1024, 1028, 1032,
] as const;

/**
 * Build a GeoJSON FeatureCollection of isobaric LineString features.
 *
 * d3-contour returns MultiPolygon features; we flatten their rings into
 * LineStrings so MapLibre paints them with a `line` layer (filled polygons
 * obscure the underlying field raster, which we want to keep visible).
 */
export function computeIsobars(
  params: IsobarsParams,
): FeatureCollection<LineString, { pressure: number }> {
  const {
    values,
    cols,
    rows,
    south,
    west,
    north,
    east,
    thresholds = DEFAULT_THRESHOLDS,
  } = params;

  if (values.length !== cols * rows || cols < 2 || rows < 2) {
    return { type: 'FeatureCollection', features: [] };
  }

  // d3-contour emits geometries in grid coordinates [0..cols-1, 0..rows-1].
  // We project each (gx, gy) to (lng, lat) using a simple affine map; the
  // contour generator wants the same orientation as the input array, so
  // gy=0 corresponds to values[0..cols-1] which we placed at `south`.
  const lngPerCol = (east - west) / (cols - 1);
  const latPerRow = (north - south) / (rows - 1);

  const project = (pt: Position): Position => {
    // d3-contour can emit coordinates marginally past the [0,cols-1] /
    // [0,rows-1] range when a contour passes through the grid edge; clamp
    // them back into geographic bounds so we never paint points outside
    // the viewport.
    const gx = Math.max(0, Math.min(cols - 1, pt[0] as number));
    const gy = Math.max(0, Math.min(rows - 1, pt[1] as number));
    return [west + gx * lngPerCol, south + gy * latPerRow];
  };

  const projectRing = (ring: Position[]): Position[] => ring.map(project);

  const features: FeatureCollection<
    LineString,
    { pressure: number }
  >['features'] = [];

  const generator = contours()
    .size([cols, rows])
    .thresholds(Array.from(thresholds));

  const polys = generator(Array.from(values)) as unknown as Array<
    MultiPolygon & { value: number }
  >;

  for (const poly of polys) {
    const pressure = poly.value;
    // MultiPolygon coordinates: Polygon[][] → Ring[][] each ring is a LineString.
    for (const polygon of poly.coordinates) {
      for (const ring of polygon) {
        const projected = projectRing(ring);
        if (projected.length < 2) continue;
        features.push({
          type: 'Feature',
          properties: { pressure },
          geometry: { type: 'LineString', coordinates: projected },
        });
      }
    }
  }

  return { type: 'FeatureCollection', features };
}

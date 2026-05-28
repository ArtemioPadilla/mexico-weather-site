/**
 * Open-Meteo data source.
 *
 * Wraps the chunked fetch helpers + response parsers from
 * `src/lib/mapfields.ts` in the canonical {@link DataSource}
 * interface so map plugins can fetch gridded forecasts without
 * knowing about URLs, chunking, or caching.
 *
 * Two source instances are exposed because Open-Meteo's gridded API
 * uses different parameter shapes for scalar fields (temperature,
 * humidity, pressure) versus vector fields (wind speed + direction).
 *
 * Chunking note: at 32x24=768 points the single-URL form exceeds
 * Open-Meteo's ~8 KB GET limit (HTTP 414). Both sources use
 * fetchFieldChunks / fetchWindChunks which split into ≤200-point
 * batches. Default 10x7=70 points is already safe, but the
 * chunked path makes any caller that bumps the grid past 200
 * points safe by default.
 */

import {
  fetchFieldChunks,
  fetchWindChunks,
  parseFieldResponse,
  parseWindResponse,
  type Bounds,
  type FieldGrid,
  type LngLat,
  type WindGrid,
  viewportGrid,
} from '../../mapfields';
import type { DataSource } from '../core/types';

const ATTRIBUTION = 'Open-Meteo';
/** Open-Meteo updates hourly; 10 min is a safe TTL for client-side reuse. */
const TTL_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// Scalar field source (temperature_2m, relative_humidity_2m, surface_pressure)
// ---------------------------------------------------------------------------

export interface OpenMeteoFieldParams {
  /** Viewport bounding box in WGS84. */
  bounds: Bounds;
  /** Open-Meteo hourly variable, e.g. 'temperature_2m'. */
  hourlyVar: string;
  /** Sample grid columns × rows. Defaults to 10×7 (70 points). At
   *  this size the URL fits in one chunk; larger grids are split
   *  automatically by fetchFieldChunks. */
  cols?: number;
  rows?: number;
}

export const openMeteoFieldSource: DataSource<
  OpenMeteoFieldParams,
  FieldGrid | null
> = {
  id: 'open-meteo-field',
  ttl: TTL_MS,
  attribution: ATTRIBUTION,

  async fetch(params, signal) {
    const cols = params.cols ?? 10;
    const rows = params.rows ?? 7;
    const points: LngLat[] = viewportGrid(params.bounds, cols, rows);
    try {
      const json = await fetchFieldChunks(
        points,
        params.hourlyVar,
        globalThis.fetch,
        { signal },
      );
      return parseFieldResponse(json, points, params.hourlyVar);
    } catch {
      return null;
    }
  },
};

// ---------------------------------------------------------------------------
// Wind vector source
// ---------------------------------------------------------------------------

export interface OpenMeteoWindParams {
  bounds: Bounds;
  cols?: number;
  rows?: number;
}

export const openMeteoWindSource: DataSource<
  OpenMeteoWindParams,
  WindGrid | null
> = {
  id: 'open-meteo-wind',
  ttl: TTL_MS,
  attribution: ATTRIBUTION,

  async fetch(params, signal) {
    const cols = params.cols ?? 10;
    const rows = params.rows ?? 7;
    const points: LngLat[] = viewportGrid(params.bounds, cols, rows);
    try {
      const json = await fetchWindChunks(
        points,
        'wind_speed_10m',
        globalThis.fetch,
        { signal },
      );
      return parseWindResponse(json, points);
    } catch {
      return null;
    }
  },
};

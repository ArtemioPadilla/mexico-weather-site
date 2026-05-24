/**
 * Open-Meteo data source.
 *
 * Wraps the pure URL builders + response parsers from `src/lib/mapfields.ts`
 * in the canonical {@link DataSource} interface so map plugins can fetch
 * gridded forecasts without knowing about URLs, caching, or coalescing.
 *
 * Two source instances are exposed because Open-Meteo's gridded API uses
 * different parameter shapes for scalar fields (temperature, humidity,
 * pressure) versus vector fields (wind speed + direction).
 */

import {
  buildFieldUrl,
  buildWindUrl,
  parseFieldResponse,
  parseWindResponse,
  type Bounds,
  type FieldGrid,
  type LngLat,
  type WindGrid,
  viewportGrid,
} from '../../mapfields';
import type { DataSource } from '../core/types';
import { cachedFetch } from '../utils/fetch';

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
  /** Sample grid columns × rows. Defaults to 10×7 (70 points) which fits
   *  Open-Meteo's bulk request limits comfortably. */
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
    const url = buildFieldUrl(points, params.hourlyVar);
    const res = await cachedFetch(url, { signal });
    if (!res.ok) return null;
    const json = await res.json();
    return parseFieldResponse(json, points, params.hourlyVar);
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
    const url = buildWindUrl(points);
    const res = await cachedFetch(url, { signal });
    if (!res.ok) return null;
    const json = await res.json();
    return parseWindResponse(json, points);
  },
};

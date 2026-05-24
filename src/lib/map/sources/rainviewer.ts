/**
 * RainViewer data source.
 *
 * RainViewer publishes a single manifest at
 * `https://api.rainviewer.com/public/weather-maps.json` listing all
 * available radar (past + nowcast) and satellite-IR frames plus the CDN
 * host to fetch them from. This module wraps that manifest fetch in the
 * canonical {@link DataSource} interface and re-exports the existing
 * pure helpers (`rainviewerTileUrl`, `parseRainviewerManifest`) so
 * plugins can compose their own tile URLs.
 */

import {
  parseRainviewerManifest,
  rainviewerTileUrl,
  type RainviewerData,
  type RadarFrame,
  type TileOpts,
} from '../../maplayers';
import type { DataSource } from '../core/types';
import { cachedFetch } from '../utils/fetch';

const MANIFEST_URL = 'https://api.rainviewer.com/public/weather-maps.json';
const ATTRIBUTION = '© RainViewer';
/** RainViewer updates every ~5 min; cache the manifest for 60 s so opening
 *  multiple weather maps in quick succession doesn't refetch. */
const TTL_MS = 60 * 1000;

// ---------------------------------------------------------------------------
// Manifest source
// ---------------------------------------------------------------------------

export const rainviewerManifestSource: DataSource<
  void,
  RainviewerData | null
> = {
  id: 'rainviewer-manifest',
  ttl: TTL_MS,
  attribution: ATTRIBUTION,

  async fetch(_params, signal) {
    const res = await cachedFetch(MANIFEST_URL, { signal });
    if (!res.ok) return null;
    const json = await res.json();
    return parseRainviewerManifest(json);
  },
};

// ---------------------------------------------------------------------------
// Re-exports for plugin convenience
// ---------------------------------------------------------------------------

export { parseRainviewerManifest, rainviewerTileUrl };
export type { RainviewerData, RadarFrame, TileOpts };

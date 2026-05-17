// DOM-free Open-Meteo geocoding (location search) SDK.
// Reuses the shared retrying JSON requester from weather.ts.

import {
  type RequestDeps,
  type RetryOptions,
  DEFAULT_RETRY,
  requestJsonWithRetry,
} from './weather';

export interface GeoResult {
  name: string;
  admin1?: string;
  country?: string;
  lat: number;
  lng: number;
  tz: string;
}

interface ApiResult {
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

/** Build the Open-Meteo geocoding search URL. */
export function buildGeocodeUrl(query: string, lang = 'es'): string {
  const params = new URLSearchParams({
    name: query,
    count: '8',
    language: lang,
    format: 'json',
  });
  return `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`;
}

/**
 * Search for locations matching `query`. Returns an empty array (without any
 * network call) for a blank query, and an empty array when the API response
 * has no `results`.
 */
export async function geocode(
  query: string,
  deps: RequestDeps,
  lang = 'es',
  retry: RetryOptions = DEFAULT_RETRY,
): Promise<GeoResult[]> {
  const trimmed = query.trim();
  if (trimmed === '') return [];

  const data = await requestJsonWithRetry<{ results?: ApiResult[] }>(
    buildGeocodeUrl(trimmed, lang),
    deps,
    retry,
  );

  if (!Array.isArray(data.results)) return [];

  return data.results.map((r) => ({
    name: r.name,
    admin1: r.admin1,
    country: r.country,
    lat: r.latitude,
    lng: r.longitude,
    tz: r.timezone,
  }));
}

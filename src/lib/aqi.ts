/**
 * AQI client + EPA breakpoint helpers.
 *
 * Loads the per-hour PM2.5 snapshot from
 * public/data/aqi-snapshot.json (produced by
 * scripts/build-aqi-snapshot.py) and exposes:
 *   - findNearestAqi(coords): the closest station within MAX_KM
 *   - aqiLevel(pm): EPA AQI band for a PM2.5 reading
 *
 * The snapshot is a GeoJSON FeatureCollection with one feature per
 * monitored MX city. We do a brute-force Haversine over all features
 * (12 stations as of writing) — fine without a spatial index.
 */

interface AqiFeature {
  type: 'Feature';
  properties?: {
    name?: string;
    pm?: number;
    color?: string;
    label?: string;
  };
  geometry?: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
}

interface AqiDoc {
  features?: AqiFeature[];
  metadata?: { updated?: string };
}

/** Stations beyond this distance from the user's coords are ignored
 *  — a Cancún user has nothing useful from a Tijuana station. */
export const MAX_NEAREST_KM = 50;

export interface AqiLevel {
  /** EPA AQI band: good / moderate / unhealthy-sensitive / unhealthy /
   *  very-unhealthy / hazardous. */
  band:
    | 'good'
    | 'moderate'
    | 'unhealthy-sensitive'
    | 'unhealthy'
    | 'very-unhealthy'
    | 'hazardous';
  /** Spanish label for UI. */
  label: string;
  /** English label for UI (i18n). */
  labelEn: string;
  /** Tailwind classes for badge styling. */
  tw: string;
  /** Brief recommendation for sensitive populations. */
  advice: string;
  /** English advice (i18n). */
  adviceEn: string;
}

/** EPA 24-h PM2.5 breakpoints → AQI band. Numeric thresholds match
 *  scripts/build-aqi-snapshot.py epa_color(). */
export function aqiLevel(pm: number): AqiLevel {
  if (pm < 12) {
    return {
      band: 'good',
      label: 'Buena',
      labelEn: 'Good',
      tw: 'bg-green-100 text-green-900 ring-green-300 dark:bg-green-950 dark:text-green-200 dark:ring-green-900',
      advice: 'Aire limpio. Sin restricciones para actividades al aire libre.',
      adviceEn: 'Clean air. No restrictions for outdoor activity.',
    };
  }
  if (pm < 35) {
    return {
      band: 'moderate',
      label: 'Moderada',
      labelEn: 'Moderate',
      tw: 'bg-yellow-100 text-yellow-900 ring-yellow-300 dark:bg-yellow-950 dark:text-yellow-200 dark:ring-yellow-900',
      advice:
        'Aceptable para la mayoría. Personas inusualmente sensibles pueden notar molestias.',
      adviceEn:
        'Acceptable for most. Unusually sensitive people may notice mild irritation.',
    };
  }
  if (pm < 55) {
    return {
      band: 'unhealthy-sensitive',
      label: 'Dañina para grupos sensibles',
      labelEn: 'Unhealthy for sensitive groups',
      tw: 'bg-orange-100 text-orange-900 ring-orange-300 dark:bg-orange-950 dark:text-orange-200 dark:ring-orange-900',
      advice:
        'Niños, adultos mayores y personas con asma deberían limitar la actividad al aire libre.',
      adviceEn:
        'Children, older adults, and people with asthma should limit outdoor activity.',
    };
  }
  if (pm < 150) {
    return {
      band: 'unhealthy',
      label: 'Dañina',
      labelEn: 'Unhealthy',
      tw: 'bg-red-100 text-red-900 ring-red-300 dark:bg-red-950 dark:text-red-200 dark:ring-red-900',
      advice:
        'Todos pueden experimentar efectos. Limita el ejercicio prolongado al aire libre.',
      adviceEn:
        'Everyone may experience effects. Limit prolonged outdoor exertion.',
    };
  }
  if (pm < 250) {
    return {
      band: 'very-unhealthy',
      label: 'Muy dañina',
      labelEn: 'Very unhealthy',
      tw: 'bg-purple-100 text-purple-900 ring-purple-300 dark:bg-purple-950 dark:text-purple-200 dark:ring-purple-900',
      advice:
        'Evita actividades al aire libre. Mantén ventanas cerradas si es posible.',
      adviceEn:
        'Avoid outdoor activity. Keep windows closed if possible.',
    };
  }
  return {
    band: 'hazardous',
    label: 'Peligrosa',
    labelEn: 'Hazardous',
    tw: 'bg-rose-200 text-rose-950 ring-rose-400 dark:bg-rose-900 dark:text-rose-100 dark:ring-rose-700',
    advice:
      'Alerta sanitaria. Permanece en interiores; usa cubrebocas N95 si debes salir.',
    adviceEn:
      'Health alert. Stay indoors; wear an N95 mask if you must go out.',
  };
}

/** Haversine distance in km between two lat/lng points. */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface NearestAqiResult {
  name: string;
  pm: number;
  distanceKm: number;
  level: AqiLevel;
  updated?: string;
}

let cached: AqiDoc | null = null;
let inflight: Promise<AqiDoc | null> | null = null;

export function resetAqiCache(): void {
  cached = null;
  inflight = null;
}

async function loadDoc(
  base: string,
  fetchImpl: typeof fetch,
): Promise<AqiDoc | null> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await fetchImpl(`${base}data/aqi-snapshot.json`);
      if (!r.ok) return null;
      cached = (await r.json()) as AqiDoc;
      return cached;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Return the closest AQI station within MAX_NEAREST_KM of the given
 *  coords. Returns null when no station is in range, or the snapshot
 *  is unavailable. */
export async function findNearestAqi(
  lat: number,
  lng: number,
  base: string,
  fetchImpl: typeof fetch = fetch,
  maxKm = MAX_NEAREST_KM,
): Promise<NearestAqiResult | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const doc = await loadDoc(base, fetchImpl);
  if (!doc || !Array.isArray(doc.features)) return null;
  let best: { name: string; pm: number; distanceKm: number } | null = null;
  for (const f of doc.features) {
    const coords = f.geometry?.coordinates;
    const name = f.properties?.name;
    const pm = f.properties?.pm;
    if (!coords || !name || typeof pm !== 'number') continue;
    const d = haversineKm(lat, lng, coords[1]!, coords[0]!);
    if (d > maxKm) continue;
    if (!best || d < best.distanceKm) {
      best = { name, pm, distanceKm: d };
    }
  }
  if (!best) return null;
  return {
    name: best.name,
    pm: best.pm,
    distanceKm: best.distanceKm,
    level: aqiLevel(best.pm),
    updated: doc.metadata?.updated,
  };
}

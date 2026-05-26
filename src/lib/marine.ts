/**
 * Marine snapshot client — wave height + sea-surface temperature
 * for the 14 MX beach destinations cached hourly by
 * scripts/build-marine-snapshot.py.
 *
 * Used by /playa/<slug>/ (build-time beach name) and /forecast/
 * (runtime nearest-beach lookup, inland coords get nothing).
 */
import { TOP_BEACHES } from './top-beaches';

interface MarineFeature {
  type: 'Feature';
  properties?: {
    name?: string;
    hs?: number;
    label?: string;
    color?: string;
  };
  geometry?: {
    type: 'Point';
    coordinates: [number, number];
  };
}

interface MarineDoc {
  features?: MarineFeature[];
  metadata?: { updated?: string };
}

/** Distance from any TOP_BEACHES entry beyond which we hide the
 *  marine panel on /forecast. 15 km covers coastal cities like
 *  Cancún even if the user's exact coords are inland. */
export const COAST_MAX_KM = 15;

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

export interface MarineReading {
  beachName: string;
  /** Wave height in meters. */
  hs: number | null;
  /** Sea-surface temperature in °C, parsed from the label string
   *  (the snapshot doesn't carry SST as a structured field). */
  sst: number | null;
  /** Distance from the requesting coords to the beach (km). */
  distanceKm: number;
  updated?: string;
}

let cached: MarineDoc | null = null;
let inflight: Promise<MarineDoc | null> | null = null;

export function resetMarineCache(): void {
  cached = null;
  inflight = null;
}

async function loadDoc(
  base: string,
  fetchImpl: typeof fetch,
): Promise<MarineDoc | null> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await fetchImpl(`${base}data/marine-snapshot.json`);
      if (!r.ok) return null;
      cached = (await r.json()) as MarineDoc;
      return cached;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Parse the SST integer out of a label like "Cancún\n🌊 1.2 m\n🌡 26°".
 *  The snapshot generator encodes SST only in the human label string
 *  (build-marine-snapshot.py); we reverse-extract here. */
function parseSstFromLabel(label: string | undefined): number | null {
  if (!label) return null;
  const m = /🌡\s*(-?\d+)/.exec(label);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** Find the named beach in the snapshot (used by /playa/<slug>/
 *  where we know the beach by name from TopBeach). */
export async function findMarineByName(
  beachName: string,
  base: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MarineReading | null> {
  const doc = await loadDoc(base, fetchImpl);
  if (!doc || !Array.isArray(doc.features)) return null;
  const f = doc.features.find((x) => x?.properties?.name === beachName);
  if (!f) return null;
  return {
    beachName,
    hs: typeof f.properties?.hs === 'number' ? f.properties.hs : null,
    sst: parseSstFromLabel(f.properties?.label),
    distanceKm: 0,
    updated: doc.metadata?.updated,
  };
}

/** Find the nearest TOP_BEACHES entry within COAST_MAX_KM of the
 *  given coords, then look up its data in the snapshot. Used by
 *  /forecast/ where the user might be at a custom inland or coastal
 *  point. Returns null when no beach is in range. */
export async function findNearestMarine(
  lat: number,
  lng: number,
  base: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MarineReading | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // Step 1: find the nearest TOP_BEACHES entry. We use the curated
  // list (not the snapshot) because the snapshot only carries name
  // + coords; using TOP_BEACHES guarantees we have the same names
  // the snapshot uses for the lookup.
  let best: { name: string; dist: number } | null = null;
  for (const b of TOP_BEACHES) {
    const d = haversineKm(lat, lng, b.lat, b.lng);
    if (d > COAST_MAX_KM) continue;
    if (!best || d < best.dist) best = { name: b.name, dist: d };
  }
  if (!best) return null;
  const reading = await findMarineByName(best.name, base, fetchImpl);
  if (!reading) return null;
  return { ...reading, distanceKm: best.dist };
}

/** Spanish UI qualifiers for wave height. */
export function waveLabel(hs: number): string {
  if (hs < 0.5) return 'Mar calmo';
  if (hs < 1.0) return 'Olas pequeñas';
  if (hs < 1.5) return 'Olas moderadas';
  if (hs < 2.5) return 'Olas grandes';
  return 'Olas peligrosas';
}

/** Spanish UI qualifier for SST. */
export function sstLabel(sst: number): string {
  if (sst < 18) return 'Frío';
  if (sst < 22) return 'Fresco';
  if (sst < 26) return 'Templado';
  if (sst < 29) return 'Cálido';
  return 'Muy cálido';
}

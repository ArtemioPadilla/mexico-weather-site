/**
 * Geodesic distance & area helpers for the map measure tools (plan P2.1).
 *
 * Pure, DOM-free; the UI lives in interactive-map.ts.
 *
 * Distance: haversine on a 6371-km sphere — accurate to ~0.3% for any
 * point-pair on Earth, sub-metre over the MX bounding box.
 *
 * Area: spherical-excess (also called L'Huilier / shoelace-on-sphere)
 * — accurate for any closed polygon on a unit sphere, scaled by R².
 */

const EARTH_RADIUS_KM = 6371;

const D2R = Math.PI / 180;

/**
 * Great-circle distance between two (lng, lat) points in kilometres.
 */
export function haversineKm(
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = (lat2 - lat1) * D2R;
  const dLng = (lng2 - lng1) * D2R;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Total path length (km) of an open polyline (no closing edge).
 */
export function polylineLengthKm(
  pts: readonly (readonly [number, number])[],
): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += haversineKm(pts[i - 1], pts[i]);
  }
  return total;
}

/**
 * Area of a closed spherical polygon in square kilometres (km²),
 * using L'Huilier's spherical-excess formula. Polygon is assumed
 * closed implicitly (last vertex connects to first); orientation
 * doesn't matter (the absolute value of the sum is taken).
 *
 * Accurate to << 1% for polygons up to continental scale.
 */
export function sphericalAreaKm2(
  pts: readonly (readonly [number, number])[],
): number {
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const [lng1, lat1] = pts[i];
    const [lng2, lat2] = pts[j];
    sum += (lng2 - lng1) * D2R * (2 + Math.sin(lat1 * D2R) + Math.sin(lat2 * D2R));
  }
  return (Math.abs(sum) * EARTH_RADIUS_KM * EARTH_RADIUS_KM) / 2;
}

/**
 * Format a distance in km as a human-readable string.
 *   <1 km   → "850 m"
 *   <100 km → "12.4 km"
 *   ≥100 km → "1,234 km"
 */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString('es-MX')} km`;
}

/**
 * Format an area in km² as a human-readable string.
 *   <1 km²    → "320,000 m²"
 *   <10000    → "1,234 km²"
 *   ≥10000    → "12,345 km²"
 */
export function formatArea(km2: number): string {
  if (km2 < 1) return `${Math.round(km2 * 1_000_000).toLocaleString('es-MX')} m²`;
  return `${Math.round(km2).toLocaleString('es-MX')} km²`;
}

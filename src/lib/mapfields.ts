// Pure, DOM-free Open-Meteo gridded-field helpers for /mapa field layers.

export interface LngLat {
  lat: number;
  lng: number;
}

export interface FieldGrid {
  /** ISO hourly timestamps (canonical, from the first result). */
  times: string[];
  /** One entry per input point, aligned by index; `values[h]` is the value at hour h (null when Open-Meteo has no data for that cell). */
  points: { lat: number; lng: number; values: (number | null)[] }[];
}

export interface LegendStop {
  label: string;
  color: string;
}

/** Bounding box in degrees. */
export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Evenly spaced sample points across `b`, edge-inclusive. Min 2x2. */
export function viewportGrid(b: Bounds, cols: number, rows: number): LngLat[] {
  const c = Math.max(2, Math.floor(cols));
  const r = Math.max(2, Math.floor(rows));
  const pts: LngLat[] = [];
  for (let j = 0; j < r; j++) {
    const lat = b.south + ((b.north - b.south) * j) / (r - 1);
    for (let i = 0; i < c; i++) {
      const lng = b.west + ((b.east - b.west) * i) / (c - 1);
      pts.push({ lng: Number(lng.toFixed(4)), lat: Number(lat.toFixed(4)) });
    }
  }
  return pts;
}

/** Keyless Open-Meteo bulk forecast URL for the given points + hourly variable. */
export function buildFieldUrl(points: LngLat[], hourlyVar: string): string {
  const lats = points.map((p) => p.lat).join(',');
  const lngs = points.map((p) => p.lng).join(',');
  return (
    `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}` +
    `&hourly=${hourlyVar}&forecast_days=2&timezone=UTC`
  );
}

function isNumberOrNullArray(a: unknown): a is (number | null)[] {
  return (
    Array.isArray(a) &&
    a.every((n) => n === null || (typeof n === 'number' && Number.isFinite(n)))
  );
}

/** Normalise an Open-Meteo response (array for many points, object for one) into a FieldGrid. */
export function parseFieldResponse(
  json: unknown,
  points: LngLat[],
  hourlyVar: string,
): FieldGrid | null {
  if (!json) return null;
  const arr = Array.isArray(json) ? json : [json];
  if (arr.length !== points.length) return null;
  const first = arr[0] as { hourly?: { time?: unknown } } | undefined;
  const times = first?.hourly?.time;
  if (!Array.isArray(times) || times.length === 0) return null;
  const out: FieldGrid['points'] = [];
  for (let i = 0; i < arr.length; i++) {
    const h = (arr[i] as { hourly?: Record<string, unknown> } | undefined)?.hourly;
    const values = h?.[hourlyVar];
    if (!isNumberOrNullArray(values)) return null;
    out.push({ lat: points[i].lat, lng: points[i].lng, values });
  }
  return { times: times as string[], points: out };
}

/** Parse an ISO string as UTC: bare strings (no Z / offset) are treated as UTC per Open-Meteo. */
function parseUtcMs(s: string): number {
  return /[Zz]|[+-]\d{2}:\d{2}$/.test(s) ? Date.parse(s) : Date.parse(s + 'Z');
}

/** Hourly index closest to `iso`; nearest to `nowMs` if iso null/invalid; -1 if empty. */
export function fieldFrameIndex(times: string[], iso: string | null, nowMs: number): number {
  if (times.length === 0) return -1;
  const ms = iso ? parseUtcMs(iso) : NaN;
  const target = Number.isFinite(ms) ? ms : nowMs;
  let best = 0;
  let bestDelta = Infinity;
  for (let i = 0; i < times.length; i++) {
    const d = Math.abs(parseUtcMs(times[i]) - target);
    if (d < bestDelta) {
      best = i;
      bestDelta = d;
    }
  }
  return best;
}

/** Temperature (°C) → hex colour on a clamped cold→warm ramp. */
export function tempColor(c: number): string {
  const stops: [number, string][] = [
    [-10, '#3b4cc0'],
    [0, '#5b8ff9'],
    [10, '#7dd1c8'],
    [18, '#7ad151'],
    [25, '#f9d423'],
    [32, '#f08a24'],
    [45, '#d7191c'],
  ];
  if (c <= stops[0][0]) return stops[0][1];
  if (c >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (c >= stops[i][0] && c < stops[i + 1][0]) return stops[i][1];
  }
  return stops[stops.length - 1][1];
}

export const TEMP_LEGEND: LegendStop[] = [
  { label: '≤0°', color: '#5b8ff9' },
  { label: '10°', color: '#7dd1c8' },
  { label: '18°', color: '#7ad151' },
  { label: '25°', color: '#f9d423' },
  { label: '32°', color: '#f08a24' },
  { label: '≥45°', color: '#d7191c' },
];

/** Relative humidity (%) → hex colour on a clamped dry→wet ramp. */
export function humidityColor(h: number): string {
  const stops: [number, string][] = [
    [0, '#fde725'],
    [20, '#a8db34'],
    [40, '#5dc863'],
    [60, '#21908d'],
    [80, '#3b528b'],
    [100, '#440154'],
  ];
  if (h <= stops[0][0]) return stops[0][1];
  if (h >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (h >= stops[i][0] && h < stops[i + 1][0]) return stops[i][1];
  }
  return stops[stops.length - 1][1];
}

/** Pressure (hPa, MSL) → hex colour on a clamped low→high ramp. */
export function pressureColor(p: number): string {
  const stops: [number, string][] = [
    [970, '#542788'],
    [990, '#998ec3'],
    [1005, '#d8daeb'],
    [1015, '#fee0b6'],
    [1025, '#f1a340'],
    [1040, '#b35806'],
  ];
  if (p <= stops[0][0]) return stops[0][1];
  if (p >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (p >= stops[i][0] && p < stops[i + 1][0]) return stops[i][1];
  }
  return stops[stops.length - 1][1];
}

export const HUMIDITY_LEGEND: LegendStop[] = [
  { label: '≤0%', color: '#fde725' },
  { label: '20%', color: '#a8db34' },
  { label: '40%', color: '#5dc863' },
  { label: '60%', color: '#21908d' },
  { label: '80%', color: '#3b528b' },
  { label: '≥100%', color: '#440154' },
];

export const PRESSURE_LEGEND: LegendStop[] = [
  { label: '≤970', color: '#542788' },
  { label: '990', color: '#998ec3' },
  { label: '1005', color: '#d8daeb' },
  { label: '1015', color: '#fee0b6' },
  { label: '1025', color: '#f1a340' },
  { label: '≥1040 hPa', color: '#b35806' },
];

import { windUv } from './mapwind';

/** Wind grid: u/v per point per hour, with nulls for no-data cells. */
export interface WindGrid {
  times: string[];
  points: { lat: number; lng: number; u: (number | null)[]; v: (number | null)[] }[];
}

/** Keyless Open-Meteo bulk URL fetching speed + direction together. */
export function buildWindUrl(
  points: LngLat[],
  speedVar: 'wind_speed_10m' | 'wind_gusts_10m' = 'wind_speed_10m',
): string {
  const lats = points.map((p) => p.lat).join(',');
  const lngs = points.map((p) => p.lng).join(',');
  return (
    `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}` +
    `&hourly=${speedVar},wind_direction_10m&forecast_days=2&timezone=UTC`
  );
}

function isSpeedDirArray(a: unknown): a is (number | null)[] {
  return (
    Array.isArray(a) &&
    a.every((n) => n === null || (typeof n === 'number' && Number.isFinite(n)))
  );
}

/** Normalise an Open-Meteo wind bulk response into a WindGrid (u/v decomposed). Null if unusable. */
export function parseWindResponse(
  json: unknown,
  points: LngLat[],
  speedVar: 'wind_speed_10m' | 'wind_gusts_10m' = 'wind_speed_10m',
): WindGrid | null {
  if (!json) return null;
  const arr = Array.isArray(json) ? json : [json];
  if (arr.length !== points.length) return null;
  const first = arr[0] as { hourly?: { time?: unknown } } | undefined;
  const times = first?.hourly?.time;
  if (!Array.isArray(times) || times.length === 0) return null;
  const out: WindGrid['points'] = [];
  for (let i = 0; i < arr.length; i++) {
    const h = (arr[i] as { hourly?: Record<string, unknown> } | undefined)?.hourly;
    const sp = h?.[speedVar];
    const dr = h?.wind_direction_10m;
    if (!isSpeedDirArray(sp) || !isSpeedDirArray(dr) || sp.length !== times.length || dr.length !== times.length) {
      return null;
    }
    const u: (number | null)[] = [];
    const v: (number | null)[] = [];
    for (let h2 = 0; h2 < times.length; h2++) {
      const s = sp[h2];
      const d = dr[h2];
      if (s === null || d === null) {
        u.push(null);
        v.push(null);
      } else {
        const uv = windUv(s, d);
        u.push(uv.u);
        v.push(uv.v);
      }
    }
    out.push({ lat: points[i].lat, lng: points[i].lng, u, v });
  }
  return { times: times as string[], points: out };
}

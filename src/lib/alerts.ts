/**
 * alerts.ts — Local-only personal weather-alert rules. Each rule is a
 * (location, metric, threshold, op) tuple stored in localStorage. The
 * forecast page checks rules client-side whenever a user views one of
 * the saved locations and shows an in-page banner if any rule fires.
 *
 * No backend, no push, no account. Privacy-first by design (mirrors the
 * favorites module).
 */

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const ALERTS_KEY = 'secid-mwx-alerts';
export const MAX_ALERTS = 24;

export type AlertMetric = 'rain' | 'temp_hi' | 'temp_lo' | 'wind';
export type AlertOp = '>' | '<';

export interface AlertRule {
  lat: number;
  lng: number;
  name: string;
  metric: AlertMetric;
  op: AlertOp;
  /** Threshold value in the metric's natural unit:
   *  rain → mm/h (precipitation_probability ≥ 50% AND precip ≥ threshold).
   *  temp_hi / temp_lo → °C (next 24h max/min).
   *  wind → km/h (gust > threshold). */
  threshold: number;
  createdAt: number;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function alertKey(rule: Pick<AlertRule, 'lat' | 'lng' | 'metric'>): string {
  return `${round3(rule.lat)},${round3(rule.lng)},${rule.metric}`;
}

function isAlertRule(v: unknown): v is AlertRule {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.lat === 'number' &&
    Number.isFinite(o.lat) &&
    typeof o.lng === 'number' &&
    Number.isFinite(o.lng) &&
    typeof o.name === 'string' &&
    (o.metric === 'rain' ||
      o.metric === 'temp_hi' ||
      o.metric === 'temp_lo' ||
      o.metric === 'wind') &&
    (o.op === '>' || o.op === '<') &&
    typeof o.threshold === 'number' &&
    Number.isFinite(o.threshold) &&
    typeof o.createdAt === 'number'
  );
}

export function load(storage: StorageLike): AlertRule[] {
  let raw: string | null;
  try {
    raw = storage.getItem(ALERTS_KEY);
  } catch {
    return [];
  }
  if (raw == null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isAlertRule);
}

function save(storage: StorageLike, rules: AlertRule[]): void {
  try {
    storage.setItem(ALERTS_KEY, JSON.stringify(rules));
  } catch {
    /* storage full or blocked — degrade silently */
  }
}

export function add(storage: StorageLike, rule: AlertRule): boolean {
  const rules = load(storage);
  if (rules.length >= MAX_ALERTS) return false;
  const k = alertKey(rule);
  if (rules.some((r) => alertKey(r) === k)) return false;
  rules.push(rule);
  save(storage, rules);
  return true;
}

export function remove(
  storage: StorageLike,
  lat: number,
  lng: number,
  metric: AlertMetric,
): boolean {
  const rules = load(storage);
  const k = alertKey({ lat, lng, metric });
  const next = rules.filter((r) => alertKey(r) !== k);
  if (next.length === rules.length) return false;
  save(storage, next);
  return true;
}

/** Return rules whose location matches the given coordinate (to 3 dp). */
export function forLocation(
  storage: StorageLike,
  lat: number,
  lng: number,
): AlertRule[] {
  const k = `${round3(lat)},${round3(lng)}`;
  return load(storage).filter((r) => `${round3(r.lat)},${round3(r.lng)}` === k);
}

/** Inputs to evaluate(): summary of the next 24h forecast at the location. */
export interface ForecastSummary {
  /** Max precipitation amount (mm/h) over the next 24h. */
  maxRainMmH: number;
  /** Max temperature (°C) over the next 24h. */
  maxTempC: number;
  /** Min temperature (°C) over the next 24h. */
  minTempC: number;
  /** Max wind/gust (km/h) over the next 24h. */
  maxWindKmh: number;
}

export interface FiredAlert {
  rule: AlertRule;
  /** The actual value that triggered the rule. */
  value: number;
}

/** Evaluate all rules for a location against a forecast summary. */
export function evaluate(
  rules: AlertRule[],
  fc: ForecastSummary,
): FiredAlert[] {
  const out: FiredAlert[] = [];
  for (const r of rules) {
    let v: number;
    switch (r.metric) {
      case 'rain':
        v = fc.maxRainMmH;
        break;
      case 'temp_hi':
        v = fc.maxTempC;
        break;
      case 'temp_lo':
        v = fc.minTempC;
        break;
      case 'wind':
        v = fc.maxWindKmh;
        break;
    }
    const fired = r.op === '>' ? v > r.threshold : v < r.threshold;
    if (fired) out.push({ rule: r, value: v });
  }
  return out;
}

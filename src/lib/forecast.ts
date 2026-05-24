// DOM-free Open-Meteo rich forecast SDK: current + hourly + daily.
// Reuses the shared retrying JSON requester and WMO mapping from weather.ts.

import {
  type RequestDeps,
  type RetryOptions,
  DEFAULT_RETRY,
  requestJsonWithRetry,
  describeWeatherCode,
} from './weather';

export interface ForecastLocation {
  lat: string | number;
  lng: string | number;
  tz?: string;
}

export interface CurrentWx {
  temperature: number | null;
  feelsLike: number | null;
  weatherCode: number | null;
  condition: string;
  precipProbability: number;
  windSpeed: number;
  windGusts: number;
  windDir: number;
  uvIndex: number;
  cloudCover: number;
  humidity: number;
  pressure: number | null;
  visibilityKm: number;
}

export interface HourWx {
  time: string;
  temperature: number | null;
  weatherCode: number | null;
  condition: string;
  precipProbability: number;
  windSpeed: number;
}

export interface DayWx {
  date: string;
  weatherCode: number | null;
  condition: string;
  tmax: number | null;
  tmin: number | null;
  precipProbabilityMax: number;
  uvMax: number;
  windMax: number;
  sunrise: string | null;
  sunset: string | null;
}

export interface Forecast {
  current: CurrentWx;
  hourly: HourWx[];
  daily: DayWx[];
}

/** Maximum number of hourly entries returned. */
export const HOURLY_LIMIT = 48;

const CURRENT_VARS = [
  'temperature_2m',
  'apparent_temperature',
  'weather_code',
  'precipitation_probability',
  'wind_speed_10m',
  'wind_gusts_10m',
  'wind_direction_10m',
  'uv_index',
  'cloud_cover',
  'relative_humidity_2m',
  'surface_pressure',
  'visibility',
].join(',');

const HOURLY_VARS = [
  'temperature_2m',
  'weather_code',
  'precipitation_probability',
  'wind_speed_10m',
].join(',');

const DAILY_VARS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_probability_max',
  'uv_index_max',
  'wind_speed_10m_max',
  'sunrise',
  'sunset',
].join(',');

/** Build the Open-Meteo forecast URL with current/hourly/daily variables. */
export function buildRichForecastUrl(loc: ForecastLocation): string {
  const params = new URLSearchParams({
    latitude: String(loc.lat),
    longitude: String(loc.lng),
    timezone: loc.tz || 'auto',
    forecast_days: '7',
    current: CURRENT_VARS,
    hourly: HOURLY_VARS,
    daily: DAILY_VARS,
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

const num = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;

// For ambiguous readings where 0 is a plausible real value (temperature,
// pressure): a missing/non-finite value becomes null rather than 0.
const numOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * Fetch and parse a full forecast (current conditions, next 48 hours, 7-day
 * outlook). Throws when the response lacks a `current` block.
 */
export async function getForecast(
  loc: ForecastLocation,
  deps: RequestDeps,
  retry: RetryOptions = DEFAULT_RETRY,
): Promise<Forecast> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await requestJsonWithRetry(
    buildRichForecastUrl(loc),
    deps,
    retry,
  );

  if (!data || !data.current) {
    throw new Error('Invalid forecast response: missing current');
  }

  const c = data.current;
  const cWc = numOrNull(c.weather_code);
  const current: CurrentWx = {
    temperature: numOrNull(c.temperature_2m),
    feelsLike: numOrNull(c.apparent_temperature),
    weatherCode: cWc,
    condition: cWc === null ? '—' : describeWeatherCode(cWc),
    precipProbability: num(c.precipitation_probability),
    windSpeed: num(c.wind_speed_10m),
    windGusts: num(c.wind_gusts_10m),
    windDir: num(c.wind_direction_10m),
    uvIndex: num(c.uv_index),
    cloudCover: num(c.cloud_cover),
    humidity: num(c.relative_humidity_2m),
    pressure: numOrNull(c.surface_pressure),
    // Open-Meteo visibility is in metres; show km with 1 decimal.
    visibilityKm: Math.round(num(c.visibility) / 100) / 10,
  };

  const h = data.hourly ?? {};
  const hTimes: unknown[] = Array.isArray(h.time) ? h.time : [];

  // Open-Meteo hourly.time starts at 00:00 *today* in the location's tz,
  // so without anchoring the strip would show 00:00→47h and mislabel idx 0
  // as "now". Anchor to the first hour at/after the current local hour.
  // The string compare is valid because current.time and hourly.time use
  // the same timezone and the same lexicographically-sortable
  // `YYYY-MM-DDTHH:mm` format, so comparing the `YYYY-MM-DDTHH` prefixes
  // orders them chronologically.
  const cHourPrefix =
    typeof c.time === 'string' ? (c.time as string).slice(0, 13) : '';
  let startIdx = 0;
  if (cHourPrefix) {
    const found = hTimes.findIndex(
      (t) => typeof t === 'string' && t.slice(0, 13) >= cHourPrefix,
    );
    if (found > 0) {
      startIdx = found;
    } else if (found === -1 && hTimes.length > HOURLY_LIMIT) {
      // No matching hour (e.g. current.time past the forecast window):
      // show the last HOURLY_LIMIT hours rather than the first.
      startIdx = Math.max(0, hTimes.length - HOURLY_LIMIT);
    }
    // found === 0: either the current hour is exactly the first slot (ideal), or the hourly array starts after current.time (API generation lag) — keeping startIdx 0 is the only sensible choice in both.
  }
  // No current.time → startIdx 0 (legacy behavior).

  const hourly: HourWx[] = hTimes
    .slice(startIdx, startIdx + HOURLY_LIMIT)
    .map((_, localIndex): HourWx => {
      const i = startIdx + localIndex;
      const code = numOrNull(h.weather_code?.[i]);
      return {
        time: str(h.time?.[i]),
        temperature: numOrNull(h.temperature_2m?.[i]),
        weatherCode: code,
        condition: code === null ? '—' : describeWeatherCode(code),
        precipProbability: num(h.precipitation_probability?.[i]),
        windSpeed: num(h.wind_speed_10m?.[i]),
      };
    });

  const d = data.daily ?? {};
  const dDates: unknown[] = Array.isArray(d.time) ? d.time : [];
  const daily: DayWx[] = dDates.map((_, i): DayWx => {
    const code = numOrNull(d.weather_code?.[i]);
    const sunrise = d.sunrise?.[i];
    const sunset = d.sunset?.[i];
    return {
      date: str(d.time?.[i]),
      weatherCode: code,
      condition: code === null ? '—' : describeWeatherCode(code),
      tmax: numOrNull(d.temperature_2m_max?.[i]),
      tmin: numOrNull(d.temperature_2m_min?.[i]),
      precipProbabilityMax: num(d.precipitation_probability_max?.[i]),
      uvMax: num(d.uv_index_max?.[i]),
      windMax: num(d.wind_speed_10m_max?.[i]),
      sunrise: typeof sunrise === 'string' ? sunrise : null,
      sunset: typeof sunset === 'string' ? sunset : null,
    };
  });

  return { current, hourly, daily };
}

export type UvLevel = 'bajo' | 'moderado' | 'alto' | 'muy alto' | 'extremo';

/** Classify a UV index into a rounded value + Spanish risk level. */
export function uvLabel(uv: number): { value: number; level: UvLevel } {
  const value = Math.round(uv);
  let level: UvLevel;
  if (value <= 2) level = 'bajo';
  else if (value <= 5) level = 'moderado';
  else if (value <= 7) level = 'alto';
  else if (value <= 10) level = 'muy alto';
  else level = 'extremo';
  return { value, level };
}

const WIND_LABELS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'] as const;
// Arrows point where the wind is going (from-direction rotated 180°).
const WIND_ARROWS = ['↓', '↙', '←', '↖', '↑', '↗', '→', '↘'] as const;

/**
 * Map a wind direction (degrees the wind comes *from*) to an 8-point Spanish
 * label and an arrow pointing where the wind is travelling.
 */
export function windDir(deg: number): { label: string; arrow: string } {
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return { label: WIND_LABELS[idx], arrow: WIND_ARROWS[idx] };
}

/**
 * Multi-model forecast disagreement. Open-Meteo accepts a `models=` query
 * param naming any combination of national/global NWP models; when passed
 * multiple values the response surfaces variables suffixed with each model
 * name (e.g. `temperature_2m_icon_seamless`). We probe ICON (DWD), GFS
 * (NOAA), ECMWF and JMA — four independently-produced operational global
 * models. Returns the per-model temperatures and the spread (max − min).
 */
export const DISAGREEMENT_MODELS = [
  'icon_seamless',
  'gfs_seamless',
  'ecmwf_ifs04',
  'jma_seamless',
] as const;
export type DisagreementModel = (typeof DISAGREEMENT_MODELS)[number];

export interface ModelDisagreement {
  /** Temperature (°C) predicted by each model for the current hour; null
   *  when the model has no value for the location. */
  byModel: Record<DisagreementModel, number | null>;
  /** Max − min across models that returned a value; null if fewer than 2. */
  spread: number | null;
}

export function buildDisagreementUrl(loc: ForecastLocation): string {
  const params = new URLSearchParams({
    latitude: String(loc.lat),
    longitude: String(loc.lng),
    timezone: loc.tz || 'auto',
    forecast_days: '1',
    current: 'temperature_2m',
    models: DISAGREEMENT_MODELS.join(','),
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

/**
 * Climate-anomaly summary for a single location: today's forecast Tmax
 * vs. the 10-year mean Tmax for the same day-of-year, pulled from
 * Open-Meteo's free archive API (ERA5-Land, keyless, CORS).
 *
 * Returns the anomaly in °C (positive = warmer than usual). Null when
 * the archive doesn't have data for the location or DOY.
 */
export interface ClimateAnomaly {
  /** Forecast Tmax (°C) for today at the location. */
  forecastTmax: number;
  /** 10-year mean Tmax (°C) for the same day-of-year. */
  baselineTmax: number;
  /** forecastTmax − baselineTmax (°C). */
  anomalyC: number;
  /** Number of years included in the baseline (≤ 10). */
  yearsUsed: number;
}

export function buildArchiveDoyUrl(
  loc: ForecastLocation,
  monthDay: string,
): string {
  // monthDay is "MM-DD". We fetch the same DOY for the last 10 years.
  const now = new Date();
  const thisYear = now.getUTCFullYear();
  const start = `${thisYear - 11}-${monthDay}`;
  // Use last year (thisYear-1) as the end — current year may not yet be
  // in the archive for the future date.
  const end = `${thisYear - 1}-${monthDay}`;
  const params = new URLSearchParams({
    latitude: String(loc.lat),
    longitude: String(loc.lng),
    start_date: start,
    end_date: end,
    daily: 'temperature_2m_max',
    timezone: loc.tz || 'UTC',
  });
  return `https://archive-api.open-meteo.com/v1/archive?${params.toString()}`;
}

export async function getClimateAnomaly(
  loc: ForecastLocation,
  forecastTmax: number,
  monthDay: string,
  deps: RequestDeps,
  retry: RetryOptions = DEFAULT_RETRY,
): Promise<ClimateAnomaly | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await requestJsonWithRetry(
    buildArchiveDoyUrl(loc, monthDay),
    deps,
    retry,
  );
  const dailyTimes: unknown[] = Array.isArray(data?.daily?.time)
    ? data.daily.time
    : [];
  const tmaxArr: unknown[] = Array.isArray(data?.daily?.temperature_2m_max)
    ? data.daily.temperature_2m_max
    : [];
  // Filter to entries matching the requested month-day (defensive — the
  // archive sometimes returns adjacent days for short ranges).
  const samples: number[] = [];
  for (let i = 0; i < dailyTimes.length; i++) {
    const t = dailyTimes[i];
    const v = tmaxArr[i];
    if (
      typeof t === 'string' &&
      t.endsWith(`-${monthDay}`) &&
      typeof v === 'number' &&
      Number.isFinite(v)
    ) {
      samples.push(v);
    }
  }
  if (samples.length === 0) return null;
  const baselineTmax =
    samples.reduce((a, b) => a + b, 0) / samples.length;
  return {
    forecastTmax,
    baselineTmax,
    anomalyC: forecastTmax - baselineTmax,
    yearsUsed: samples.length,
  };
}

export async function getModelDisagreement(
  loc: ForecastLocation,
  deps: RequestDeps,
  retry: RetryOptions = DEFAULT_RETRY,
): Promise<ModelDisagreement> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await requestJsonWithRetry(
    buildDisagreementUrl(loc),
    deps,
    retry,
  );
  const cur = data?.current ?? {};
  const byModel: Record<DisagreementModel, number | null> = {
    icon_seamless: null,
    gfs_seamless: null,
    ecmwf_ifs04: null,
    jma_seamless: null,
  };
  for (const m of DISAGREEMENT_MODELS) {
    const v = cur[`temperature_2m_${m}`];
    if (typeof v === 'number' && Number.isFinite(v)) byModel[m] = v;
  }
  const vals = Object.values(byModel).filter(
    (v): v is number => v !== null,
  );
  const spread =
    vals.length >= 2 ? Math.max(...vals) - Math.min(...vals) : null;
  return { byModel, spread };
}

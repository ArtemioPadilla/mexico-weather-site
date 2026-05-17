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
  temperature: number;
  feelsLike: number;
  weatherCode: number;
  condition: string;
  precipProbability: number;
  windSpeed: number;
  windGusts: number;
  windDir: number;
  uvIndex: number;
  cloudCover: number;
  humidity: number;
  pressure: number;
  visibilityKm: number;
}

export interface HourWx {
  time: string;
  temperature: number;
  weatherCode: number;
  condition: string;
  precipProbability: number;
  windSpeed: number;
}

export interface DayWx {
  date: string;
  weatherCode: number;
  condition: string;
  tmax: number;
  tmin: number;
  precipProbabilityMax: number;
  uvMax: number;
  windMax: number;
  sunrise: string;
  sunset: string;
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
  const current: CurrentWx = {
    temperature: num(c.temperature_2m),
    feelsLike: num(c.apparent_temperature),
    weatherCode: num(c.weather_code),
    condition: describeWeatherCode(num(c.weather_code)),
    precipProbability: num(c.precipitation_probability),
    windSpeed: num(c.wind_speed_10m),
    windGusts: num(c.wind_gusts_10m),
    windDir: num(c.wind_direction_10m),
    uvIndex: num(c.uv_index),
    cloudCover: num(c.cloud_cover),
    humidity: num(c.relative_humidity_2m),
    pressure: num(c.surface_pressure),
    visibilityKm: Math.round(num(c.visibility) / 100) / 10,
  };

  const h = data.hourly ?? {};
  const hTimes: unknown[] = Array.isArray(h.time) ? h.time : [];
  const hourly: HourWx[] = hTimes
    .slice(0, HOURLY_LIMIT)
    .map((_, i): HourWx => {
      const code = num(h.weather_code?.[i]);
      return {
        time: str(h.time?.[i]),
        temperature: num(h.temperature_2m?.[i]),
        weatherCode: code,
        condition: describeWeatherCode(code),
        precipProbability: num(h.precipitation_probability?.[i]),
        windSpeed: num(h.wind_speed_10m?.[i]),
      };
    });

  const d = data.daily ?? {};
  const dDates: unknown[] = Array.isArray(d.time) ? d.time : [];
  const daily: DayWx[] = dDates.map((_, i): DayWx => {
    const code = num(d.weather_code?.[i]);
    return {
      date: str(d.time?.[i]),
      weatherCode: code,
      condition: describeWeatherCode(code),
      tmax: num(d.temperature_2m_max?.[i]),
      tmin: num(d.temperature_2m_min?.[i]),
      precipProbabilityMax: num(d.precipitation_probability_max?.[i]),
      uvMax: num(d.uv_index_max?.[i]),
      windMax: num(d.wind_speed_10m_max?.[i]),
      sunrise: str(d.sunrise?.[i]),
      sunset: str(d.sunset?.[i]),
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

import { describe, it, expect, vi } from 'vitest';
import {
  buildRichForecastUrl,
  getForecast,
  HOURLY_LIMIT,
  uvLabel,
  windDir,
} from './forecast';

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Response;
}

const loc = { lat: 19.43, lng: -99.13, tz: 'America/Mexico_City' };

function makeHours(n: number) {
  const time: string[] = [];
  const t2m: number[] = [];
  const wc: number[] = [];
  const pp: number[] = [];
  const ws: number[] = [];
  for (let i = 0; i < n; i++) {
    time.push(`2026-05-16T${String(i % 24).padStart(2, '0')}:00`);
    t2m.push(20 + i);
    wc.push(2);
    pp.push(10);
    ws.push(5);
  }
  return {
    time,
    temperature_2m: t2m,
    weather_code: wc,
    precipitation_probability: pp,
    wind_speed_10m: ws,
  };
}

function fullPayload(hourCount = 72) {
  return {
    current: {
      temperature_2m: 24.6,
      apparent_temperature: 25.1,
      weather_code: 3,
      precipitation_probability: 30,
      wind_speed_10m: 12.4,
      wind_gusts_10m: 22.2,
      wind_direction_10m: 225,
      uv_index: 6.3,
      cloud_cover: 75,
      relative_humidity_2m: 60,
      surface_pressure: 1013.2,
      visibility: 24000,
    },
    hourly: makeHours(hourCount),
    daily: {
      time: ['2026-05-16', '2026-05-17'],
      weather_code: [3, 61],
      temperature_2m_max: [28, 26],
      temperature_2m_min: [14, 13],
      precipitation_probability_max: [30, 80],
      uv_index_max: [7, 5],
      wind_speed_10m_max: [18, 20],
      sunrise: ['2026-05-16T06:10', '2026-05-17T06:09'],
      sunset: ['2026-05-16T20:01', '2026-05-17T20:02'],
    },
  };
}

describe('buildRichForecastUrl', () => {
  it('builds the forecast URL with all variable groups', () => {
    const url = buildRichForecastUrl(loc);
    const parsed = new URL(url);
    expect(`${parsed.origin}${parsed.pathname}`).toBe(
      'https://api.open-meteo.com/v1/forecast',
    );
    expect(parsed.searchParams.get('latitude')).toBe('19.43');
    expect(parsed.searchParams.get('longitude')).toBe('-99.13');
    expect(parsed.searchParams.get('timezone')).toBe('America/Mexico_City');
    expect(parsed.searchParams.get('forecast_days')).toBe('7');

    const current = parsed.searchParams.get('current') ?? '';
    for (const v of [
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
    ]) {
      expect(current.split(',')).toContain(v);
    }

    const hourly = parsed.searchParams.get('hourly') ?? '';
    for (const v of [
      'temperature_2m',
      'weather_code',
      'precipitation_probability',
      'wind_speed_10m',
    ]) {
      expect(hourly.split(',')).toContain(v);
    }

    const daily = parsed.searchParams.get('daily') ?? '';
    for (const v of [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_probability_max',
      'uv_index_max',
      'wind_speed_10m_max',
      'sunrise',
      'sunset',
    ]) {
      expect(daily.split(',')).toContain(v);
    }
  });

  it("defaults timezone to 'auto' when loc.tz is absent", () => {
    const url = buildRichForecastUrl({ lat: 1, lng: 2 });
    expect(new URL(url).searchParams.get('timezone')).toBe('auto');
  });
});

describe('getForecast', () => {
  it('parses current / hourly / daily blocks', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(fullPayload(72)));
    const fc = await getForecast(loc, {
      fetch: fetchMock as unknown as typeof fetch,
      sleep: async () => {},
    });

    expect(fc.current).toEqual({
      temperature: 24.6,
      feelsLike: 25.1,
      weatherCode: 3,
      condition: 'Nublado ☁️',
      precipProbability: 30,
      windSpeed: 12.4,
      windGusts: 22.2,
      windDir: 225,
      uvIndex: 6.3,
      cloudCover: 75,
      humidity: 60,
      pressure: 1013.2,
      visibilityKm: 24,
    });

    expect(fc.hourly[0]).toEqual({
      time: '2026-05-16T00:00',
      temperature: 20,
      weatherCode: 2,
      condition: 'Parcialmente nublado ⛅',
      precipProbability: 10,
      windSpeed: 5,
    });

    expect(fc.daily[1]).toEqual({
      date: '2026-05-17',
      weatherCode: 61,
      condition: 'Lluvia 🌧️',
      tmax: 26,
      tmin: 13,
      precipProbabilityMax: 80,
      uvMax: 5,
      windMax: 20,
      sunrise: '2026-05-17T06:09',
      sunset: '2026-05-17T20:02',
    });
  });

  it('truncates hourly to HOURLY_LIMIT (48)', async () => {
    expect(HOURLY_LIMIT).toBe(48);
    const fetchMock = vi.fn(async () => jsonResponse(fullPayload(168)));
    const fc = await getForecast(loc, {
      fetch: fetchMock as unknown as typeof fetch,
      sleep: async () => {},
    });
    expect(fc.hourly.length).toBe(48);
  });

  it('throws when current is missing', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ hourly: makeHours(1), daily: {} }),
    );
    await expect(
      getForecast(loc, {
        fetch: fetchMock as unknown as typeof fetch,
        sleep: async () => {},
      }),
    ).rejects.toThrow('Invalid forecast response: missing current');
  });
});

describe('uvLabel', () => {
  it('classifies UV index thresholds', () => {
    expect(uvLabel(1)).toEqual({ value: 1, level: 'bajo' });
    expect(uvLabel(2)).toEqual({ value: 2, level: 'bajo' });
    expect(uvLabel(4)).toEqual({ value: 4, level: 'moderado' });
    expect(uvLabel(5)).toEqual({ value: 5, level: 'moderado' });
    expect(uvLabel(6)).toEqual({ value: 6, level: 'alto' });
    expect(uvLabel(7)).toEqual({ value: 7, level: 'alto' });
    expect(uvLabel(9)).toEqual({ value: 9, level: 'muy alto' });
    expect(uvLabel(10)).toEqual({ value: 10, level: 'muy alto' });
    expect(uvLabel(11)).toEqual({ value: 11, level: 'extremo' });
  });

  it('rounds the value', () => {
    expect(uvLabel(6.6).value).toBe(7);
    expect(uvLabel(7.4)).toEqual({ value: 7, level: 'alto' });
  });
});

describe('windDir', () => {
  it('maps degrees to 8-point label + wind-travel arrow', () => {
    expect(windDir(0)).toEqual({ label: 'N', arrow: '↓' });
    expect(windDir(225)).toEqual({ label: 'SO', arrow: '↗' });
    expect(windDir(360)).toEqual({ label: 'N', arrow: '↓' });
  });

  it('normalizes negative and out-of-range degrees', () => {
    expect(windDir(-45)).toEqual({ label: 'NO', arrow: '↘' });
    expect(windDir(450)).toEqual({ label: 'E', arrow: '←' });
  });
});

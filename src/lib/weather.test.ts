import { describe, it, expect, vi } from 'vitest';
import {
  fetchWeather,
  parseForecast,
  describeWeatherCode,
  parseRetryAfter,
  backoffDelay,
  buildForecastUrl,
  WMO,
} from './weather';

function dailyPayload(over: Record<string, unknown[]> = {}) {
  return {
    daily: {
      temperature_2m_max: [28],
      temperature_2m_min: [14],
      precipitation_probability_max: [40],
      weathercode: [2],
      ...over,
    },
  };
}

function jsonResponse(body: unknown, init: Partial<Response> = {}): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
    ...init,
  } as unknown as Response;
}

// Sleep stub that records delays and resolves immediately (deterministic/fast).
function makeSleep() {
  const delays: number[] = [];
  const sleep = (ms: number) => {
    delays.push(ms);
    return Promise.resolve();
  };
  return { sleep, delays };
}

describe('WMO mapping', () => {
  it('maps known codes to Spanish text + emoji', () => {
    expect(describeWeatherCode(0)).toBe('Despejado ☀️');
    expect(describeWeatherCode(2)).toBe('Parcialmente nublado ⛅');
    expect(describeWeatherCode('95')).toBe('Tormenta ⛈️');
    expect(WMO['65']).toBe('Lluvia intensa 🌧️');
  });

  it('falls back to em-dash for unknown codes', () => {
    expect(describeWeatherCode(123)).toBe('—');
  });
});

describe('buildForecastUrl', () => {
  it('builds the Open-Meteo URL with expected params', () => {
    const url = buildForecastUrl({ lat: 19.43, lng: -99.13 });
    expect(url).toContain('https://api.open-meteo.com/v1/forecast');
    expect(url).toContain('latitude=19.43');
    expect(url).toContain('longitude=-99.13');
    expect(url).toContain(
      'daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode',
    );
    expect(url).toContain('timezone=America/Mexico_City');
    expect(url).toContain('forecast_days=1');
    expect(url).toContain('models=best_match');
  });

  it('honors a custom timezone', () => {
    expect(buildForecastUrl({ lat: 1, lng: 2, tz: 'UTC' })).toContain(
      'timezone=UTC',
    );
  });
});

describe('parseForecast', () => {
  it('parses a valid payload', () => {
    expect(parseForecast(dailyPayload())).toEqual({
      tmax: 28,
      tmin: 14,
      rain: 40,
      condition: 'Parcialmente nublado ⛅',
    });
  });

  it('throws when daily is missing', () => {
    expect(() => parseForecast({})).toThrow('Invalid weather response');
    expect(() => parseForecast(null)).toThrow('Invalid weather response');
  });

  it('throws when a required field is missing', () => {
    expect(() =>
      parseForecast(dailyPayload({ weathercode: [] })),
    ).toThrow('Missing weather fields');
    expect(() =>
      parseForecast(dailyPayload({ temperature_2m_max: [null as unknown as number] })),
    ).toThrow('Missing weather fields');
  });
});

describe('parseRetryAfter', () => {
  it('parses delta-seconds', () => {
    expect(parseRetryAfter('5')).toBe(5000);
    expect(parseRetryAfter(' 12 ')).toBe(12000);
  });

  it('parses HTTP-date relative to now', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    expect(
      parseRetryAfter('Thu, 01 Jan 2026 00:00:30 GMT', now),
    ).toBe(30000);
  });

  it('clamps a past HTTP-date to 0', () => {
    expect(
      parseRetryAfter(
        'Wed, 01 Jan 2020 00:00:00 GMT',
        Date.parse('2020-01-01T00:00:00Z') + 5000,
      ),
    ).toBe(0);
  });

  it('returns null for absent/invalid values', () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter(undefined)).toBeNull();
    expect(parseRetryAfter('')).toBeNull();
    expect(parseRetryAfter('not-a-date')).toBeNull();
  });
});

describe('backoffDelay', () => {
  const opts = { attempts: 3, baseDelayMs: 500, factor: 2, maxDelayMs: 10000 };

  it('applies full jitter and grows exponentially', () => {
    // random() = 1 -> full value (rounded)
    expect(backoffDelay(0, opts, () => 1)).toBe(500);
    expect(backoffDelay(1, opts, () => 1)).toBe(1000);
    expect(backoffDelay(2, opts, () => 1)).toBe(2000);
    // random() = 0 -> zero delay (full jitter floor)
    expect(backoffDelay(2, opts, () => 0)).toBe(0);
  });

  it('caps the delay at maxDelayMs', () => {
    expect(backoffDelay(20, opts, () => 1)).toBe(10000);
  });
});

describe('fetchWeather', () => {
  const loc = { lat: 19.43, lng: -99.13 };

  it('returns parsed weather on success (no retries)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(dailyPayload()));
    const { sleep, delays } = makeSleep();

    const result = await fetchWeather(loc, {
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
    });

    expect(result).toEqual({
      tmax: 28,
      tmin: 14,
      rain: 40,
      condition: 'Parcialmente nublado ⛅',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });

  it('retries after a failure then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(jsonResponse(dailyPayload()));
    const { sleep, delays } = makeSleep();

    const result = await fetchWeather(
      loc,
      { fetch: fetchMock as unknown as typeof fetch, sleep, random: () => 1 },
      { baseDelayMs: 500 },
    );

    expect(result.tmax).toBe(28);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(delays).toEqual([500]); // one backoff between the 2 attempts
  });

  it('throws after exhausting all attempts', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('persistent failure');
    });
    const { sleep, delays } = makeSleep();

    await expect(
      fetchWeather(
        loc,
        { fetch: fetchMock as unknown as typeof fetch, sleep, random: () => 1 },
        { attempts: 3, baseDelayMs: 500 },
      ),
    ).rejects.toThrow('persistent failure');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    // 2 backoffs between 3 attempts; no sleep after the final attempt.
    expect(delays).toEqual([500, 1000]);
  });

  it('throws immediately with attempts: 1 (no sleep)', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    const { sleep, delays } = makeSleep();

    await expect(
      fetchWeather(
        loc,
        { fetch: fetchMock as unknown as typeof fetch, sleep, random: () => 1 },
        { attempts: 1 },
      ),
    ).rejects.toThrow('network down');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });

  it('honors Retry-After on HTTP 429', async () => {
    const rateLimited = {
      ok: false,
      status: 429,
      headers: { get: (h: string) => (h === 'Retry-After' ? '7' : null) },
      json: async () => ({}),
    } as unknown as Response;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rateLimited)
      .mockResolvedValueOnce(jsonResponse(dailyPayload()));
    const { sleep, delays } = makeSleep();

    const result = await fetchWeather(loc, {
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
      random: () => 1,
    });

    expect(result.rain).toBe(40);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Retry-After (7s) is honored instead of exponential backoff.
    expect(delays).toEqual([7000]);
  });

  it('falls back to backoff on 429 without Retry-After', async () => {
    const rateLimited = {
      ok: false,
      status: 429,
      headers: { get: () => null },
      json: async () => ({}),
    } as unknown as Response;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rateLimited)
      .mockResolvedValueOnce(jsonResponse(dailyPayload()));
    const { sleep, delays } = makeSleep();

    await fetchWeather(
      loc,
      { fetch: fetchMock as unknown as typeof fetch, sleep, random: () => 1 },
      { baseDelayMs: 500 },
    );

    expect(delays).toEqual([500]);
  });

  it('retries on non-ok HTTP status', async () => {
    const serverError = {
      ok: false,
      status: 503,
      headers: { get: () => null },
      json: async () => ({}),
    } as unknown as Response;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(serverError)
      .mockResolvedValueOnce(jsonResponse(dailyPayload()));
    const { sleep, delays } = makeSleep();

    const result = await fetchWeather(loc, {
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
      random: () => 0.5,
    });

    expect(result.tmin).toBe(14);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // One backoff sleep occurred before the retry.
    expect(delays.length).toBe(1);
  });

  it('throws on invalid payload (after retries exhausted)', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(dailyPayload({ weathercode: [] })),
    );
    const { sleep } = makeSleep();

    await expect(
      fetchWeather(
        loc,
        { fetch: fetchMock as unknown as typeof fetch, sleep, random: () => 1 },
        { attempts: 2 },
      ),
    ).rejects.toThrow('Missing weather fields');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

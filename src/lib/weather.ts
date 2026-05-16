// Pure, DOM-free weather fetching logic for the Mexico weather site.
// Extracted so it can be unit-tested (issues #3 and #8).

/** WMO weather interpretation codes mapped to Spanish text + emoji. */
export const WMO: Record<string, string> = {
  '0': 'Despejado ☀️',
  '1': 'Despejado ☀️',
  '2': 'Parcialmente nublado ⛅',
  '3': 'Nublado ☁️',
  '45': 'Niebla 🌫️',
  '48': 'Niebla 🌫️',
  '51': 'Llovizna 🌦️',
  '53': 'Llovizna 🌦️',
  '55': 'Llovizna 🌦️',
  '61': 'Lluvia 🌧️',
  '63': 'Lluvia 🌧️',
  '65': 'Lluvia intensa 🌧️',
  '71': 'Nieve 🌨️',
  '73': 'Nieve 🌨️',
  '75': 'Nieve intensa 🌨️',
  '80': 'Chubascos 🌩️',
  '81': 'Chubascos 🌩️',
  '82': 'Tormenta ⛈️',
  '95': 'Tormenta ⛈️',
  '96': 'Tormenta con granizo ⛈️',
  '99': 'Tormenta con granizo ⛈️',
};

/** Map a WMO weather code to a human-readable Spanish label + emoji. */
export function describeWeatherCode(code: number | string): string {
  return WMO[String(code)] || '—';
}

export interface Weather {
  tmax: number;
  tmin: number;
  rain: number;
  condition: string;
}

export interface WeatherLocation {
  lat: string | number;
  lng: string | number;
  tz?: string;
}

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default 3. */
  attempts?: number;
  /** Base delay in ms for exponential backoff. Default 500. */
  baseDelayMs?: number;
  /** Exponential growth factor. Default 2. */
  factor?: number;
  /** Maximum delay cap in ms. Default 10000. */
  maxDelayMs?: number;
}

export interface FetchWeatherDeps {
  fetch: typeof fetch;
  /** Sleep function (injectable for deterministic tests). */
  sleep?: (ms: number) => Promise<void>;
  /** Random source in [0, 1) for jitter (injectable for tests). */
  random?: () => number;
}

const DEFAULT_RETRY: Required<RetryOptions> = {
  attempts: 3,
  baseDelayMs: 500,
  factor: 2,
  maxDelayMs: 10000,
};

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Build the Open-Meteo forecast URL (unchanged from the original inline script). */
export function buildForecastUrl(loc: WeatherLocation): string {
  const tz = loc.tz || 'America/Mexico_City';
  return `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode&timezone=${tz}&forecast_days=1&models=best_match`;
}

/**
 * Parse and validate an Open-Meteo daily forecast payload into a Weather object.
 * Throws if required fields are missing.
 */
export function parseForecast(data: unknown): Weather {
  const daily = (data as { daily?: Record<string, unknown[]> } | null)?.daily;
  if (!daily) throw new Error('Invalid weather response');

  const tmax = daily.temperature_2m_max?.[0];
  const tmin = daily.temperature_2m_min?.[0];
  const rain = daily.precipitation_probability_max?.[0];
  const weatherCode = daily.weathercode?.[0];

  if (tmax == null || tmin == null || rain == null || weatherCode == null) {
    throw new Error('Missing weather fields');
  }

  return {
    tmax: tmax as number,
    tmin: tmin as number,
    rain: rain as number,
    condition: describeWeatherCode(weatherCode as number),
  };
}

/**
 * Compute the backoff delay for a given (zero-based) attempt index using
 * exponential backoff with full jitter, capped at maxDelayMs.
 */
export function backoffDelay(
  attemptIndex: number,
  opts: Required<RetryOptions>,
  random: () => number,
): number {
  const exp = opts.baseDelayMs * Math.pow(opts.factor, attemptIndex);
  const capped = Math.min(exp, opts.maxDelayMs);
  // Full jitter: random value between 0 and capped.
  return Math.round(random() * capped);
}

/**
 * Parse a Retry-After header value (delta-seconds or HTTP-date) into ms.
 * Returns null when the header is absent or unparseable.
 */
export function parseRetryAfter(
  value: string | null | undefined,
  now: number = Date.now(),
): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;

  // delta-seconds form
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10) * 1000;
  }

  // HTTP-date form
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - now);
  }

  return null;
}

/**
 * Fetch + parse a city's weather with retry, exponential backoff + full
 * jitter, and graceful HTTP 429 handling. Throws after exhausting attempts.
 */
export async function fetchWeather(
  loc: WeatherLocation,
  deps: FetchWeatherDeps,
  retryOptions: RetryOptions = {},
): Promise<Weather> {
  const opts: Required<RetryOptions> = { ...DEFAULT_RETRY, ...retryOptions };
  const sleep = deps.sleep ?? defaultSleep;
  const random = deps.random ?? Math.random;
  const url = buildForecastUrl(loc);

  let lastError: unknown;

  for (let attempt = 0; attempt < opts.attempts; attempt++) {
    let retryAfterMs: number | null = null;
    try {
      const response = await deps.fetch(url, { cache: 'no-store' });

      if (response.status === 429) {
        retryAfterMs = parseRetryAfter(response.headers?.get?.('Retry-After'));
        throw new Error('Rate limited (HTTP 429)');
      }
      if (!response.ok) {
        throw new Error(`Weather request failed (HTTP ${response.status})`);
      }

      const data = await response.json();
      return parseForecast(data);
    } catch (err) {
      lastError = err;
      const isLastAttempt = attempt === opts.attempts - 1;
      if (isLastAttempt) break;

      // Honor Retry-After on 429 when present, otherwise exponential backoff.
      const delay =
        retryAfterMs != null
          ? retryAfterMs
          : backoffDelay(attempt, opts, random);
      await sleep(delay);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Weather fetch failed');
}

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

/** Same codes, English labels (Story i18n). Mirrors WMO; any code
 *  added there should be added here too. */
export const WMO_EN: Record<string, string> = {
  '0': 'Clear ☀️',
  '1': 'Mostly clear ☀️',
  '2': 'Partly cloudy ⛅',
  '3': 'Overcast ☁️',
  '45': 'Fog 🌫️',
  '48': 'Fog 🌫️',
  '51': 'Drizzle 🌦️',
  '53': 'Drizzle 🌦️',
  '55': 'Drizzle 🌦️',
  '61': 'Rain 🌧️',
  '63': 'Rain 🌧️',
  '65': 'Heavy rain 🌧️',
  '71': 'Snow 🌨️',
  '73': 'Snow 🌨️',
  '75': 'Heavy snow 🌨️',
  '80': 'Showers 🌩️',
  '81': 'Showers 🌩️',
  '82': 'Thunderstorm ⛈️',
  '95': 'Thunderstorm ⛈️',
  '96': 'Thunderstorm with hail ⛈️',
  '99': 'Thunderstorm with hail ⛈️',
};

/** Reverse map: Spanish label → numeric WMO code. Used at runtime
 *  by the i18n layer to translate condition strings that were
 *  baked into JSON snapshots at build time (e.g., the city-forecast
 *  snapshot stores 'Despejado'; the EN client looks it up here). */
export const WMO_LABEL_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(WMO).map(([code, label]) => [label, code]),
);

/** Map a WMO weather code to a human-readable label + emoji.
 *  Defaults to Spanish; pass lang='en' for English. */
export function describeWeatherCode(
  code: number | string,
  lang: 'es' | 'en' = 'es',
): string {
  const table = lang === 'en' ? WMO_EN : WMO;
  return table[String(code)] || '—';
}

/** Translate a baked Spanish condition string (e.g., from a JSON
 *  snapshot) to English by reverse-looking-up its WMO code. Returns
 *  the original string when no match. */
export function translateCondition(label: string, lang: 'es' | 'en'): string {
  if (lang === 'es') return label;
  const code = WMO_LABEL_TO_CODE[label];
  if (code) return WMO_EN[code] ?? label;
  // Fallback: dictionary of strings used in build-city-forecasts.py
  // and elsewhere that may not exactly match WMO[] above.
  const extras: Record<string, string> = {
    '—': '—',
    'Mayormente despejado': 'Mostly clear',
    'Llovizna ligera': 'Light drizzle',
    'Llovizna intensa': 'Heavy drizzle',
    'Lluvia ligera': 'Light rain',
    'Nevada ligera': 'Light snow',
    'Nevada': 'Snow',
    'Nevada intensa': 'Heavy snow',
    'Chubascos intensos': 'Heavy showers',
    'Chubascos violentos': 'Violent showers',
    'Tormenta': 'Thunderstorm',
    'Tormenta con granizo': 'Thunderstorm with hail',
    'Tormenta severa': 'Severe thunderstorm',
    'Niebla con escarcha': 'Freezing fog',
  };
  return extras[label] ?? label;
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

/**
 * Injectable dependencies for the generic retrying JSON requester. Shared by
 * the weather, geocode and forecast SDKs so the retry/backoff logic lives in
 * exactly one place.
 */
export interface RequestDeps {
  fetch: typeof fetch;
  /** Sleep function (injectable for deterministic tests). */
  sleep?: (ms: number) => Promise<void>;
  /** Random source in [0, 1) for jitter (injectable for tests). */
  random?: () => number;
}

export const DEFAULT_RETRY: Required<RetryOptions> = {
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
 * Generic fetch-with-retry helper: retry with exponential backoff + full
 * jitter and graceful HTTP 429 handling, returning the parsed JSON body.
 *
 * Retry semantics (identical to the original inline fetchWeather loop):
 *  - status 429: last attempt -> throw 'Rate limited (HTTP 429)', else sleep
 *    `parseRetryAfter(header, Date.now()) ?? backoffDelay(...)` and continue.
 *  - !res.ok: last attempt -> throw 'Request failed (HTTP <status>)', else
 *    sleep `backoffDelay(...)` and continue.
 *  - thrown fetch error: last attempt -> rethrow, else sleep backoff.
 *  - success -> `return parse(res.json()) as T` (or `res.json() as T` when no
 *    `parse` callback is supplied). A throw from `parse` is caught by the same
 *    retry loop as any other error, so payload validation stays inside it.
 */
export async function requestJsonWithRetry<T = unknown>(
  url: string,
  deps: RequestDeps,
  retry: RetryOptions = DEFAULT_RETRY,
  parse?: (raw: unknown) => T,
): Promise<T> {
  const opts: Required<RetryOptions> = { ...DEFAULT_RETRY, ...retry };
  const sleep = deps.sleep ?? defaultSleep;
  const random = deps.random ?? Math.random;

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
        throw new Error(`Request failed (HTTP ${response.status})`);
      }

      const raw = await response.json();
      return parse ? parse(raw) : (raw as T);
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
    : new Error('Request failed');
}

/**
 * Fetch + parse a city's weather with retry, exponential backoff + full
 * jitter, and graceful HTTP 429 handling. Throws after exhausting attempts.
 */
export async function fetchWeather(
  loc: WeatherLocation,
  deps: RequestDeps,
  retryOptions: RetryOptions = {},
): Promise<Weather> {
  // parseForecast runs inside the retry loop (via the parse callback), so an
  // invalid payload is retried exactly like any other error.
  return requestJsonWithRetry<Weather>(
    buildForecastUrl(loc),
    deps,
    { ...DEFAULT_RETRY, ...retryOptions },
    parseForecast,
  );
}

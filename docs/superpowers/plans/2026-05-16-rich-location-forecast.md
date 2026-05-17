# Rich Location Forecast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the static Mexico weather site into a search-driven app with any-location lookup and a rich current / 48h-hourly / 7-day forecast (temp, wind, UV, sky & air), staying 100% static on GitHub Pages with no new runtime dependencies.

**Architecture:** A pure, DOM-free, testable client SDK (`src/lib/`) wraps Open-Meteo geocoding + forecast and reuses the retry/backoff/429 logic from PR #19. The overview page (`index.astro`) keeps preset cards but adds search + geolocation + inline "quick peek". A new client-rendered, shareable page `forecast.astro` reads `?lat=&lng=&name=&tz=` and renders the full forecast. Vanilla TS via the repo's bundled-`<script>` pattern; no island framework.

**Tech Stack:** Astro 4 (static), TypeScript (strict), Tailwind, Vitest. APIs: `geocoding-api.open-meteo.com`, `api.open-meteo.com` (free, keyless, CORS-enabled).

---

## Prerequisites & sequencing

- **Base branch:** This work depends on PR #19 (`src/lib/weather.ts` retry SDK) and PR #20 (`src/data/cities.ts`, `src/i18n/`). The implementation branch MUST be created from a base that already contains both. If #19/#20 are merged to `main`, branch from `main`; otherwise branch from the #19 branch and rebase. **Do not start until that base is confirmed** — the first task verifies it.
- **Supersedes issue #15:** the per-card "Ver en Open-Meteo" docs link is removed and replaced by the new detail-view link. Close #15 referencing this work when Task Group C lands.
- **PR grouping:** Task Group A → PR "feat: location forecast SDK". Task Group B → PR "feat: shareable forecast detail page". Task Group C → PR "feat: search + geolocation + enriched overview". Each PR gets the project's two-stage review.

## File structure

| File | Responsibility | Action |
|---|---|---|
| `src/lib/weather.ts` | Retry/backoff/429 primitives + existing `fetchWeather` | Modify (extract reusable `requestJsonWithRetry`) |
| `src/lib/geocode.ts` | `geocode(query)` → `GeoResult[]` via Open-Meteo geocoding | Create |
| `src/lib/forecast.ts` | Types + `getForecast()` (current/hourly/daily, all vars) + `uvLabel`/`windDir` | Create |
| `src/lib/weather.test.ts` | Existing SDK tests | Modify (cover extracted helper) |
| `src/lib/geocode.test.ts` | Geocode tests | Create |
| `src/lib/forecast.test.ts` | Forecast parse + helper tests | Create |
| `src/i18n/ui.ts` | Spanish/English UI strings for search/forecast pages | Create |
| `src/pages/forecast.astro` | Shareable client-rendered detail page | Create |
| `src/pages/index.astro` | Overview: search, geolocation, enriched cards, inline expand | Modify |

Conventions to follow (already in the repo): TypeScript strict; pure modules are DOM-free with injectable `fetch`/`sleep`; Astro interactive logic goes in a **bundled** `<script>` (not `is:inline`) so it can `import`; i18n strings passed to scripts via `data-*` attributes; Spanish-first; metric units; respect `prefers-reduced-motion` with Tailwind `motion-reduce:`.

---

# Task Group A — Client SDK (PR: "feat: location forecast SDK")

### Task A1: Extract a reusable retry helper from `weather.ts`

PR #19's retry loop is embedded inside `fetchWeather`. Extract it so geocode + forecast reuse the exact same backoff/429 behavior. Behavior of `fetchWeather` must not change (its tests stay green).

**Files:**
- Modify: `src/lib/weather.ts`
- Modify: `src/lib/weather.test.ts`

- [ ] **Step 1: Read the current module**

Run: `cat src/lib/weather.ts`
Note the exported symbols: `WeatherLocation`, `FetchWeatherDeps`, `RetryOptions`, `DEFAULT_RETRY`, `backoffDelay`, `parseRetryAfter`, `parseForecast`, `WMO`/`describeWeatherCode`, `buildForecastUrl`, `fetchWeather`. The new helper reuses `DEFAULT_RETRY`, `backoffDelay`, `parseRetryAfter`.

- [ ] **Step 2: Write the failing test for `requestJsonWithRetry`**

Add to `src/lib/weather.test.ts`:

```ts
import { requestJsonWithRetry } from './weather';

describe('requestJsonWithRetry', () => {
  const okJson = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

  it('returns parsed JSON on success with no retry', async () => {
    const delays: number[] = [];
    const fetchImpl = vi.fn(async () => okJson({ ok: 1 }));
    const result = await requestJsonWithRetry('https://x.test/a', {
      fetchImpl,
      sleep: async (ms: number) => { delays.push(ms); },
    });
    expect(result).toEqual({ ok: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });

  it('retries on 429 honoring Retry-After seconds, then succeeds', async () => {
    const delays: number[] = [];
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      if (call === 1) return new Response('', { status: 429, headers: { 'Retry-After': '2' } });
      return okJson({ ok: 2 });
    });
    const result = await requestJsonWithRetry('https://x.test/b', {
      fetchImpl,
      sleep: async (ms: number) => { delays.push(ms); },
    });
    expect(result).toEqual({ ok: 2 });
    expect(delays).toEqual([2000]);
  });

  it('throws after exhausting attempts', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 503 }));
    await expect(
      requestJsonWithRetry('https://x.test/c', {
        fetchImpl,
        sleep: async () => {},
      }, { attempts: 2, baseDelayMs: 1, factor: 2, maxDelayMs: 10 }),
    ).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- weather`
Expected: FAIL — `requestJsonWithRetry` is not exported.

- [ ] **Step 4: Implement `requestJsonWithRetry` and refactor `fetchWeather` to use it**

In `src/lib/weather.ts`, add (keep existing exports; reuse existing `RetryOptions`, `DEFAULT_RETRY`, `backoffDelay`, `parseRetryAfter`, and the existing deps shape — `fetchImpl`, `sleep`, optional `random`):

```ts
export interface RequestDeps {
  fetchImpl: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  random?: () => number;
}

/**
 * GET a URL and parse JSON, with exponential backoff + jitter and HTTP 429
 * handling (honors Retry-After: seconds or HTTP-date). Throws after the last
 * attempt. Shared by fetchWeather, geocode, and getForecast.
 */
export async function requestJsonWithRetry<T = unknown>(
  url: string,
  deps: RequestDeps,
  retry: RetryOptions = DEFAULT_RETRY,
): Promise<T> {
  const random = deps.random ?? Math.random;
  let lastError: unknown;
  for (let attempt = 0; attempt < retry.attempts; attempt += 1) {
    const isLastAttempt = attempt === retry.attempts - 1;
    try {
      const res = await deps.fetchImpl(url, { cache: 'no-store' });
      if (res.status === 429) {
        if (isLastAttempt) throw new Error('Rate limited (429)');
        const ra = parseRetryAfter(res.headers.get('Retry-After'), Date.now());
        await deps.sleep(ra ?? backoffDelay(attempt, retry, random));
        continue;
      }
      if (!res.ok) {
        if (isLastAttempt) throw new Error(`Request failed: ${res.status}`);
        await deps.sleep(backoffDelay(attempt, retry, random));
        continue;
      }
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
      if (isLastAttempt) break;
      await deps.sleep(backoffDelay(attempt, retry, random));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Request failed');
}
```

Then refactor the body of `fetchWeather` to call `requestJsonWithRetry(buildForecastUrl(loc), deps, retry)` and run its existing `parseForecast()` on the result, preserving its current return type and error messages. Do not change `fetchWeather`'s signature or the strings asserted by existing tests.

- [ ] **Step 5: Run the full SDK test suite**

Run: `npm test -- weather`
Expected: PASS — all pre-existing `weather` tests still green **and** the 3 new `requestJsonWithRetry` tests pass.

- [ ] **Step 6: Type-check**

Run: `npm run check`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/weather.ts src/lib/weather.test.ts
git commit -m "refactor: extract requestJsonWithRetry from fetchWeather"
```

---

### Task A2: `geocode()` — Open-Meteo geocoding

**Files:**
- Create: `src/lib/geocode.ts`
- Create: `src/lib/geocode.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/geocode.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { geocode, buildGeocodeUrl } from './geocode';

const resp = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('buildGeocodeUrl', () => {
  it('encodes the query and sets language/count', () => {
    const u = new URL(buildGeocodeUrl('Mérida', 'es'));
    expect(u.origin + u.pathname).toBe('https://geocoding-api.open-meteo.com/v1/search');
    expect(u.searchParams.get('name')).toBe('Mérida');
    expect(u.searchParams.get('language')).toBe('es');
    expect(u.searchParams.get('count')).toBe('8');
    expect(u.searchParams.get('format')).toBe('json');
  });
});

describe('geocode', () => {
  const deps = { fetchImpl: vi.fn(), sleep: async () => {} };

  it('maps API results to GeoResult', async () => {
    deps.fetchImpl = vi.fn(async () => resp({
      results: [{
        name: 'Mérida', admin1: 'Yucatán', country: 'México',
        latitude: 20.97, longitude: -89.62, timezone: 'America/Merida',
      }],
    }));
    const r = await geocode('Mérida', deps);
    expect(r).toEqual([{
      name: 'Mérida', admin1: 'Yucatán', country: 'México',
      lat: 20.97, lng: -89.62, tz: 'America/Merida',
    }]);
  });

  it('returns [] when the API omits results', async () => {
    deps.fetchImpl = vi.fn(async () => resp({}));
    expect(await geocode('zzzzzz', deps)).toEqual([]);
  });

  it('returns [] for blank queries without calling the network', async () => {
    const fetchImpl = vi.fn();
    expect(await geocode('   ', { fetchImpl, sleep: async () => {} })).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- geocode`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/geocode.ts`**

```ts
import { requestJsonWithRetry, type RequestDeps, type RetryOptions, DEFAULT_RETRY } from './weather';

export interface GeoResult {
  name: string;
  admin1?: string;
  country?: string;
  lat: number;
  lng: number;
  tz: string;
}

interface GeocodeApiResult {
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export function buildGeocodeUrl(query: string, lang = 'es'): string {
  const u = new URL('https://geocoding-api.open-meteo.com/v1/search');
  u.searchParams.set('name', query);
  u.searchParams.set('count', '8');
  u.searchParams.set('language', lang);
  u.searchParams.set('format', 'json');
  return u.toString();
}

/** Look up locations by name. Resolves [] for blank queries or no matches. */
export async function geocode(
  query: string,
  deps: RequestDeps,
  lang = 'es',
  retry: RetryOptions = DEFAULT_RETRY,
): Promise<GeoResult[]> {
  const q = query.trim();
  if (!q) return [];
  const data = await requestJsonWithRetry<{ results?: GeocodeApiResult[] }>(
    buildGeocodeUrl(q, lang),
    deps,
    retry,
  );
  if (!data.results || !Array.isArray(data.results)) return [];
  return data.results.map((r) => ({
    name: r.name,
    admin1: r.admin1,
    country: r.country,
    lat: r.latitude,
    lng: r.longitude,
    tz: r.timezone,
  }));
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- geocode`
Expected: PASS (4 tests).

- [ ] **Step 5: Type-check & commit**

Run: `npm run check` (expect 0 errors), then:

```bash
git add src/lib/geocode.ts src/lib/geocode.test.ts
git commit -m "feat: add geocode() Open-Meteo location search"
```

---

### Task A3: Forecast types + `getForecast()` (current / hourly 48h / daily 7d, all variables)

**Files:**
- Create: `src/lib/forecast.ts`
- Create: `src/lib/forecast.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/forecast.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { getForecast, buildRichForecastUrl } from './forecast';

const resp = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

const SAMPLE = {
  current: {
    time: '2026-05-16T14:00', temperature_2m: 25, apparent_temperature: 27,
    weather_code: 95, precipitation_probability: 70, wind_speed_10m: 22,
    wind_gusts_10m: 38, wind_direction_10m: 225, uv_index: 7,
    cloud_cover: 80, relative_humidity_2m: 61, surface_pressure: 1012, visibility: 9000,
  },
  hourly: {
    time: ['2026-05-16T14:00', '2026-05-16T15:00'],
    temperature_2m: [25, 24], weather_code: [95, 80],
    precipitation_probability: [70, 80], wind_speed_10m: [22, 20],
  },
  daily: {
    time: ['2026-05-16', '2026-05-17'],
    weather_code: [95, 80], temperature_2m_max: [29, 27],
    temperature_2m_min: [19, 18], precipitation_probability_max: [70, 55],
    uv_index_max: [7, 6], wind_speed_10m_max: [25, 22],
    sunrise: ['2026-05-16T06:58', '2026-05-17T06:58'],
    sunset: ['2026-05-16T19:42', '2026-05-17T19:43'],
  },
};

describe('buildRichForecastUrl', () => {
  it('requests current, hourly and daily blocks with the timezone', () => {
    const u = new URL(buildRichForecastUrl({ lat: 25.67, lng: -100.31, tz: 'America/Monterrey' }));
    expect(u.searchParams.get('latitude')).toBe('25.67');
    expect(u.searchParams.get('longitude')).toBe('-100.31');
    expect(u.searchParams.get('timezone')).toBe('America/Monterrey');
    expect(u.searchParams.get('forecast_days')).toBe('7');
    expect(u.searchParams.get('current')).toContain('temperature_2m');
    expect(u.searchParams.get('hourly')).toContain('temperature_2m');
    expect(u.searchParams.get('daily')).toContain('temperature_2m_max');
  });
});

describe('getForecast', () => {
  const deps = { fetchImpl: vi.fn(async () => resp(SAMPLE)), sleep: async () => {} };

  it('parses current/hourly/daily into the typed shape', async () => {
    const f = await getForecast({ lat: 25.67, lng: -100.31, tz: 'America/Monterrey' }, deps);
    expect(f.current.temperature).toBe(25);
    expect(f.current.feelsLike).toBe(27);
    expect(f.current.condition).toMatch(/Tormenta/);
    expect(f.hourly).toHaveLength(2);
    expect(f.hourly[0]).toMatchObject({ time: '2026-05-16T14:00', temperature: 25, precipProbability: 70 });
    expect(f.daily).toHaveLength(2);
    expect(f.daily[0]).toMatchObject({ date: '2026-05-16', tmax: 29, tmin: 19, uvMax: 7 });
  });

  it('truncates hourly to the next 48 entries', async () => {
    const big = {
      ...SAMPLE,
      hourly: {
        time: Array.from({ length: 100 }, (_, i) => `h${i}`),
        temperature_2m: Array.from({ length: 100 }, (_, i) => i),
        weather_code: Array.from({ length: 100 }, () => 0),
        precipitation_probability: Array.from({ length: 100 }, () => 0),
        wind_speed_10m: Array.from({ length: 100 }, () => 0),
      },
    };
    const f = await getForecast({ lat: 1, lng: 2 }, { fetchImpl: vi.fn(async () => resp(big)), sleep: async () => {} });
    expect(f.hourly).toHaveLength(48);
  });

  it('throws when the response has no current block', async () => {
    await expect(
      getForecast({ lat: 1, lng: 2 }, { fetchImpl: vi.fn(async () => resp({ hourly: {}, daily: {} })), sleep: async () => {} }),
    ).rejects.toThrow(/forecast/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- forecast`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/forecast.ts`**

```ts
import {
  requestJsonWithRetry, describeWeatherCode,
  type RequestDeps, type RetryOptions, DEFAULT_RETRY,
} from './weather';

export interface ForecastLocation { lat: number; lng: number; tz?: string; }

export interface CurrentWx {
  time: string;
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

export interface Forecast { current: CurrentWx; hourly: HourWx[]; daily: DayWx[]; }

const CURRENT_VARS = [
  'temperature_2m', 'apparent_temperature', 'weather_code', 'precipitation_probability',
  'wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m', 'uv_index',
  'cloud_cover', 'relative_humidity_2m', 'surface_pressure', 'visibility',
];
const HOURLY_VARS = ['temperature_2m', 'weather_code', 'precipitation_probability', 'wind_speed_10m'];
const DAILY_VARS = [
  'weather_code', 'temperature_2m_max', 'temperature_2m_min',
  'precipitation_probability_max', 'uv_index_max', 'wind_speed_10m_max', 'sunrise', 'sunset',
];
export const HOURLY_LIMIT = 48;

export function buildRichForecastUrl(loc: ForecastLocation): string {
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  u.searchParams.set('latitude', String(loc.lat));
  u.searchParams.set('longitude', String(loc.lng));
  u.searchParams.set('timezone', loc.tz || 'auto');
  u.searchParams.set('forecast_days', '7');
  u.searchParams.set('current', CURRENT_VARS.join(','));
  u.searchParams.set('hourly', HOURLY_VARS.join(','));
  u.searchParams.set('daily', DAILY_VARS.join(','));
  return u.toString();
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export async function getForecast(
  loc: ForecastLocation,
  deps: RequestDeps,
  retry: RetryOptions = DEFAULT_RETRY,
): Promise<Forecast> {
  const data = await requestJsonWithRetry<any>(buildRichForecastUrl(loc), deps, retry);
  const c = data?.current;
  if (!c) throw new Error('Invalid forecast response: missing current');

  const current: CurrentWx = {
    time: String(c.time ?? ''),
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

  const h = data?.hourly ?? {};
  const hTimes: string[] = Array.isArray(h.time) ? h.time : [];
  const hourly: HourWx[] = hTimes.slice(0, HOURLY_LIMIT).map((t: string, i: number) => ({
    time: t,
    temperature: num(h.temperature_2m?.[i]),
    weatherCode: num(h.weather_code?.[i]),
    condition: describeWeatherCode(num(h.weather_code?.[i])),
    precipProbability: num(h.precipitation_probability?.[i]),
    windSpeed: num(h.wind_speed_10m?.[i]),
  }));

  const d = data?.daily ?? {};
  const dDates: string[] = Array.isArray(d.time) ? d.time : [];
  const daily: DayWx[] = dDates.map((date: string, i: number) => ({
    date,
    weatherCode: num(d.weather_code?.[i]),
    condition: describeWeatherCode(num(d.weather_code?.[i])),
    tmax: num(d.temperature_2m_max?.[i]),
    tmin: num(d.temperature_2m_min?.[i]),
    precipProbabilityMax: num(d.precipitation_probability_max?.[i]),
    uvMax: num(d.uv_index_max?.[i]),
    windMax: num(d.wind_speed_10m_max?.[i]),
    sunrise: String(d.sunrise?.[i] ?? ''),
    sunset: String(d.sunset?.[i] ?? ''),
  }));

  return { current, hourly, daily };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- forecast`
Expected: PASS (5 tests).

- [ ] **Step 5: Type-check & commit**

Run: `npm run check` (0 errors), then:

```bash
git add src/lib/forecast.ts src/lib/forecast.test.ts
git commit -m "feat: add getForecast() with current/hourly/daily and all variables"
```

---

### Task A4: Presentation helpers `uvLabel` + `windDir`

**Files:**
- Modify: `src/lib/forecast.ts`
- Modify: `src/lib/forecast.test.ts`

- [ ] **Step 1: Write the failing tests** (append to `forecast.test.ts`)

```ts
import { uvLabel, windDir } from './forecast';

describe('uvLabel', () => {
  it('classifies UV thresholds (es)', () => {
    expect(uvLabel(1).level).toBe('bajo');
    expect(uvLabel(4).level).toBe('moderado');
    expect(uvLabel(6).level).toBe('alto');
    expect(uvLabel(9).level).toBe('muy alto');
    expect(uvLabel(11).level).toBe('extremo');
    expect(uvLabel(7).value).toBe(7);
  });
});

describe('windDir', () => {
  it('maps degrees to an 8-point compass + arrow', () => {
    expect(windDir(0)).toMatchObject({ label: 'N', arrow: '↓' });
    expect(windDir(225)).toMatchObject({ label: 'SO', arrow: '↗' });
    expect(windDir(360)).toMatchObject({ label: 'N' });
  });
});
```

Note: `arrow` is the direction the wind blows **toward** (meteorological "from" + 180°): a wind from the N (0°) is drawn pointing down `↓`; from the SW (225°) points up-right `↗`.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- forecast`
Expected: FAIL — `uvLabel`/`windDir` not exported.

- [ ] **Step 3: Implement (append to `src/lib/forecast.ts`)**

```ts
export type UvLevel = 'bajo' | 'moderado' | 'alto' | 'muy alto' | 'extremo';

export function uvLabel(uv: number): { value: number; level: UvLevel } {
  const v = Math.round(num(uv));
  const level: UvLevel =
    v <= 2 ? 'bajo' : v <= 5 ? 'moderado' : v <= 7 ? 'alto' : v <= 10 ? 'muy alto' : 'extremo';
  return { value: v, level };
}

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'] as const;
// Arrow points where the wind is going (from-direction rotated 180°).
const ARROWS = ['↓', '↙', '←', '↖', '↑', '↗', '→', '↘'] as const;

export function windDir(deg: number): { label: string; arrow: string } {
  const i = Math.round((((num(deg) % 360) + 360) % 360) / 45) % 8;
  return { label: DIRS[i], arrow: ARROWS[i] };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- forecast`
Expected: PASS (all forecast tests).

- [ ] **Step 5: Full check + commit**

Run: `npm run check` and `npm test` and `npm run build` (all green), then:

```bash
git add src/lib/forecast.ts src/lib/forecast.test.ts
git commit -m "feat: add uvLabel and windDir presentation helpers"
```

**End of Group A → open PR "feat: location forecast SDK".**

---

# Task Group B — Shareable detail page (PR: "feat: shareable forecast detail page")

### Task B1: i18n strings module

**Files:**
- Create: `src/i18n/ui.ts`

- [ ] **Step 1: Create `src/i18n/ui.ts`** (mirror PR #20's `src/i18n/feedback.ts` shape)

```ts
export interface UiStrings {
  search_placeholder: string;
  use_my_location: string;
  searching: string;
  no_results: string;
  geo_denied: string;
  quick_peek: string;
  full_forecast: string;
  back_home: string;
  current: string;
  feels_like: string;
  hourly_48h: string;
  seven_days: string;
  detail: string;
  wind: string;
  uv_index: string;
  sky_air: string;
  humidity: string;
  pressure: string;
  visibility: string;
  sunrise: string;
  sunset: string;
  cloud_cover: string;
  gusts: string;
  pick_location: string;
  loading: string;
  load_error: string;
}

export const ui: Record<'es' | 'en', UiStrings> = {
  es: {
    search_placeholder: 'Buscar cualquier ciudad o lugar…',
    use_my_location: 'Usar mi ubicación',
    searching: 'Buscando…',
    no_results: 'Sin resultados para',
    geo_denied: 'No se pudo obtener tu ubicación.',
    quick_peek: 'Ver vista rápida',
    full_forecast: 'Ver pronóstico completo',
    back_home: 'Volver al inicio',
    current: 'Ahora',
    feels_like: 'sensación',
    hourly_48h: 'Por hora — hoy y mañana (48 h)',
    seven_days: '7 días',
    detail: 'Detalle',
    wind: 'Viento',
    uv_index: 'Índice UV',
    sky_air: 'Cielo y aire',
    humidity: 'humedad',
    pressure: 'presión',
    visibility: 'visibilidad',
    sunrise: 'amanecer',
    sunset: 'atardecer',
    cloud_cover: 'nubes',
    gusts: 'ráfagas',
    pick_location: 'Busca una ubicación para ver su pronóstico.',
    loading: 'Cargando pronóstico…',
    load_error: 'Error al cargar. Se reintentará automáticamente.',
  },
  en: {
    search_placeholder: 'Search any city or place…',
    use_my_location: 'Use my location',
    searching: 'Searching…',
    no_results: 'No results for',
    geo_denied: 'Could not get your location.',
    quick_peek: 'Quick peek',
    full_forecast: 'See full forecast',
    back_home: 'Back to home',
    current: 'Now',
    feels_like: 'feels like',
    hourly_48h: 'Hourly — today & tomorrow (48 h)',
    seven_days: '7 days',
    detail: 'Detail',
    wind: 'Wind',
    uv_index: 'UV index',
    sky_air: 'Sky & air',
    humidity: 'humidity',
    pressure: 'pressure',
    visibility: 'visibility',
    sunrise: 'sunrise',
    sunset: 'sunset',
    cloud_cover: 'clouds',
    gusts: 'gusts',
    pick_location: 'Search for a location to see its forecast.',
    loading: 'Loading forecast…',
    load_error: 'Failed to load. It will retry automatically.',
  },
};
```

- [ ] **Step 2: Type-check & commit**

Run: `npm run check` (0 errors), then:

```bash
git add src/i18n/ui.ts
git commit -m "feat: add UI i18n strings for search and forecast pages"
```

---

### Task B2: `forecast.astro` — scaffold, param parsing, empty state

**Files:**
- Create: `src/pages/forecast.astro`

- [ ] **Step 1: Create the page with layout, query parsing, and empty state**

`src/pages/forecast.astro`:

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import { ui } from '../i18n/ui';
const lang: 'es' | 'en' = 'es';
const t = ui[lang];
---

<BaseLayout title="Pronóstico — Clima México 🇲🇽" description="Pronóstico detallado por ubicación" lang={lang}>
  <main class="min-h-screen bg-gray-950 text-gray-100">
    <div class="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <a href={import.meta.env.BASE_URL} class="text-sm text-blue-400 hover:text-blue-300">← {t.back_home}</a>

      <div id="fc-empty" class="hidden rounded-xl border border-gray-800 bg-gray-900 p-6 text-center text-gray-400">
        {t.pick_location}
        <div class="mt-3">
          <a href={import.meta.env.BASE_URL} class="text-blue-400 hover:text-blue-300 text-sm">{t.back_home} →</a>
        </div>
      </div>

      <p id="fc-status" class="text-sm text-gray-500" aria-live="polite">{t.loading}</p>

      <section id="fc-root" class="hidden space-y-6" aria-live="polite"></section>
    </div>
  </main>

  <script>
    import { getForecast } from '../lib/forecast';

    const params = new URLSearchParams(location.search);
    const latRaw = params.get('lat');
    const lngRaw = params.get('lng');
    const name = params.get('name') || '';
    const tz = params.get('tz') || 'auto';
    const lat = Number(latRaw);
    const lng = Number(lngRaw);

    const empty = document.getElementById('fc-empty')!;
    const status = document.getElementById('fc-status')!;
    const root = document.getElementById('fc-root')!;

    const valid =
      latRaw !== null && lngRaw !== null &&
      Number.isFinite(lat) && Number.isFinite(lng) &&
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

    if (!valid) {
      status.classList.add('hidden');
      empty.classList.remove('hidden');
    } else {
      // Rendering is implemented in Task B3.
      (window as any).__fcRender?.({ lat, lng, tz, name });
    }
  </script>
</BaseLayout>
```

- [ ] **Step 2: Build & manual check**

Run: `npm run build && npx astro preview &` then open
`http://localhost:4321/mexico-weather-site/forecast` (no params) → shows the
"busca una ubicación" empty state, no console errors. Stop preview.

- [ ] **Step 3: Type-check & commit**

Run: `npm run check` (0 errors), then:

```bash
git add src/pages/forecast.astro
git commit -m "feat: scaffold forecast page with param parsing and empty state"
```

---

### Task B3: `forecast.astro` — render current, hourly, 7-day, panels

**Files:**
- Modify: `src/pages/forecast.astro`

- [ ] **Step 1: Add render markup containers + the render script**

Replace the `<section id="fc-root" ...></section>` with the structured containers and replace the placeholder comment in the script with the full renderer. Use `textContent` only for dynamic strings (no `innerHTML` with location/API data). Add to the `<script>` (keeping the param logic from B2; remove the `__fcRender?.()` placeholder call and call `render()` directly):

```ts
import { getForecast, uvLabel, windDir, type Forecast } from '../lib/forecast';
import { ui } from '../i18n/ui';
const t = ui.es;

function esc(s: string) { return s.replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)); }

function hourLabel(iso: string, idx: number) {
  if (idx === 0) return t.current;
  const hh = iso.slice(11, 13);
  return `${hh}h`;
}
function dayLabel(iso: string, idx: number) {
  if (idx === 0) return t.es_today ?? 'Hoy';
  const d = new Date(iso + 'T00:00');
  return d.toLocaleDateString('es-MX', { weekday: 'long' });
}

function sparkline(temps: number[]): string {
  if (temps.length < 2) return '';
  const min = Math.min(...temps), max = Math.max(...temps);
  const span = max - min || 1;
  const pts = temps.map((v, i) => {
    const x = (i / (temps.length - 1)) * 300;
    const y = 34 - ((v - min) / span) * 30;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg viewBox="0 0 300 36" preserveAspectRatio="none" class="w-full h-9" aria-hidden="true">
    <polyline points="${pts}" fill="none" stroke="#60a5fa" stroke-width="2" /></svg>`;
}

function render(loc: { lat: number; lng: number; tz: string; name: string }) {
  getForecast({ lat: loc.lat, lng: loc.lng, tz: loc.tz }, {
    fetchImpl: window.fetch.bind(window),
    sleep: (ms: number) => new Promise((r) => setTimeout(r, ms)),
  }).then((f: Forecast) => {
    const uv = uvLabel(f.current.uvIndex);
    const wd = windDir(f.current.windDir);
    const title = loc.name || `${loc.lat.toFixed(2)}, ${loc.lng.toFixed(2)}`;
    document.title = `${title} — Clima México 🇲🇽`;

    const hours = f.hourly.map((h, i) => `
      <div class="min-w-[62px] bg-gray-900 border border-gray-800 rounded-lg p-2 text-center text-[11px] text-gray-400">
        <div class="text-gray-200 font-bold text-xs">${esc(hourLabel(h.time, i))}</div>
        <div>${esc(h.condition.replace(/[^\p{Emoji}]/gu, '') || '·')}</div>
        <div class="text-base font-extrabold text-white my-1">${Math.round(h.temperature)}°</div>
        <div class="text-blue-400">${Math.round(h.precipProbability)}%</div>
        <div>${Math.round(h.windSpeed)} km/h</div>
      </div>`).join('');

    const days = f.daily.map((d, i) => `
      <div class="grid grid-cols-[90px_36px_1fr_64px_88px] items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm">
        <span class="font-bold capitalize">${esc(dayLabel(d.date, i))}</span>
        <span class="text-base">${esc(d.condition.replace(/[^\p{Emoji}]/gu, '') || '·')}</span>
        <span class="h-1.5 bg-gray-800 rounded"></span>
        <span class="text-blue-400 text-xs">💧${Math.round(d.precipProbabilityMax)}%</span>
        <span class="text-gray-400 text-right">${Math.round(d.tmin)}° / ${Math.round(d.tmax)}°</span>
      </div>`).join('');

    root.innerHTML = `
      <div class="flex justify-between items-end border-b border-gray-800 pb-4">
        <div>
          <h1 class="text-2xl font-extrabold">${esc(title)}</h1>
          <p class="text-xs text-gray-500 mt-1">${loc.lat.toFixed(2)}°, ${loc.lng.toFixed(2)}°</p>
          <p class="text-5xl font-extrabold mt-3">${Math.round(f.current.temperature)}°<span class="text-base text-gray-400 font-semibold"> ${esc(t.feels_like)} ${Math.round(f.current.feelsLike)}°</span></p>
        </div>
        <div class="text-right">
          <p class="text-sm text-gray-400">${esc(f.current.condition)}</p>
          <p class="text-xs text-gray-400 mt-1">${esc(t.sunrise)} ${esc(f.current.time ? '' : '')}${esc(f.daily[0]?.sunrise.slice(11) || '')} · ${esc(t.sunset)} ${esc(f.daily[0]?.sunset.slice(11) || '')}</p>
        </div>
      </div>

      <h2 class="text-xs uppercase tracking-wide text-gray-400 mt-6 mb-2">${esc(t.hourly_48h)}</h2>
      <div class="flex gap-2 overflow-x-auto pb-1">${hours}</div>
      ${sparkline(f.hourly.map((h) => h.temperature))}

      <h2 class="text-xs uppercase tracking-wide text-gray-400 mt-6 mb-2">${esc(t.seven_days)}</h2>
      <div class="flex flex-col gap-1.5">${days}</div>

      <h2 class="text-xs uppercase tracking-wide text-gray-400 mt-6 mb-2">${esc(t.detail)}</h2>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div class="text-xs text-gray-400 uppercase">💨 ${esc(t.wind)}</div>
          <div class="text-xl font-extrabold my-1">${Math.round(f.current.windSpeed)} km/h</div>
          <div class="text-xs text-gray-400">${wd.arrow} ${esc(wd.label)} · ${esc(t.gusts)} ${Math.round(f.current.windGusts)} km/h</div>
        </div>
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div class="text-xs text-gray-400 uppercase">☀️ ${esc(t.uv_index)}</div>
          <div class="text-xl font-extrabold my-1">${uv.value} · ${esc(uv.level)}</div>
        </div>
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div class="text-xs text-gray-400 uppercase">☁️ ${esc(t.sky_air)}</div>
          <div class="text-xl font-extrabold my-1">${Math.round(f.current.cloudCover)}% ${esc(t.cloud_cover)}</div>
          <div class="text-xs text-gray-400">${esc(t.humidity)} ${Math.round(f.current.humidity)}% · ${esc(t.pressure)} ${Math.round(f.current.pressure)} hPa · ${esc(t.visibility)} ${f.current.visibilityKm} km</div>
        </div>
      </div>`;

    status.classList.add('hidden');
    root.classList.remove('hidden');
  }).catch(() => {
    status.textContent = t.load_error;
    status.classList.remove('text-gray-500');
    status.classList.add('text-red-400');
  });
}
```

Then change the B2 valid-branch to call `render({ lat, lng, tz, name });`. Remove the unused `dayLabel` reference `t.es_today` (use `'Hoy'` directly — see fix note below).

> **Fix note (apply now):** in `dayLabel`, use `if (idx === 0) return 'Hoy';` — there is no `es_today` key. This avoids referencing an undefined string.

- [ ] **Step 2: Build & manual check**

Run: `npm run build && npx astro preview &`, open
`http://localhost:4321/mexico-weather-site/forecast?lat=25.67&lng=-100.31&name=Monterrey&tz=America/Monterrey`.
Expected: current block, 48h strip + trend line, 7-day list, three detail
panels render; `document.title` includes "Monterrey"; no console errors. Stop preview.

- [ ] **Step 3: Type-check & commit**

Run: `npm run check` (0 errors) and `npm run build` (success), then:

```bash
git add src/pages/forecast.astro
git commit -m "feat: render current/hourly/7-day/detail on forecast page"
```

---

### Task B4: SMN context + accessibility + reduced motion

**Files:**
- Modify: `src/pages/forecast.astro`

- [ ] **Step 1: Add the SMN context banner + footer to the rendered HTML**

Append inside the `root.innerHTML` template, after the detail panels grid:

```html
<div class="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-300 mt-4">
  ⚠️ Contexto SMN/CONAGUA — avisos vigentes:
  <a href="${import.meta.env.BASE_URL.replace(/\/$/, '')}/rss.xml" class="underline" target="_blank" rel="noopener noreferrer">Feed RSS del SMN</a>
</div>
<footer class="border-t border-gray-800 mt-4 pt-3 text-center text-[11px] text-gray-600">
  Datos: Open-Meteo (ECMWF/DWD/GFS) · Alertas: SMN / CONAGUA · Sin cookies · Sin rastreo
</footer>
```

(`import.meta.env.BASE_URL` is available in the bundled module scope.)

- [ ] **Step 2: A11y — make the hourly strip keyboard-scrollable and labelled**

On the hourly container div add `tabindex="0"` and `aria-label="${esc(t.hourly_48h)}"` and `role="group"`. Ensure each `<h2>` precedes its section (already true). The page `<h1>` is set via `document.title` + the rendered `<h1>` — confirm one `<h1>` only (the rendered one; the empty state has none — acceptable).

- [ ] **Step 3: Reduced motion**

No CSS transitions were added on this page; confirm by grep:
Run: `grep -n "transition\|animate-" src/pages/forecast.astro` → expect no
matches (nothing to guard). If any are added later, prefix with
`motion-reduce:transition-none`.

- [ ] **Step 4: Build, check, full verify, commit**

Run: `npm run check` (0 errors), `npm run build` (success),
`npm test` (Group A tests still pass). Manual: reload the Monterrey URL,
Tab to the hourly strip and arrow-scroll it, confirm RSS link points to
`/mexico-weather-site/rss.xml`. Then:

```bash
git add src/pages/forecast.astro
git commit -m "feat: add SMN context, a11y and footer to forecast page"
```

**End of Group B → open PR "feat: shareable forecast detail page".**

---

# Task Group C — Overview: search, geolocation, enriched cards (PR: "feat: search + geolocation + enriched overview")

### Task C1: Enrich preset cards with current conditions + inline quick peek

**Files:**
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Read the current overview**

Run: `cat src/pages/index.astro` — note: cards loop over `cities` (from
`src/data/cities.ts`), use `data-city-card`/`data-lat`/`data-lng`/`data-tz`
and `js-*` classes; the existing bundled `<script>` (post PR #19) calls
`fetchWeather`. The per-card "Ver en Open-Meteo →" link (issue #15) is here.

- [ ] **Step 2: Replace the per-card Open-Meteo docs link and add peek/full markup**

In the card template inside the `cities.map(...)`:
- **Remove** the `<a href={`https://open-meteo.com/en/docs?...`}>Ver en Open-Meteo →</a>` block (closes #15).
- After the `.js-weather` block, add:

```astro
<button type="button" class="js-peek text-xs text-blue-400 hover:text-blue-300 mt-1 text-left">▾ Ver vista rápida</button>
<div class="js-peekbox hidden mt-2 text-xs text-gray-300 space-y-1"></div>
<a class="js-full inline-block mt-2 text-xs text-blue-400 border border-blue-900 rounded px-2 py-1" href="#">Ver pronóstico completo →</a>
```

- [ ] **Step 3: Switch the card refresh to `getForecast` and wire peek + full link**

In the bundled `<script>`, replace the `fetchWeather` import/usage with
`getForecast` from `../lib/forecast` and `windDir`, `uvLabel`. For each card,
after a successful `getForecast`, fill the existing `.js-tmax/.js-tmin/
.js-rain/.js-condition` from `f.daily[0]` / `f.current`, and:

```ts
const base = (import.meta.env.BASE_URL as string).replace(/\/$/, '');
function fullHref(lat: string, lng: string, tz: string, name: string) {
  const p = new URLSearchParams({ lat, lng, tz, name });
  return `${base}/forecast?${p.toString()}`;
}
// per card (lat,lng,tz are the data-* attrs, name from the <h3> text):
const full = card.querySelector('.js-full') as HTMLAnchorElement;
full.href = fullHref(lat, lng, tz, card.querySelector('h3')!.textContent!.trim());

const peekBtn = card.querySelector('.js-peek') as HTMLButtonElement;
const peekBox = card.querySelector('.js-peekbox') as HTMLDivElement;
peekBtn.addEventListener('click', () => {
  const wd = windDir(f.current.windDir);
  const uv = uvLabel(f.current.uvIndex);
  peekBox.textContent = '';
  const line = document.createElement('div');
  line.textContent =
    `💨 ${Math.round(f.current.windSpeed)} km/h ${wd.label} · ☀️ UV ${uv.value} (${uv.level}) · ` +
    `☁️ ${Math.round(f.current.cloudCover)}% · 💦 ${Math.round(f.current.humidity)}%`;
  peekBox.appendChild(line);
  peekBox.classList.toggle('hidden');
});
```

Keep the existing 10-min refresh, retry behavior, success/terminal-error
copy, and the `js-*`/`data-*` contract. Use `textContent` (never
`innerHTML`) for the peek.

- [ ] **Step 4: Build & manual check**

Run: `npm run build && npx astro preview &`, open the homepage. Each card
loads current temp/condition; "Ver vista rápida" toggles the extra-variable
line; "Ver pronóstico completo →" links to
`/mexico-weather-site/forecast?lat=…`. No console errors. Stop preview.

- [ ] **Step 5: Check + commit**

Run: `npm run check` (0 errors), `npm run build` (success). Then:

```bash
git add src/pages/index.astro
git commit -m "feat: enrich preset cards with current data + inline quick peek; drop #15 docs link"
```

---

### Task C2: Search box with debounced geocoding autocomplete (combobox a11y)

**Files:**
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Add the search markup in the hero (after the subtitle `<p>`)**

```astro
<div class="max-w-xl mx-auto mt-6">
  <div class="flex gap-2">
    <input id="q" type="text" autocomplete="off" role="combobox" aria-expanded="false"
      aria-controls="ac" aria-autocomplete="list"
      placeholder="Buscar cualquier ciudad o lugar…"
      class="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
    <button id="geo" type="button"
      class="bg-gray-900 border border-gray-700 rounded-lg px-3 text-sm text-blue-300 hover:bg-gray-800 motion-reduce:transition-none">📍 Usar mi ubicación</button>
  </div>
  <ul id="ac" role="listbox" class="hidden mt-1 bg-gray-900 border border-gray-700 rounded-lg overflow-hidden"></ul>
  <p id="qmsg" class="hidden mt-1 text-xs text-gray-500" aria-live="polite"></p>
</div>
```

- [ ] **Step 2: Add the autocomplete script (in the bundled `<script>`)**

```ts
import { geocode } from '../lib/geocode';

const q = document.getElementById('q') as HTMLInputElement;
const ac = document.getElementById('ac') as HTMLUListElement;
const qmsg = document.getElementById('qmsg') as HTMLParagraphElement;
const deps = { fetchImpl: window.fetch.bind(window), sleep: (ms: number) => new Promise((r) => setTimeout(r, ms)) };
let acItems: HTMLLIElement[] = [];
let active = -1;
let timer = 0;

function go(lat: number, lng: number, tz: string, name: string) {
  const p = new URLSearchParams({ lat: String(lat), lng: String(lng), tz, name });
  location.href = `${base}/forecast?${p.toString()}`;
}
function closeAc() { ac.classList.add('hidden'); q.setAttribute('aria-expanded', 'false'); acItems = []; active = -1; }

q.addEventListener('input', () => {
  window.clearTimeout(timer);
  const term = q.value.trim();
  if (!term) { closeAc(); qmsg.classList.add('hidden'); return; }
  timer = window.setTimeout(async () => {
    qmsg.textContent = 'Buscando…'; qmsg.classList.remove('hidden');
    try {
      const results = await geocode(term, deps);
      ac.textContent = '';
      if (results.length === 0) {
        qmsg.textContent = `Sin resultados para «${term}»`;
        closeAc(); return;
      }
      qmsg.classList.add('hidden');
      acItems = results.map((r, i) => {
        const li = document.createElement('li');
        li.id = `ac-${i}`;
        li.setAttribute('role', 'option');
        li.className = 'px-3 py-2 text-sm border-b border-gray-800 last:border-0 cursor-pointer hover:bg-gray-800';
        li.textContent = [r.name, r.admin1, r.country].filter(Boolean).join(', ');
        li.addEventListener('click', () => go(r.lat, r.lng, r.tz, r.name));
        ac.appendChild(li);
        return li;
      });
      ac.classList.remove('hidden');
      q.setAttribute('aria-expanded', 'true');
    } catch {
      qmsg.textContent = 'Sin resultados para «' + term + '»';
      closeAc();
    }
  }, 300);
});

q.addEventListener('keydown', (e) => {
  if (ac.classList.contains('hidden')) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, acItems.length - 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); }
  else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); acItems[active].click(); return; }
  else if (e.key === 'Escape') { closeAc(); return; }
  else return;
  acItems.forEach((li, i) => li.classList.toggle('bg-gray-800', i === active));
  if (acItems[active]) q.setAttribute('aria-activedescendant', acItems[active].id);
});

document.addEventListener('click', (e) => {
  if (!ac.contains(e.target as Node) && e.target !== q) closeAc();
});
```

(`base` is defined in Task C1's script — reuse it; do not redeclare.)

- [ ] **Step 3: Build & manual check**

Run: `npm run build && npx astro preview &`. Type "Mérida" → suggestions
appear after ~300ms; ↑/↓ highlights, Enter navigates to
`/forecast?lat=…&name=Mérida`; Esc closes; typing gibberish shows
"Sin resultados para «…»". Stop preview.

- [ ] **Step 4: Check + commit**

Run: `npm run check` (0 errors), `npm run build` (success). Then:

```bash
git add src/pages/index.astro
git commit -m "feat: add geocoding search with accessible autocomplete combobox"
```

---

### Task C3: "Use my location" + finalize

**Files:**
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Wire the geolocation button (append to the bundled script)**

```ts
const geoBtn = document.getElementById('geo') as HTMLButtonElement;
geoBtn.addEventListener('click', () => {
  if (!navigator.geolocation) { qmsg.textContent = 'No se pudo obtener tu ubicación.'; qmsg.classList.remove('hidden'); return; }
  qmsg.textContent = 'Buscando…'; qmsg.classList.remove('hidden');
  navigator.geolocation.getCurrentPosition(
    (pos) => go(pos.coords.latitude, pos.coords.longitude, 'auto', 'Tu ubicación'),
    () => { qmsg.textContent = 'No se pudo obtener tu ubicación.'; qmsg.classList.remove('hidden'); },
    { timeout: 10000 },
  );
});
```

- [ ] **Step 2: Update README features list**

In `README.md`, under Features, replace the city-cards line set with:
`- Search any location + "use my location" with current / 48h-hourly / 7-day forecast (wind, UV, sky & air).`
Keep the rest of the README intact.

- [ ] **Step 3: Full verification**

Run: `npm run check` (0 errors), `npm test` (Group A tests pass),
`npm run build` (success). Manual: homepage → geolocation prompt → on allow,
navigates to `/forecast?...&name=Tu%20ubicación`; on deny, shows the message
and search still works.

- [ ] **Step 4: Commit**

```bash
git add src/pages/index.astro README.md
git commit -m "feat: add use-my-location; update README; closes #15"
```

**End of Group C → open PR "feat: search + geolocation + enriched overview". Close issue #15 referencing the PR.**

---

## Self-review (performed)

**Spec coverage:** geocode (A2), getForecast current/hourly/daily + all variable groups core/wind/UV/sky&air (A3), uvLabel/windDir (A4), shareable `/forecast` with query params + empty/error states (B2–B4), SMN context + attribution (B4), overview search + autocomplete + geolocation + enriched cards + inline peek + shareable link (C1–C3), supersedes #15 (C1/C3), Spanish-first i18n (B1), tests SDK-only deterministic (A1–A4), no new deps (all tasks use built-ins), accessibility combobox + keyboard + reduced motion (C2/B4), XSS-safe `textContent`/`esc()` (B3/C1/C2). No gaps found.

**Placeholder scan:** No TBD/TODO. The B2 `__fcRender?.()` placeholder is explicitly replaced in B3 (called out). The `t.es_today` slip is fixed inline in B3's Fix note (use `'Hoy'`).

**Type consistency:** `RequestDeps`/`requestJsonWithRetry` (A1) reused by `geocode` (A2) and `getForecast` (A3). `GeoResult{lat,lng,tz}`, `Forecast{current,hourly,daily}`, `CurrentWx`, `windDir().{label,arrow}`, `uvLabel().{value,level}` used consistently in B3/C1/C2. `import.meta.env.BASE_URL` usage consistent. `ui`/`UiStrings` (B1) used in B2–B4.

---

## Execution handoff

Plan complete. PR grouping: A → SDK PR, B → detail-page PR, C → overview PR. Prerequisite: base must contain PR #19 + #20.

# Plan A — Detail-page fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fix the `/forecast` page so the hourly strip starts at the current local hour (idx 0 = real "Ahora") and the 7-day list shows a populated temperature range bar.

**Architecture:** One pure SDK change in `src/lib/forecast.ts` (anchor hourly slice to `current.time`), unit-tested; one presentational change in `src/pages/forecast.astro` (compute the 7-day min–max bar fill). No new deps.

**Tech Stack:** Astro 6 static, TypeScript strict, Vitest, Tailwind 4.

---

## File structure
| File | Responsibility | Action |
|---|---|---|
| `src/lib/forecast.ts` | `getForecast` hourly slice anchored to current hour | Modify |
| `src/lib/forecast.test.ts` | hourly-anchor unit tests | Modify |
| `src/pages/forecast.astro` | 7-day range-bar fill computation + render | Modify |
| `e2e/forecast.spec.ts` (or extend search.spec.ts) | assert 7-day bar has a non-zero fill | Modify/Create |

---

### Task A1: Anchor the hourly slice to the current local hour

**Files:** Modify `src/lib/forecast.ts`; Modify `src/lib/forecast.test.ts`

- [ ] **Step 1: Write the failing test** (append to `src/lib/forecast.test.ts`)

```ts
describe('getForecast hourly anchoring', () => {
  function hourlyPayload(currentTime: string, firstHour: string, n = 60) {
    const times: string[] = [];
    let [datePart, hm] = firstHour.split('T');
    let h = Number(hm.slice(0, 2));
    let d = new Date(datePart + 'T00:00:00Z');
    for (let i = 0; i < n; i += 1) {
      const dd = new Date(d.getTime() + (h + i) * 3600_000);
      times.push(dd.toISOString().slice(0, 13).replace('T', 'T') + ':00');
    }
    return {
      current: { time: currentTime, temperature_2m: 20, weather_code: 0 },
      hourly: {
        time: times,
        temperature_2m: times.map((_, i) => i),
        weather_code: times.map(() => 0),
        precipitation_probability: times.map(() => 0),
        wind_speed_10m: times.map(() => 0),
      },
      daily: { time: ['2026-05-18'], weather_code: [0], temperature_2m_max: [25],
        temperature_2m_min: [12], precipitation_probability_max: [10],
        uv_index_max: [4], wind_speed_10m_max: [9],
        sunrise: ['2026-05-18T06:00'], sunset: ['2026-05-18T19:00'] },
    };
  }
  const resp = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

  it('starts hourly at the entry >= current.time (idx 0 is the current hour)', async () => {
    // hourly begins 2026-05-18T00:00; current time is 14:30 → first kept = 14:00
    const body = hourlyPayload('2026-05-18T14:30', '2026-05-18T00:00');
    const f = await getForecast(
      { lat: 19.43, lng: -99.13, tz: 'America/Mexico_City' },
      { fetch: vi.fn(async () => resp(body)), sleep: async () => {} },
    );
    expect(f.hourly[0].time.slice(0, 13)).toBe('2026-05-18T14');
    expect(f.hourly.length).toBe(48);
  });

  it('falls back to index 0 when current.time is absent', async () => {
    const body = hourlyPayload('', '2026-05-18T00:00');
    delete (body.current as { time?: string }).time;
    body.current.time = undefined as unknown as string;
    const f = await getForecast(
      { lat: 1, lng: 2 },
      { fetch: vi.fn(async () => resp(body)), sleep: async () => {} },
    );
    expect(f.hourly[0].time.slice(0, 13)).toBe('2026-05-18T00');
    expect(f.hourly.length).toBe(48);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- forecast`
Expected: FAIL — `hourly[0].time` is `2026-05-18T00`, not `…T14`.

- [ ] **Step 3: Implement the anchored slice**

In `src/lib/forecast.ts`, replace the hourly block (the
`const h = data.hourly ?? {}; … const hourly: HourWx[] = hTimes.slice(0, HOURLY_LIMIT).map(...)`
section) with:

```ts
  const h = data.hourly ?? {};
  const hTimes: unknown[] = Array.isArray(h.time) ? h.time : [];
  // Open-Meteo returns hourly.time starting at 00:00 of the first forecast
  // day (in loc.tz). Anchor the 48-hour window to the current local hour so
  // index 0 is genuinely "now". current.time is the location-local ISO
  // (same tz/format as hourly.time), so a string compare is valid.
  const currentTime = typeof c.time === 'string' ? c.time : '';
  let startIdx = 0;
  if (currentTime) {
    const found = hTimes.findIndex(
      (t) => typeof t === 'string' && t >= currentTime.slice(0, 13),
    );
    if (found > 0) startIdx = found;
    else if (found === -1 && hTimes.length > HOURLY_LIMIT) {
      // current time is past the available window: keep the last 48
      startIdx = Math.max(0, hTimes.length - HOURLY_LIMIT);
    }
  }
  const hourly: HourWx[] = hTimes
    .slice(startIdx, startIdx + HOURLY_LIMIT)
    .map((_, j): HourWx => {
      const i = startIdx + j;
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
```

Note: comparing `t >= currentTime.slice(0,13)` (i.e. `YYYY-MM-DDTHH`) selects
the first hourly entry in the current clock hour or later — correct because
Open-Meteo hourly stamps are on the hour (`…T14:00`).

- [ ] **Step 4: Run tests**

Run: `npm test -- forecast`
Expected: PASS (both new tests + all existing forecast tests).

- [ ] **Step 5: Full gate + commit**

Run: `npm run check && npm run lint && npm test && npm run build` (all green; report counts).

```bash
git add src/lib/forecast.ts src/lib/forecast.test.ts
git -c commit.gpgsign=false commit -m "fix: anchor hourly forecast to the current local hour

Open-Meteo hourly.time starts at 00:00; slice from the first entry >=
current.time so idx 0 is genuinely 'Ahora'. Falls back to idx 0 when
current.time is absent.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task A2: Populate the 7-day temperature range bar

**Files:** Modify `src/pages/forecast.astro`

- [ ] **Step 1: Read the current 7-day render block**

Run: `grep -n "7 d\|d7\|track\|dayLabel\|tmin\|tmax\|daily.map\|bar" src/pages/forecast.astro`
Identify the loop that renders each `daily` row and the empty track element.

- [ ] **Step 2: Add the week range computation + per-day fill**

In the script, before building the 7-day rows, compute the week range over
non-null values:

```ts
const dMins = daily.map((d) => d.tmin).filter((v): v is number => v !== null);
const dMaxs = daily.map((d) => d.tmax).filter((v): v is number => v !== null);
const weekMin = dMins.length ? Math.min(...dMins) : 0;
const weekMax = dMaxs.length ? Math.max(...dMaxs) : 1;
const span = weekMax - weekMin || 1;
function barFill(tmin: number | null, tmax: number | null): string {
  if (tmin === null || tmax === null) return '';
  const leftPct = ((tmin - weekMin) / span) * 100;
  const rightPct = 100 - ((tmax - weekMin) / span) * 100;
  return `<i style="position:absolute;left:${leftPct.toFixed(1)}%;right:${Math.max(0, rightPct).toFixed(1)}%;height:100%;border-radius:9999px;background:linear-gradient(90deg,#60a5fa,#fbbf24,#f97316)"></i>`;
}
```

In each daily row template, replace the empty track element with a
positioned container holding the fill. The track span must be
`position:relative; overflow:hidden`. Example row cell (match the existing
grid/classes; only change the bar cell):

```html
<span class="relative h-1.5 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">${barFill(dw.tmin, dw.tmax)}</span>
```

(Keep the day label, condition emoji, `💧${precip}%`, `${fmt(tmin)}° / ${fmt(tmax)}°`
cells exactly as they are. `barFill` returns `''` for null days → empty track,
matching A3 "no other empties".)

- [ ] **Step 3: Build & visually reason**

Run: `npm run build` (success). Inspect `dist/forecast/index.html` (the bar
markup is JS-rendered; instead reason: for CDMX-like data weekMin≈11,
weekMax≈29 → "Hoy 16/29" fills from ~28% to right:0%, etc., non-empty).

- [ ] **Step 4: Add an E2E assertion**

In `e2e/search.spec.ts` (the spec that already navigates to a `/forecast`
page via the mocked search) add:

```ts
// after the forecast page renders
const firstBar = page.locator('section >> text=7 días').locator('xpath=..').locator('i').first();
await expect(firstBar).toHaveCount(1);
const style = await firstBar.getAttribute('style');
expect(style).toMatch(/left:\d/);
```

(If the existing forecast assertion uses different locators, mirror them; the
key check is that at least one `<i>` bar-fill with a `left:` style exists.)

- [ ] **Step 5: Full gate + commit**

Run: `npm run check && npm run lint && npm test && npm run build && npx playwright install chromium >/dev/null 2>&1 && npm run test:e2e` (all green).

```bash
git add src/pages/forecast.astro e2e/search.spec.ts
git -c commit.gpgsign=false commit -m "fix: render 7-day temperature range bar (was an empty track)

Compute each day's min->max position within the week's overall min..max
with a cool->warm gradient; null days show an empty track.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-review
- **Spec coverage:** A1 (hourly anchor + fallback) ✓ Task A1; A2 (7-day bar fill, null-guard, gradient) ✓ Task A2; A3 (no other empties) ✓ verified in A2 Step 3. No gaps.
- **Placeholders:** none — full code given; grep step is a read, not a placeholder.
- **Type consistency:** uses existing `HourWx`/`DayWx`/`numOrNull`/`num`/`str`/`describeWeatherCode`/`HOURLY_LIMIT`/`fmt`; `c.time` is the existing parsed `current` source object. Consistent.

## Execution: open one PR "fix: forecast hourly anchor + 7-day range bar (A1, A2)" after both tasks; CI+E2E green; deploy; **live browser-verify** the hourly labels and the populated bar.

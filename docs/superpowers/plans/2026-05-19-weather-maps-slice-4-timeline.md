# Weather Maps — Slice 4: Timeline Scrubber + Playback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a past→now→forecast timeline scrubber with playback to `/mapa`, controlling which RainViewer frame the active raster layer (radar or satellite) displays, with the selected frame shareable via the URL hash.

**Architecture:** A new pure, DOM-free `src/lib/maptimeline.ts` (frame selection by layer, default/clamped index, time-offset label data, hash-`t` seek) with colocated Vitest. `src/pages/mapa.astro` is refactored so the weather raster renders an explicit chosen frame (not always "now"); a bottom scrubber UI drives the frame index, persists the frame in the existing `t=` hash param (already parsed by `maphash`, currently unused), and restores it on load. Playback is a separate task gated by `prefers-reduced-motion`. UI/MapLibre wiring stays untested per repo convention.

**Tech Stack:** Astro 6, TypeScript, Tailwind 4, Vitest, MapLibre GL JS, RainViewer free public API (radar `past`+`nowcast` already merged & time-sorted into `RainviewerData.frames`; satellite into `satelliteFrames` — the nowcast frames ARE the short-term forecast, so the existing data already spans past→now→forecast; no new fetch).

Spec: `docs/superpowers/specs/2026-05-18-weather-maps-design.md` (Slice 4). Builds on Slices 1–3 (merged to `main`).

---

### Task 1: i18n strings for the timeline

**Files:**
- Modify: `src/i18n/ui.ts`

- [ ] **Step 1: Extend the `UiStrings` interface**

In `src/i18n/ui.ts`, add these fields to the `UiStrings` interface immediately after the existing `map_layer_satellite: string;` line:

```ts
  timeline_label: string;
  timeline_play: string;
  timeline_pause: string;
  timeline_prev: string;
  timeline_next: string;
  timeline_now: string;
```

- [ ] **Step 2: Add the Spanish values**

In the `es:` object, immediately after its `map_layer_satellite:` value line, add:

```ts
    timeline_label: 'Línea de tiempo',
    timeline_play: 'Reproducir',
    timeline_pause: 'Pausar',
    timeline_prev: 'Cuadro anterior',
    timeline_next: 'Cuadro siguiente',
    timeline_now: 'Ahora',
```

- [ ] **Step 3: Add the English values**

In the `en:` object, immediately after its `map_layer_satellite:` value line, add:

```ts
    timeline_label: 'Timeline',
    timeline_play: 'Play',
    timeline_pause: 'Pause',
    timeline_prev: 'Previous frame',
    timeline_next: 'Next frame',
    timeline_now: 'Now',
```

- [ ] **Step 4: Verify types compile**

Run: `npm run type-check`
Expected: PASS (exit 0).

- [ ] **Step 5: Commit**

```bash
git add src/i18n/ui.ts
git commit -m "feat(maps): i18n strings for the timeline scrubber"
```

---

### Task 2: `maptimeline.ts` — pure frame-selection + label logic (TDD)

**Files:**
- Create: `src/lib/maptimeline.ts`
- Test: `src/lib/maptimeline.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/maptimeline.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  framesForLayer,
  defaultFrameIndex,
  clampIndex,
  frameOffsetMinutes,
  seekIndexForIso,
} from './maptimeline';
import type { RainviewerData } from './maplayers';

const rv: RainviewerData = {
  host: 'https://h',
  frames: [
    { time: 1000, path: '/r/a' },
    { time: 2000, path: '/r/b' },
    { time: 3000, path: '/r/c' },
  ],
  satelliteFrames: [{ time: 5000, path: '/s/a' }],
};

describe('framesForLayer', () => {
  it('returns radar frames for radar, satellite frames for satellite, [] otherwise', () => {
    expect(framesForLayer(rv, 'radar')).toBe(rv.frames);
    expect(framesForLayer(rv, 'satellite')).toBe(rv.satelliteFrames);
    expect(framesForLayer(rv, 'base')).toEqual([]);
    expect(framesForLayer(null, 'radar')).toEqual([]);
  });
});

describe('clampIndex', () => {
  it('clamps into range; -1 for empty', () => {
    expect(clampIndex(-3, 3)).toBe(0);
    expect(clampIndex(9, 3)).toBe(2);
    expect(clampIndex(1, 3)).toBe(1);
    expect(clampIndex(0, 0)).toBe(-1);
  });
});

describe('defaultFrameIndex', () => {
  it('is the newest frame at or before now', () => {
    expect(defaultFrameIndex(rv.frames, 2500)).toBe(1);
    expect(defaultFrameIndex(rv.frames, 3000)).toBe(2);
  });
  it('is the first frame when all are in the future', () => {
    expect(defaultFrameIndex(rv.frames, 500)).toBe(0);
  });
  it('is -1 for an empty list', () => {
    expect(defaultFrameIndex([], 999)).toBe(-1);
  });
});

describe('frameOffsetMinutes', () => {
  it('is signed rounded minutes from now (0 at now)', () => {
    expect(frameOffsetMinutes({ time: 2000, path: 'x' }, 2000)).toBe(0);
    expect(frameOffsetMinutes({ time: 1100, path: 'x' }, 2000)).toBe(-15);
    expect(frameOffsetMinutes({ time: 2600, path: 'x' }, 2000)).toBe(10);
  });
});

describe('seekIndexForIso', () => {
  it('finds the frame closest to the ISO time', () => {
    const iso = new Date(2100 * 1000).toISOString();
    expect(seekIndexForIso(rv.frames, iso, 9999)).toBe(1);
  });
  it('falls back to defaultFrameIndex for null/invalid ISO', () => {
    expect(seekIndexForIso(rv.frames, null, 2500)).toBe(1);
    expect(seekIndexForIso(rv.frames, 'not-a-date', 3000)).toBe(2);
  });
  it('is -1 for an empty list', () => {
    expect(seekIndexForIso([], '2020-01-01T00:00:00.000Z', 0)).toBe(-1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/maptimeline.test.ts`
Expected: FAIL — cannot resolve `./maptimeline`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/maptimeline.ts`:

```ts
// Pure, DOM-free timeline frame-selection helpers for the /mapa scrubber.
import type { RadarFrame, RainviewerData } from './maplayers';

/** Frames backing the timeline for the active layer (empty for base/no data). */
export function framesForLayer(rv: RainviewerData | null, layerId: string): RadarFrame[] {
  if (!rv) return [];
  if (layerId === 'radar') return rv.frames;
  if (layerId === 'satellite') return rv.satelliteFrames;
  return [];
}

/** Clamp `i` into [0, len-1]; -1 when there are no frames. */
export function clampIndex(i: number, len: number): number {
  if (len <= 0) return -1;
  if (i < 0) return 0;
  if (i > len - 1) return len - 1;
  return i;
}

/** Index of the newest frame at or before `nowSeconds`; 0 if all future; -1 if empty. */
export function defaultFrameIndex(frames: RadarFrame[], nowSeconds: number): number {
  if (frames.length === 0) return -1;
  let best = -1;
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].time <= nowSeconds && (best === -1 || frames[i].time > frames[best].time)) {
      best = i;
    }
  }
  return best === -1 ? 0 : best;
}

/** Signed, rounded minutes between a frame and `nowSeconds` (0 == now). */
export function frameOffsetMinutes(frame: RadarFrame, nowSeconds: number): number {
  return Math.round((frame.time - nowSeconds) / 60);
}

/**
 * Index of the frame closest to `iso`. Falls back to `defaultFrameIndex`
 * when `iso` is null/empty/unparseable. -1 for an empty list.
 */
export function seekIndexForIso(
  frames: RadarFrame[],
  iso: string | null,
  nowSeconds: number,
): number {
  if (frames.length === 0) return -1;
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return defaultFrameIndex(frames, nowSeconds);
  const target = ms / 1000;
  let best = 0;
  let bestDelta = Math.abs(frames[0].time - target);
  for (let i = 1; i < frames.length; i++) {
    const d = Math.abs(frames[i].time - target);
    if (d < bestDelta) {
      best = i;
      bestDelta = d;
    }
  }
  return best;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/maptimeline.test.ts`
Expected: PASS (all green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/maptimeline.ts src/lib/maptimeline.test.ts
git commit -m "feat(maps): pure timeline frame-selection module with tests"
```

---

### Task 3: `/mapa` — frame-aware rendering + timeline scrubber (no playback yet)

**Files:**
- Modify: `src/pages/mapa.astro`

> UI/MapLibre wiring — untested by unit tests per repo convention; verified via `npm run type-check` + `npm run build`. Anchors match by content (post-Slice-3 line numbers approximate). Playback (play/pause loop) is intentionally Task 4 — this task ships prev/next/range/label + hash-`t` persistence + restore-on-load.

- [ ] **Step 1: Add the timeline markup**

In `src/pages/mapa.astro`, replace the existing `#mapmsg` paragraph block:

```astro
    <p
      id="mapmsg"
      aria-live="polite"
      class="absolute bottom-3 left-1/2 z-10 hidden -translate-x-1/2 rounded-lg bg-white/95 px-3 py-1.5 text-xs text-gray-700 shadow dark:bg-gray-900/95 dark:text-gray-300"
    >
    </p>
```

with (the message moves up to make room for the timeline; a new timeline bar is added):

```astro
    <p
      id="mapmsg"
      aria-live="polite"
      class="absolute bottom-20 left-1/2 z-10 hidden -translate-x-1/2 rounded-lg bg-white/95 px-3 py-1.5 text-xs text-gray-700 shadow dark:bg-gray-900/95 dark:text-gray-300"
    >
    </p>
    <div
      id="timeline"
      class="absolute bottom-3 left-1/2 z-10 hidden -translate-x-1/2 flex items-center gap-2 rounded-lg bg-white/95 px-3 py-2 text-sm shadow dark:bg-gray-900/95"
      role="group"
      aria-label={t.timeline_label}
    >
      <button
        id="tl-prev"
        type="button"
        aria-label={t.timeline_prev}
        class="rounded px-2 py-1 hover:bg-blue-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-blue-400/10"
        >‹</button
      >
      <button
        id="tl-play"
        type="button"
        aria-label={t.timeline_play}
        aria-pressed="false"
        class="rounded px-2 py-1 hover:bg-blue-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 dark:hover:bg-blue-400/10"
        >▶</button
      >
      <button
        id="tl-next"
        type="button"
        aria-label={t.timeline_next}
        class="rounded px-2 py-1 hover:bg-blue-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-blue-400/10"
        >›</button
      >
      <input
        id="tl-range"
        type="range"
        min="0"
        max="0"
        value="0"
        class="w-40 accent-blue-600"
        aria-label={t.timeline_label}
      />
      <span id="tl-time" class="w-28 text-right tabular-nums text-gray-700 dark:text-gray-300"></span>
    </div>
```

- [ ] **Step 2: Update the maplayers/maptimeline imports**

In the `<script>`, replace this exact import block:

```ts
    import {
      LAYERS,
      getLayer as getLayerDef,
      RADAR_LEGEND,
      parseRainviewerManifest,
      latestFrame,
      rainviewerTileUrl,
      type RainviewerData,
    } from '../lib/maplayers';
```

with:

```ts
    import {
      LAYERS,
      getLayer as getLayerDef,
      RADAR_LEGEND,
      parseRainviewerManifest,
      rainviewerTileUrl,
      type RadarFrame,
      type RainviewerData,
    } from '../lib/maplayers';
    import {
      framesForLayer,
      defaultFrameIndex,
      clampIndex,
      frameOffsetMinutes,
      seekIndexForIso,
    } from '../lib/maptimeline';
```

> `latestFrame` is removed from the import because Task 3 replaces its only use with the timeline index logic.

- [ ] **Step 3: Replace `addWeatherRaster` with explicit-frame rendering**

Replace this exact function:

```ts
    function addWeatherRaster(layerId: string): boolean {
      if (!rvData) return false;
      const isSatellite = layerId === 'satellite';
      const frames = isSatellite ? rvData.satelliteFrames : rvData.frames;
      const frame = latestFrame(frames, Math.floor(Date.now() / 1000));
      if (!frame) return false;
      const tileUrl = isSatellite
        ? rainviewerTileUrl(rvData.host, frame, { color: 0, snow: false })
        : rainviewerTileUrl(rvData.host, frame);
      removeWeatherRaster();
      map.addSource(RV_SOURCE, {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        attribution: '© RainViewer',
      });
      map.addLayer({
        id: RV_LAYER,
        type: 'raster',
        source: RV_SOURCE,
        paint: { 'raster-opacity': rvOpacity },
      });
      return true;
    }
```

with:

```ts
    function showWeatherFrame(layerId: string, frame: RadarFrame): void {
      if (!rvData) return;
      const tileUrl =
        layerId === 'satellite'
          ? rainviewerTileUrl(rvData.host, frame, { color: 0, snow: false })
          : rainviewerTileUrl(rvData.host, frame);
      removeWeatherRaster();
      map.addSource(RV_SOURCE, {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        attribution: '© RainViewer',
      });
      map.addLayer({
        id: RV_LAYER,
        type: 'raster',
        source: RV_SOURCE,
        paint: { 'raster-opacity': rvOpacity },
      });
    }
```

- [ ] **Step 4: Add timeline state + helpers**

Immediately AFTER the `let rvOpacity = getLayerDef('radar')?.defaultOpacity ?? 0.8;` line, add:

```ts
    let tlFrames: RadarFrame[] = [];
    let frameIndex = -1;
    let activeFrameIso: string | null = null;
    let pendingSeekIso: string | null = initial.t;

    const tlEl = document.getElementById('timeline');
    const tlRange = document.getElementById('tl-range') as HTMLInputElement | null;
    const tlTime = document.getElementById('tl-time');

    function frameLabel(frame: RadarFrame): string {
      const off = frameOffsetMinutes(frame, Math.floor(Date.now() / 1000));
      const clock = new Date(frame.time * 1000).toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const rel = off === 0 ? t.timeline_now : off < 0 ? `${off} min` : `+${off} min`;
      return `${clock} · ${rel}`;
    }

    function applyFrame(i: number): void {
      const idx = clampIndex(i, tlFrames.length);
      if (idx < 0) return;
      frameIndex = idx;
      const fr = tlFrames[idx];
      showWeatherFrame(activeLayer, fr);
      activeFrameIso = new Date(fr.time * 1000).toISOString();
      if (tlRange) {
        tlRange.max = String(tlFrames.length - 1);
        tlRange.value = String(idx);
      }
      if (tlTime) tlTime.textContent = frameLabel(fr);
      syncHash();
    }

    function showTimeline(show: boolean): void {
      tlEl?.classList.toggle('hidden', !show);
    }
```

- [ ] **Step 5: Make `syncHash` persist the active frame**

Replace the `syncHash` function:

```ts
    function syncHash(): void {
      const c = map.getCenter();
      const state: MapHashState = {
        lat: c.lat,
        lng: c.lng,
        zoom: map.getZoom(),
        layer: activeLayer,
        t: null,
      };
      history.replaceState(null, '', buildMapHash(state));
    }
```

with:

```ts
    function syncHash(): void {
      const c = map.getCenter();
      const state: MapHashState = {
        lat: c.lat,
        lng: c.lng,
        zoom: map.getZoom(),
        layer: activeLayer,
        t: activeLayer === 'base' ? null : activeFrameIso,
      };
      history.replaceState(null, '', buildMapHash(state));
    }
```

- [ ] **Step 6: Rework `setActiveLayer` to drive the timeline**

Replace this exact function:

```ts
    function setActiveLayer(id: string): void {
      const def = getLayerDef(id);
      if (!def) return;
      if (def.kind === 'raster-tile') {
        rvOpacity = def.defaultOpacity;
        if (opacityEl) opacityEl.value = String(Math.round(rvOpacity * 100));
        if (!rvData || !addWeatherRaster(id)) {
          showMsg(t.map_layer_unavailable);
          activeLayer = 'base';
          removeWeatherRaster();
          refreshLayerButtons();
          syncHash();
          return;
        }
      } else {
        removeWeatherRaster();
      }
      activeLayer = id;
      refreshLayerButtons();
      syncHash();
    }
```

with:

```ts
    function setActiveLayer(id: string): void {
      const def = getLayerDef(id);
      if (!def) return;
      if (def.kind === 'raster-tile') {
        rvOpacity = def.defaultOpacity;
        if (opacityEl) opacityEl.value = String(Math.round(rvOpacity * 100));
        const frames = framesForLayer(rvData, id);
        if (!rvData || frames.length === 0) {
          showMsg(t.map_layer_unavailable);
          activeLayer = 'base';
          removeWeatherRaster();
          tlFrames = [];
          frameIndex = -1;
          activeFrameIso = null;
          showTimeline(false);
          refreshLayerButtons();
          syncHash();
          return;
        }
        activeLayer = id;
        tlFrames = frames;
        const now = Math.floor(Date.now() / 1000);
        const idx = seekIndexForIso(frames, pendingSeekIso, now);
        pendingSeekIso = null;
        showTimeline(true);
        refreshLayerButtons();
        applyFrame(idx >= 0 ? idx : defaultFrameIndex(frames, now));
        return;
      }
      removeWeatherRaster();
      activeLayer = id;
      tlFrames = [];
      frameIndex = -1;
      activeFrameIso = null;
      showTimeline(false);
      refreshLayerButtons();
      syncHash();
    }
```

> `applyFrame` calls `syncHash`, so the raster path does not call `syncHash` again. The base/non-raster path keeps its explicit `syncHash()`.

- [ ] **Step 7: Wire prev / next / range controls**

Immediately AFTER the existing `opacityEl` block (the `if (opacityEl) { ... }` that ends just before the `q?.addEventListener('input', ...)` line), add:

```ts
    document.getElementById('tl-prev')?.addEventListener('click', () => {
      if (tlFrames.length) applyFrame(frameIndex - 1);
    });
    document.getElementById('tl-next')?.addEventListener('click', () => {
      if (tlFrames.length) applyFrame(frameIndex + 1);
    });
    tlRange?.addEventListener('input', () => {
      if (tlFrames.length) applyFrame(Number(tlRange.value));
    });
```

- [ ] **Step 8: Verify no stale `addWeatherRaster` / `latestFrame` references remain**

Run: `grep -n "addWeatherRaster\|latestFrame" src/pages/mapa.astro`
Expected: ZERO matches (its only caller, `setActiveLayer`, was rewritten in Step 6 to use `framesForLayer`/`applyFrame`/`showWeatherFrame`). If any remain, they are bugs from an incomplete edit — fix them to use the new functions; do not reintroduce `latestFrame`.

- [ ] **Step 9: Verify types compile**

Run: `npm run type-check`
Expected: PASS (exit 0).

- [ ] **Step 10: Verify the static build succeeds**

Run: `npm run build`
Expected: PASS — `dist/mapa/index.html` produced (pre-existing MapLibre chunk-size warning expected, not an error).

- [ ] **Step 11: Commit**

```bash
git add src/pages/mapa.astro
git commit -m "feat(maps): timeline scrubber (prev/next/range) + shareable frame, restore-on-load"
```

---

### Task 4: `/mapa` — timeline playback (play/pause, reduced-motion gated)

**Files:**
- Modify: `src/pages/mapa.astro`

> Adds the play/pause loop on top of Task 3's scrubber. `prefers-reduced-motion` disables autoplay (manual scrub only) per the spec.

- [ ] **Step 1: Add playback state + control wiring**

Immediately AFTER the three timeline control listeners added in Task 3 Step 7 (`tl-prev`/`tl-next`/`tl-range`), add:

```ts
    let tlPlaying = false;
    let tlTimer = 0;
    const tlReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tlPlayBtn = document.getElementById('tl-play') as HTMLButtonElement | null;

    function tlStop(): void {
      tlPlaying = false;
      if (tlTimer) {
        window.clearInterval(tlTimer);
        tlTimer = 0;
      }
      if (tlPlayBtn) {
        tlPlayBtn.setAttribute('aria-pressed', 'false');
        tlPlayBtn.setAttribute('aria-label', t.timeline_play);
        tlPlayBtn.textContent = '▶';
      }
    }

    function tlStart(): void {
      if (tlReducedMotion || tlFrames.length < 2) return;
      tlPlaying = true;
      if (tlPlayBtn) {
        tlPlayBtn.setAttribute('aria-pressed', 'true');
        tlPlayBtn.setAttribute('aria-label', t.timeline_pause);
        tlPlayBtn.textContent = '⏸';
      }
      tlTimer = window.setInterval(() => {
        const next = frameIndex + 1 >= tlFrames.length ? 0 : frameIndex + 1;
        applyFrame(next);
      }, 700);
    }

    if (tlReducedMotion && tlPlayBtn) {
      tlPlayBtn.disabled = true;
      tlPlayBtn.title = t.timeline_play;
    }

    tlPlayBtn?.addEventListener('click', () => {
      if (tlPlaying) tlStop();
      else tlStart();
    });
```

- [ ] **Step 2: Stop playback when leaving a raster layer or seeking manually**

In `setActiveLayer`, in the non-raster/base branch, add `tlStop();` immediately before the existing `removeWeatherRaster();` call in that branch (the branch that begins after the `return;` of the raster path — the lines `removeWeatherRaster(); activeLayer = id; tlFrames = [];` ...). The branch becomes:

```ts
      tlStop();
      removeWeatherRaster();
      activeLayer = id;
      tlFrames = [];
      frameIndex = -1;
      activeFrameIso = null;
      showTimeline(false);
      refreshLayerButtons();
      syncHash();
```

Also, in the raster-path failure branch (the `if (!rvData || frames.length === 0) { ... }` block inside `setActiveLayer`), add `tlStop();` immediately after `activeLayer = 'base';` so a failed activation also halts any running playback.

Additionally, make manual stepping stop playback: change the three Task-3 listeners (`tl-prev`, `tl-next`, `tl-range`) so each calls `tlStop();` before `applyFrame(...)`. The block becomes:

```ts
    document.getElementById('tl-prev')?.addEventListener('click', () => {
      if (tlFrames.length) {
        tlStop();
        applyFrame(frameIndex - 1);
      }
    });
    document.getElementById('tl-next')?.addEventListener('click', () => {
      if (tlFrames.length) {
        tlStop();
        applyFrame(frameIndex + 1);
      }
    });
    tlRange?.addEventListener('input', () => {
      if (tlFrames.length) {
        tlStop();
        applyFrame(Number(tlRange.value));
      }
    });
```

> `tlStop`/`tlStart`/`tlPlayBtn` are declared after these listeners in source order but are only *referenced* inside click/input callbacks that fire at user-interaction time (well after module evaluation), so the forward reference is safe — the same pattern the file already uses for `opacityEl`/`setActiveLayer`. Do not reorder declarations.

- [ ] **Step 3: Verify types compile**

Run: `npm run type-check`
Expected: PASS (exit 0).

- [ ] **Step 4: Verify the static build succeeds**

Run: `npm run build`
Expected: PASS — `dist/mapa/index.html` produced.

- [ ] **Step 5: Commit**

```bash
git add src/pages/mapa.astro
git commit -m "feat(maps): timeline playback (play/pause) gated by prefers-reduced-motion"
```

---

### Task 5: Extend the e2e suite for the timeline

**Files:**
- Modify: `e2e/mapa.spec.ts`

- [ ] **Step 1: Give the mocked manifest multiple radar frames spanning past→forecast**

In `e2e/mapa.spec.ts`, replace the `radar` portion of `RAINVIEWER_MANIFEST` so it has several frames (the `satellite` portion stays as-is from Slice 3). Replace this exact fragment inside the `JSON.stringify({ ... })`:

```ts
  radar: {
    past: [{ time: 1779130800, path: '/v2/radar/test' }],
    nowcast: [],
  },
```

with:

```ts
  radar: {
    past: [
      { time: 1779130200, path: '/v2/radar/p1' },
      { time: 1779130500, path: '/v2/radar/p2' },
      { time: 1779130800, path: '/v2/radar/p3' },
    ],
    nowcast: [{ time: 1779131100, path: '/v2/radar/f1' }],
  },
```

> The Slice-2 radar test only asserts `#legend li` count = 4 (from `RADAR_LEGEND`) and the Slice-3 satellite test asserts no legend — neither depends on the radar frame count, so both still pass.

- [ ] **Step 2: Add the timeline test**

In `e2e/mapa.spec.ts`, inside the existing `test.describe('mapa page', ...)` block, add this test after the satellite test:

```ts
  test('timeline appears for radar and the range scrubs frames', async ({ page }) => {
    await page.route('**/api.rainviewer.com/public/weather-maps.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: RAINVIEWER_MANIFEST }),
    );
    await page.route('**/tilecache.rainviewer.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG }),
    );

    await page.goto('mapa/');
    await page.waitForResponse('**/api.rainviewer.com/public/weather-maps.json');

    // Timeline is hidden until a raster layer is active.
    await expect(page.locator('#timeline')).toBeHidden();

    await page.locator('#layerbtn-radar').click();
    await expect(page.locator('#timeline')).toBeVisible();

    const range = page.locator('#tl-range');
    // 4 radar frames (3 past + 1 nowcast) → max index 3.
    await expect(range).toHaveAttribute('max', '3');
    const label = page.locator('#tl-time');
    const before = await label.textContent();

    // Step to the first (oldest) frame via the prev button.
    await page.locator('#tl-prev').click();
    await expect(range).toHaveValue('0');
    await expect(label).not.toHaveText(before ?? '');

    // Switching back to Base hides the timeline.
    await page.locator('#layerbtn-base').click();
    await expect(page.locator('#timeline')).toBeHidden();
  });
```

- [ ] **Step 3: Run the e2e suite**

Run: `npm run test:e2e -- mapa.spec.ts`
Expected: PASS — all tests (Slice-1 smoke, Slice-2 radar, Slice-3 satellite, new timeline), 0 skipped. If Playwright browsers are missing, run `npx playwright install chromium` first. Both the manifest and tiles are mocked, so this must pass deterministically; do NOT weaken assertions or skip without pasted evidence of a genuine environment block.

- [ ] **Step 4: Commit**

```bash
git add e2e/mapa.spec.ts
git commit -m "test(maps): deterministic e2e for the timeline scrubber"
```

---

## Self-Review

- **Spec coverage (Slice 4):** past→now→forecast scrubber (Task 2 `framesForLayer`/`defaultFrameIndex` over the already-merged radar past+nowcast & satellite frames; Task 3 range/prev/next) ✓; playback + play/pause (Task 4) ✓; `prefers-reduced-motion` disables autoplay, manual scrub only (Task 4: `tlReducedMotion` gates `tlStart`, play button disabled) ✓; selected frame in the URL hash + restore on load (Task 3: `syncHash` writes `activeFrameIso`; `seekIndexForIso(pendingSeekIso)` on first activation; `maphash` already parses/builds `t`) ✓; works for the active raster layer radar OR satellite (Task 2 `framesForLayer`; Task 3 `setActiveLayer`) ✓; timeline hidden for base / when no frames (Task 3 `showTimeline`) ✓; keyless (reuses Slice-2/3 RainViewer data, no new fetch) ✓; Spanish-first i18n (Task 1) ✓; pure logic TDD, UI untested per convention (Task 2 vs 3–4) ✓; a11y (role=group, aria-label, aria-pressed play, focus rings, disabled+title under reduced motion) ✓; non-blocking failure reuses Slice-2/3 `map_layer_unavailable` path (Task 3 `setActiveLayer` failure branch) ✓. Wind/temp/humidity/pressure (Slice 5) and sunlight (Slice 6) remain out of scope.
- **Placeholder scan:** none — every code/command step is concrete; the only conditional (Task 5 Step 3) requires pasted evidence and should not trigger because manifest+tiles are fully mocked.
- **Type consistency:** `framesForLayer`/`defaultFrameIndex`/`clampIndex`/`frameOffsetMinutes`/`seekIndexForIso` are defined in Task 2 and consumed with identical signatures in Task 3; `RadarFrame`/`RainviewerData` imported from `maplayers` (existing exports); `latestFrame` import removed in Task 3 Step 2 and its sole use replaced (Task 3 Step 3, verified by the Step 8 grep); `showWeatherFrame`/`applyFrame`/`showTimeline`/`tlFrames`/`frameIndex`/`activeFrameIso`/`pendingSeekIso`/`tlRange`/`tlTime`/`tlEl` defined once (Task 3) and reused consistently; `tlStop`/`tlStart`/`tlPlaying`/`tlTimer`/`tlPlayBtn`/`tlReducedMotion` defined once (Task 4) and referenced only inside Task-4-added handlers and the Task-3 listeners updated in Task 4 Step 2; `maphash`'s `t` field (string|null) matches `activeFrameIso` (string|null) and `initial.t`; i18n keys `timeline_*` added in Task 1 are the only new keys referenced by Tasks 3–4.

# Weather Maps — Slice 3: Satellite + Clouds Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a keyless RainViewer satellite-infrared (cloud) raster layer to `/mapa`, selectable from the existing layer rail alongside Base and Radar.

**Architecture:** Reuse the Slice-2 layer engine. Extend the pure `src/lib/maplayers.ts` to also parse RainViewer `satellite.infrared` frames and register a `satellite` layer; the registry stays the single source of truth (maphash already validates against `LAYER_IDS`, so `satellite` becomes shareable automatically). Generalize the radar-only MapLibre wiring in `src/pages/mapa.astro` into one weather-raster path that selects frames + tile palette per layer. UI/MapLibre wiring stays untested per repo convention; pure logic is TDD.

**Tech Stack:** Astro 6, TypeScript, Tailwind 4, Vitest, MapLibre GL JS, RainViewer free public API (keyless; `satellite.infrared` frames in the same `weather-maps.json`, same tile-URL form with color scheme `0`).

Spec: `docs/superpowers/specs/2026-05-18-weather-maps-design.md` (Slice 3 of the build sequence). Builds on Slices 1–2 (merged to `main`).

---

### Task 1: i18n string for the satellite layer

**Files:**
- Modify: `src/i18n/ui.ts`

- [ ] **Step 1: Extend the `UiStrings` interface**

In `src/i18n/ui.ts`, add this field to the `UiStrings` interface immediately after the existing `map_layer_radar: string;` line:

```ts
  map_layer_satellite: string;
```

- [ ] **Step 2: Add the Spanish value**

In the `es:` object, immediately after its `map_layer_radar:` value line, add:

```ts
    map_layer_satellite: 'Satélite',
```

- [ ] **Step 3: Add the English value**

In the `en:` object, immediately after its `map_layer_radar:` value line, add:

```ts
    map_layer_satellite: 'Satellite',
```

- [ ] **Step 4: Verify types compile**

Run: `npm run type-check`
Expected: PASS (exit 0).

- [ ] **Step 5: Commit**

```bash
git add src/i18n/ui.ts
git commit -m "feat(maps): i18n string for satellite layer"
```

---

### Task 2: `maplayers.ts` — parse satellite frames + register the satellite layer (TDD)

**Files:**
- Modify: `src/lib/maplayers.ts`
- Modify: `src/lib/maplayers.test.ts`

> The RainViewer `weather-maps.json` includes `satellite: { infrared: [{ time, path }] }` (same shape as radar frames; may be empty). We add `satelliteFrames` to `RainviewerData`, keep the existing radar `frames` field unchanged (Slice-2 callers/tests must keep passing), and register a `satellite` layer.

- [ ] **Step 1: Add the failing tests**

In `src/lib/maplayers.test.ts`, add these tests. Put the registry test inside the existing `describe('layer registry', ...)` block (after its existing tests), and append the new `describe('satellite frames', ...)` block at the end of the file:

```ts
  it('registers a satellite raster layer with full default opacity', () => {
    expect(LAYER_IDS).toEqual(['base', 'radar', 'satellite']);
    const sat = getLayer('satellite');
    expect(sat?.kind).toBe('raster-tile');
    expect(sat?.labelKey).toBe('map_layer_satellite');
    expect(sat?.defaultOpacity).toBe(1);
  });
```

```ts
describe('satellite frames', () => {
  it('parseRainviewerManifest collects satellite.infrared into satelliteFrames', () => {
    const data = parseRainviewerManifest({
      host: 'https://tilecache.rainviewer.com',
      radar: { past: [{ time: 10, path: '/v2/radar/r1' }], nowcast: [] },
      satellite: {
        infrared: [
          { time: 30, path: '/v2/satellite/s2' },
          { time: 20, path: '/v2/satellite/s1' },
        ],
      },
    });
    expect(data).not.toBeNull();
    expect(data!.frames.map((f) => f.path)).toEqual(['/v2/radar/r1']);
    expect(data!.satelliteFrames.map((f) => f.path)).toEqual([
      '/v2/satellite/s1',
      '/v2/satellite/s2',
    ]);
  });

  it('returns null only when BOTH radar and satellite frames are empty', () => {
    expect(
      parseRainviewerManifest({
        host: 'h',
        radar: { past: [], nowcast: [] },
        satellite: { infrared: [] },
      }),
    ).toBeNull();
    const satOnly = parseRainviewerManifest({
      host: 'h',
      radar: { past: [], nowcast: [] },
      satellite: { infrared: [{ time: 1, path: '/v2/satellite/s' }] },
    });
    expect(satOnly).not.toBeNull();
    expect(satOnly!.frames).toEqual([]);
    expect(satOnly!.satelliteFrames).toEqual([{ time: 1, path: '/v2/satellite/s' }]);
  });

  it('defaults satelliteFrames to [] when satellite key is absent', () => {
    const data = parseRainviewerManifest({
      host: 'h',
      radar: { past: [{ time: 1, path: '/v2/radar/r' }], nowcast: [] },
    });
    expect(data!.satelliteFrames).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/lib/maplayers.test.ts`
Expected: FAIL — `satellite` not in `LAYER_IDS`/registry; `satelliteFrames` undefined.

- [ ] **Step 3: Extend the registry**

In `src/lib/maplayers.ts`:

(a) Replace:
```ts
export type LayerId = 'base' | 'radar';

export const LAYER_IDS = ['base', 'radar'] as const;
```
with:
```ts
export type LayerId = 'base' | 'radar' | 'satellite';

export const LAYER_IDS = ['base', 'radar', 'satellite'] as const;
```

(b) Replace the `LAYERS` array:
```ts
export const LAYERS: LayerDef[] = [
  { id: 'base', labelKey: 'map_layer_base', kind: 'base', defaultOpacity: 1 },
  { id: 'radar', labelKey: 'map_layer_radar', kind: 'raster-tile', defaultOpacity: 0.8 },
];
```
with:
```ts
export const LAYERS: LayerDef[] = [
  { id: 'base', labelKey: 'map_layer_base', kind: 'base', defaultOpacity: 1 },
  { id: 'radar', labelKey: 'map_layer_radar', kind: 'raster-tile', defaultOpacity: 0.8 },
  { id: 'satellite', labelKey: 'map_layer_satellite', kind: 'raster-tile', defaultOpacity: 1 },
];
```

- [ ] **Step 4: Extend the manifest parsing**

In `src/lib/maplayers.ts`:

(a) Replace the `RainviewerData` interface:
```ts
export interface RainviewerData {
  host: string;
  frames: RadarFrame[];
}
```
with:
```ts
export interface RainviewerData {
  host: string;
  /** Radar/precipitation frames. */
  frames: RadarFrame[];
  /** Satellite-infrared (cloud) frames. */
  satelliteFrames: RadarFrame[];
}
```

(b) Replace the body of `parseRainviewerManifest` (keep the signature/JSDoc line) so it also collects satellite frames and returns null only when both are empty:
```ts
export function parseRainviewerManifest(json: unknown): RainviewerData | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  const radar = o.radar as Record<string, unknown> | undefined;
  if (typeof o.host !== 'string' || !radar) return null;
  const frames = [...collectFrames(radar.past), ...collectFrames(radar.nowcast)].sort(
    (a, b) => a.time - b.time,
  );
  const satellite = o.satellite as Record<string, unknown> | undefined;
  const satelliteFrames = collectFrames(satellite?.infrared).sort((a, b) => a.time - b.time);
  if (frames.length === 0 && satelliteFrames.length === 0) return null;
  return { host: o.host, frames, satelliteFrames };
}
```

- [ ] **Step 5: Run the full maplayers + maphash suites**

Run: `npx vitest run src/lib/maplayers.test.ts src/lib/maphash.test.ts`
Expected: PASS — new satellite tests pass; all Slice-2 tests (radar parse, `frames`, null/malformed cases, `latestFrame`, `rainviewerTileUrl`, registry base/radar) still pass; maphash still green.

- [ ] **Step 6: Run the full suite + type-check**

Run: `npm test && npm run type-check`
Expected: PASS (full unit suite + types; `LayerId` widening compiles everywhere).

- [ ] **Step 7: Commit**

```bash
git add src/lib/maplayers.ts src/lib/maplayers.test.ts
git commit -m "feat(maps): parse RainViewer satellite frames + register satellite layer"
```

---

### Task 3: Generalize the `/mapa` raster wiring to serve radar OR satellite

**Files:**
- Modify: `src/pages/mapa.astro`

> UI/MapLibre wiring — untested by unit tests per repo convention; verified via `npm run type-check` + `npm run build`. The layer rail buttons are already generated by iterating `LAYERS`, so the satellite button appears automatically once Task 2 lands; this task makes activating it actually add the satellite tiles. Anchors are matched by content (line numbers approximate, post-Slice-2).

- [ ] **Step 1: Replace the radar-specific source/layer state + `removeRadar`/`addRadar` with a generic weather-raster path**

In `src/pages/mapa.astro`, find this exact Slice-2 block:

```ts
    const RV_SOURCE = 'rv-radar';
    const RV_LAYER = 'rv-radar-layer';
    let activeLayer: string = 'base';
    let rvData: RainviewerData | null = null;
    let rvOpacity = getLayerDef('radar')?.defaultOpacity ?? 0.8;

    function removeRadar(): void {
      if (map.getLayer(RV_LAYER)) map.removeLayer(RV_LAYER);
      if (map.getSource(RV_SOURCE)) map.removeSource(RV_SOURCE);
    }

    function addRadar(): boolean {
      if (!rvData) return false;
      const frame = latestFrame(rvData.frames, Math.floor(Date.now() / 1000));
      if (!frame) return false;
      removeRadar();
      map.addSource(RV_SOURCE, {
        type: 'raster',
        tiles: [rainviewerTileUrl(rvData.host, frame)],
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

and replace the entire block above with:

```ts
    const RV_SOURCE = 'wx-raster';
    const RV_LAYER = 'wx-raster-layer';
    let activeLayer: string = 'base';
    let rvData: RainviewerData | null = null;
    let rvOpacity = getLayerDef('radar')?.defaultOpacity ?? 0.8;

    function removeWeatherRaster(): void {
      if (map.getLayer(RV_LAYER)) map.removeLayer(RV_LAYER);
      if (map.getSource(RV_SOURCE)) map.removeSource(RV_SOURCE);
    }

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

- [ ] **Step 2: Update `renderLegend`/`refreshLayerButtons` call site is already correct — no change needed**

Confirm (read only, no edit) that `refreshLayerButtons()` still calls `renderLegend(activeLayer === 'radar')`. Satellite has no intensity legend, so legend correctly stays hidden for satellite. (If this line differs from `renderLegend(activeLayer === 'radar')`, STOP and report — the plan assumed the Slice-2 form.)

- [ ] **Step 3: Update `setActiveLayer` to use the generic raster path + per-layer opacity default**

In `src/pages/mapa.astro`, find this exact Slice-2 function:

```ts
    function setActiveLayer(id: string): void {
      const def = getLayerDef(id);
      if (!def) return;
      if (def.kind === 'raster-tile') {
        if (!rvData || !addRadar()) {
          showMsg(t.map_layer_unavailable);
          activeLayer = 'base';
          removeRadar();
          refreshLayerButtons();
          syncHash();
          return;
        }
      } else {
        removeRadar();
      }
      activeLayer = id;
      refreshLayerButtons();
      syncHash();
    }
```

and replace it with:

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

> Note: `opacityEl` is declared later in the Slice-2 file with `const opacityEl = document.getElementById('opacity') ...`. `setActiveLayer` only references `opacityEl` at call time (it is invoked from button clicks and the on-load restore, both after `opacityEl` is initialized), so this is safe — the same forward-reference pattern the file already uses for `activeLayer`/`syncHash`.

- [ ] **Step 4: Verify no stale `addRadar`/`removeRadar` references remain**

Run: `grep -n "addRadar\|removeRadar" src/pages/mapa.astro`
Expected: ZERO matches (all renamed to `addWeatherRaster`/`removeWeatherRaster`). If any remain, replace them with the generic names (a bare `removeRadar()` → `removeWeatherRaster()`); there must be no `addRadar(` call left — the only former caller was `setActiveLayer`, replaced in Step 3.

- [ ] **Step 5: Verify types compile**

Run: `npm run type-check`
Expected: PASS (exit 0).

- [ ] **Step 6: Verify the static build succeeds**

Run: `npm run build`
Expected: PASS — `dist/mapa/index.html` produced (the pre-existing MapLibre chunk-size warning is expected, not an error).

- [ ] **Step 7: Commit**

```bash
git add src/pages/mapa.astro
git commit -m "feat(maps): generalize raster wiring to serve radar or satellite layer"
```

---

### Task 4: Extend the e2e suite for the satellite layer

**Files:**
- Modify: `e2e/mapa.spec.ts`

- [ ] **Step 1: Give the mocked manifest a satellite frame**

In `e2e/mapa.spec.ts`, replace the `RAINVIEWER_MANIFEST` constant:

```ts
const RAINVIEWER_MANIFEST = JSON.stringify({
  version: '2.0',
  generated: 1779138033,
  host: 'https://tilecache.rainviewer.com',
  radar: {
    past: [{ time: 1779130800, path: '/v2/radar/test' }],
    nowcast: [],
  },
  satellite: { infrared: [] },
});
```

with:

```ts
const RAINVIEWER_MANIFEST = JSON.stringify({
  version: '2.0',
  generated: 1779138033,
  host: 'https://tilecache.rainviewer.com',
  radar: {
    past: [{ time: 1779130800, path: '/v2/radar/test' }],
    nowcast: [],
  },
  satellite: { infrared: [{ time: 1779130800, path: '/v2/satellite/test' }] },
});
```

> The Slice-2 `radar layer button…` test only asserts `#legend li` count = 4 (from the `RADAR_LEGEND` constant) and is unaffected by adding a satellite frame.

- [ ] **Step 2: Add the satellite test**

In `e2e/mapa.spec.ts`, inside the existing `test.describe('mapa page', ...)` block, add this test after the `radar layer button activates and shows legend` test:

```ts
  test('satellite layer button activates without an intensity legend', async ({ page }) => {
    await page.route('**/api.rainviewer.com/public/weather-maps.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: RAINVIEWER_MANIFEST }),
    );
    await page.route('**/tilecache.rainviewer.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG }),
    );

    await page.goto('mapa/');

    const satBtn = page.locator('#layerbtn-satellite');
    await expect(satBtn).toBeVisible();
    await page.waitForResponse('**/api.rainviewer.com/public/weather-maps.json');
    await expect(satBtn).toBeEnabled();

    await satBtn.click();

    await expect(satBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#layerbtn-radar')).toHaveAttribute('aria-pressed', 'false');
    // Satellite is imagery, not intensity-coded: the radar legend stays hidden.
    await expect(page.locator('#legend')).toBeHidden();
  });
```

- [ ] **Step 3: Run the e2e suite**

Run: `npm run test:e2e -- mapa.spec.ts`
Expected: PASS — all three tests (Slice-1 smoke, Slice-2 radar, new satellite), 0 skipped. If Playwright browsers are missing, run `npx playwright install chromium` first. If this satellite test fails for a reason other than a product bug (e.g. sandbox blocking despite the route mock — which should NOT happen since both the manifest and tiles are mocked), debug the mock/match patterns; do NOT weaken assertions and do NOT skip without pasted evidence that it is a genuine environment block.

- [ ] **Step 4: Commit**

```bash
git add e2e/mapa.spec.ts
git commit -m "test(maps): deterministic e2e for satellite layer activation"
```

---

## Self-Review

- **Spec coverage (Slice 3):** keyless satellite/clouds layer via RainViewer satellite-infrared (Tasks 2, 3) ✓; appears in the existing layer rail, one primary layer at a time, mutually exclusive with radar (Task 3 reuses Slice-2 `setActiveLayer`/single source+layer; covered by the e2e mutual-exclusion assertion in Task 4) ✓; per-layer opacity default (satellite defaultOpacity 1; Task 3 sets `rvOpacity`/slider on activation) ✓; shareable via URL hash (registry `LAYER_IDS` now includes `satellite`; maphash validates against it with no change needed — Task 2) ✓; failing source → non-blocking `map_layer_unavailable`, map keeps working (Task 3 reuses the Slice-2 failure path) ✓; keyless, no key/secret ✓; Spanish-first i18n (Task 1) ✓; pure logic TDD, UI untested per convention (Tasks 2 vs 3) ✓; satellite has no intensity legend (Task 3 Step 2 confirms legend stays radar-only; Task 4 asserts it) ✓. Timeline (Slice 4), wind/temp/humidity/pressure (Slice 5), sunlight (Slice 6) remain out of scope.
- **Placeholder scan:** none — every code/command step is concrete; the only conditional (Task 4 Step 3) requires pasted evidence and should not trigger because manifest+tiles are fully mocked.
- **Type consistency:** `LayerId`/`LAYER_IDS`/`LAYERS`/`getLayer` extended consistently (Task 2) and consumed in `mapa.astro` via the unchanged `getLayerDef` alias (Task 3); `RainviewerData` gains `satelliteFrames` (Task 2) which `addWeatherRaster` reads (Task 3); `rainviewerTileUrl` reused with `{ color: 0, snow: false }` for satellite (existing Slice-2 signature, Task 3); i18n key `map_layer_satellite` added in Task 1 and referenced via the registry `labelKey` rendered by the existing `buildLayerButtons`/`t[...]` path; renamed `addWeatherRaster`/`removeWeatherRaster`/`RV_SOURCE='wx-raster'`/`RV_LAYER='wx-raster-layer'` are defined and used consistently within Task 3 (Step 4 greps to guarantee no stale `addRadar`/`removeRadar`).

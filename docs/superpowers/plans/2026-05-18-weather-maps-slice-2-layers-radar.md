# Weather Maps — Slice 2: Layer Engine + Radar/Precipitation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a typed layer registry and a keyless RainViewer radar/precipitation raster layer (rain vs snow) to `/mapa`, with a layer rail, opacity slider, legend, and shareable active-layer state.

**Architecture:** All testable logic lives in a new pure, DOM-free `src/lib/maplayers.ts` (layer registry + RainViewer manifest parsing + frame selection + tile-URL builder + legend data) with colocated Vitest. `src/lib/maphash.ts` is refactored to take its valid-layer list from the registry (single source of truth). `src/pages/mapa.astro` gains UI + MapLibre wiring (untested per repo convention). No timeline — the latest available "now" frame only (timeline is Slice 4).

**Tech Stack:** Astro 6, TypeScript, Tailwind 4, Vitest, MapLibre GL JS, RainViewer free public API (keyless: `https://api.rainviewer.com/public/weather-maps.json`, tiles `https://tilecache.rainviewer.com`).

Spec: `docs/superpowers/specs/2026-05-18-weather-maps-design.md` (Slice 2 of the build sequence). Builds on Slice 1 (PR #57): `src/pages/mapa.astro`, `src/lib/maphash.ts`, `src/lib/mappins.ts`.

---

### Task 1: i18n strings for the layer rail and legend

**Files:**
- Modify: `src/i18n/ui.ts`

> Slice 1 already added `map_layer_base` and `map_layer_unavailable`. This adds the remaining layer/legend strings.

- [ ] **Step 1: Extend the `UiStrings` interface**

In `src/i18n/ui.ts`, add these fields to the `UiStrings` interface immediately after the existing `map_layer_unavailable: string;` line:

```ts
  map_layers: string;
  map_layer_radar: string;
  map_opacity: string;
  legend_light: string;
  legend_moderate: string;
  legend_heavy: string;
  legend_snow: string;
```

- [ ] **Step 2: Add the Spanish values**

In the `es:` object, immediately after its `map_layer_unavailable:` value line, add:

```ts
    map_layers: 'Capas',
    map_layer_radar: 'Radar',
    map_opacity: 'Opacidad',
    legend_light: 'Ligera',
    legend_moderate: 'Moderada',
    legend_heavy: 'Intensa',
    legend_snow: 'Nieve',
```

- [ ] **Step 3: Add the English values**

In the `en:` object, immediately after its `map_layer_unavailable:` value line, add:

```ts
    map_layers: 'Layers',
    map_layer_radar: 'Radar',
    map_opacity: 'Opacity',
    legend_light: 'Light',
    legend_moderate: 'Moderate',
    legend_heavy: 'Heavy',
    legend_snow: 'Snow',
```

- [ ] **Step 4: Verify types compile**

Run: `npm run type-check`
Expected: PASS (exit 0).

- [ ] **Step 5: Commit**

```bash
git add src/i18n/ui.ts
git commit -m "feat(maps): i18n strings for layer rail and radar legend"
```

---

### Task 2: `maplayers.ts` — layer registry + legend (TDD)

**Files:**
- Create: `src/lib/maplayers.ts`
- Test: `src/lib/maplayers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/maplayers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { LAYERS, LAYER_IDS, getLayer, RADAR_LEGEND } from './maplayers';

describe('layer registry', () => {
  it('exposes base and radar layers with stable ids', () => {
    expect(LAYER_IDS).toEqual(['base', 'radar']);
    expect(LAYERS.map((l) => l.id)).toEqual(['base', 'radar']);
  });

  it('base is kind "base", radar is a raster-tile with <1 default opacity', () => {
    const base = getLayer('base');
    const radar = getLayer('radar');
    expect(base?.kind).toBe('base');
    expect(base?.defaultOpacity).toBe(1);
    expect(radar?.kind).toBe('raster-tile');
    expect(radar?.labelKey).toBe('map_layer_radar');
    expect(radar?.defaultOpacity).toBeGreaterThan(0);
    expect(radar?.defaultOpacity).toBeLessThanOrEqual(1);
  });

  it('getLayer returns undefined for an unknown id', () => {
    expect(getLayer('bogus')).toBeUndefined();
  });
});

describe('RADAR_LEGEND', () => {
  it('has light/moderate/heavy/snow stops with hex colors and i18n keys', () => {
    expect(RADAR_LEGEND.map((s) => s.labelKey)).toEqual([
      'legend_light',
      'legend_moderate',
      'legend_heavy',
      'legend_snow',
    ]);
    for (const stop of RADAR_LEGEND) {
      expect(stop.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/maplayers.test.ts`
Expected: FAIL — cannot resolve `./maplayers`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/maplayers.ts`:

```ts
// Pure, DOM-free weather-map layer registry + legend data.
// Single source of truth for valid layer ids (consumed by maphash.ts).

export type LayerId = 'base' | 'radar';

export const LAYER_IDS = ['base', 'radar'] as const;

export interface LayerDef {
  id: LayerId;
  /** Key into UiStrings for the rail button label. */
  labelKey: string;
  kind: 'base' | 'raster-tile';
  /** Initial raster opacity (0..1); 1 for the base map. */
  defaultOpacity: number;
}

export const LAYERS: LayerDef[] = [
  { id: 'base', labelKey: 'map_layer_base', kind: 'base', defaultOpacity: 1 },
  { id: 'radar', labelKey: 'map_layer_radar', kind: 'raster-tile', defaultOpacity: 0.8 },
];

export function getLayer(id: string): LayerDef | undefined {
  return LAYERS.find((l) => l.id === id);
}

export interface LegendStop {
  /** Key into UiStrings for the stop label. */
  labelKey: string;
  /** Representative hex color, illustrative of the RainViewer palette. */
  color: string;
}

export const RADAR_LEGEND: LegendStop[] = [
  { labelKey: 'legend_light', color: '#7ad151' },
  { labelKey: 'legend_moderate', color: '#f9d423' },
  { labelKey: 'legend_heavy', color: '#e8431f' },
  { labelKey: 'legend_snow', color: '#9fd9ff' },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/maplayers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/maplayers.ts src/lib/maplayers.test.ts
git commit -m "feat(maps): layer registry and radar legend module with tests"
```

---

### Task 3: `maplayers.ts` — RainViewer manifest parsing, frame selection, tile URL (TDD)

**Files:**
- Modify: `src/lib/maplayers.ts`
- Modify: `src/lib/maplayers.test.ts`

> The real RainViewer manifest shape (verified live): top-level `{ version, generated, host: "https://tilecache.rainviewer.com", radar: { past: [{time,path}], nowcast: [{time,path}] }, satellite: { infrared: [...] } }`. `nowcast` may be empty. Tile URL form: `{host}{path}/{size}/{z}/{x}/{y}/{color}/{smooth}_{snow}.png`.

- [ ] **Step 1: Add the failing tests**

Append to `src/lib/maplayers.test.ts` (after the existing `describe` blocks, before EOF):

```ts
import { parseRainviewerManifest, latestFrame, rainviewerTileUrl } from './maplayers';

const sampleManifest = {
  version: '2.0',
  generated: 1779138033,
  host: 'https://tilecache.rainviewer.com',
  radar: {
    past: [
      { time: 1779130800, path: '/v2/radar/aaa' },
      { time: 1779131400, path: '/v2/radar/bbb' },
    ],
    nowcast: [{ time: 1779139000, path: '/v2/radar/ccc' }],
  },
  satellite: { infrared: [] },
};

describe('parseRainviewerManifest', () => {
  it('merges past + nowcast frames in time order', () => {
    const data = parseRainviewerManifest(sampleManifest);
    expect(data).not.toBeNull();
    expect(data!.host).toBe('https://tilecache.rainviewer.com');
    expect(data!.frames.map((f) => f.path)).toEqual([
      '/v2/radar/aaa',
      '/v2/radar/bbb',
      '/v2/radar/ccc',
    ]);
  });

  it('returns null for malformed / empty input', () => {
    expect(parseRainviewerManifest(null)).toBeNull();
    expect(parseRainviewerManifest({})).toBeNull();
    expect(parseRainviewerManifest({ host: 'x', radar: { past: [], nowcast: [] } })).toBeNull();
    expect(parseRainviewerManifest({ host: 5, radar: { past: [{ time: 1, path: 'p' }] } })).toBeNull();
  });

  it('skips entries missing time/path', () => {
    const data = parseRainviewerManifest({
      host: 'h',
      radar: { past: [{ time: 1, path: 'ok' }, { time: 2 }, { path: 'nope' }] },
    });
    expect(data!.frames).toEqual([{ time: 1, path: 'ok' }]);
  });
});

describe('latestFrame', () => {
  const frames = [
    { time: 100, path: 'a' },
    { time: 200, path: 'b' },
    { time: 300, path: 'c' },
  ];
  it('returns the newest frame at or before now', () => {
    expect(latestFrame(frames, 250)).toEqual({ time: 200, path: 'b' });
    expect(latestFrame(frames, 300)).toEqual({ time: 300, path: 'c' });
  });
  it('falls back to the first frame when all are in the future', () => {
    expect(latestFrame(frames, 50)).toEqual({ time: 100, path: 'a' });
  });
  it('returns null for an empty list', () => {
    expect(latestFrame([], 999)).toBeNull();
  });
});

describe('rainviewerTileUrl', () => {
  const frame = { time: 1, path: '/v2/radar/aaa' };
  it('builds a default tile template with literal z/x/y placeholders', () => {
    expect(rainviewerTileUrl('https://h.com', frame)).toBe(
      'https://h.com/v2/radar/aaa/256/{z}/{x}/{y}/4/1_1.png',
    );
  });
  it('honors size/color and disabling smooth/snow', () => {
    expect(
      rainviewerTileUrl('https://h.com', frame, { size: 512, color: 2, smooth: false, snow: false }),
    ).toBe('https://h.com/v2/radar/aaa/512/{z}/{x}/{y}/2/0_0.png');
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/lib/maplayers.test.ts`
Expected: FAIL — `parseRainviewerManifest`, `latestFrame`, `rainviewerTileUrl` not exported.

- [ ] **Step 3: Add the implementation**

Append to `src/lib/maplayers.ts`:

```ts
export interface RadarFrame {
  time: number;
  path: string;
}

export interface RainviewerData {
  host: string;
  frames: RadarFrame[];
}

function collectFrames(arr: unknown): RadarFrame[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(
      (f): f is RadarFrame =>
        !!f &&
        typeof (f as RadarFrame).time === 'number' &&
        typeof (f as RadarFrame).path === 'string',
    )
    .map((f) => ({ time: f.time, path: f.path }));
}

/** Validate + flatten a RainViewer weather-maps.json document. Null if unusable. */
export function parseRainviewerManifest(json: unknown): RainviewerData | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  const radar = o.radar as Record<string, unknown> | undefined;
  if (typeof o.host !== 'string' || !radar) return null;
  const frames = [...collectFrames(radar.past), ...collectFrames(radar.nowcast)].sort(
    (a, b) => a.time - b.time,
  );
  if (frames.length === 0) return null;
  return { host: o.host, frames };
}

/** Newest frame at or before `nowSeconds`; first frame if all are future; null if none. */
export function latestFrame(frames: RadarFrame[], nowSeconds: number): RadarFrame | null {
  if (frames.length === 0) return null;
  let best: RadarFrame | null = null;
  for (const f of frames) {
    if (f.time <= nowSeconds && (!best || f.time > best.time)) best = f;
  }
  return best ?? frames[0];
}

export interface TileOpts {
  size?: 256 | 512;
  color?: number;
  smooth?: boolean;
  snow?: boolean;
}

/** RainViewer raster tile template (keeps literal {z}/{x}/{y} for MapLibre). */
export function rainviewerTileUrl(host: string, frame: RadarFrame, opts: TileOpts = {}): string {
  const size = opts.size ?? 256;
  const color = opts.color ?? 4;
  const smooth = opts.smooth === false ? 0 : 1;
  const snow = opts.snow === false ? 0 : 1;
  return `${host}${frame.path}/${size}/{z}/{x}/{y}/${color}/${smooth}_${snow}.png`;
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run src/lib/maplayers.test.ts`
Expected: PASS (registry + RainViewer suites all green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/maplayers.ts src/lib/maplayers.test.ts
git commit -m "feat(maps): RainViewer manifest parsing, frame selection, tile URL builder"
```

---

### Task 4: Refactor `maphash.ts` to use the registry as the layer source of truth (TDD)

**Files:**
- Modify: `src/lib/maphash.ts`
- Modify: `src/lib/maphash.test.ts`

> Slice 1 hardcoded `KNOWN_LAYERS = ['base']` with a comment "Extended in later slices." Slice 2 makes the registry the single source of truth so `radar` becomes a valid shareable layer.

- [ ] **Step 1: Add a failing test for the new valid layer**

In `src/lib/maphash.test.ts`, inside the existing `describe('parseMapHash', ...)` block, add this test after the existing `'falls back to base for an unknown layer id'` test:

```ts
  it('preserves a registry-known layer id (radar)', () => {
    expect(parseMapHash('#view=0,0,3z&layer=radar').layer).toBe('radar');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/maphash.test.ts`
Expected: FAIL — `layer` comes back as `'base'` because the slice-1 `KNOWN_LAYERS` only contains `'base'`.

- [ ] **Step 3: Refactor `maphash.ts` to import the registry's ids**

In `src/lib/maphash.ts`:

(a) Add this import at the top of the file (after the header comment, before `export interface MapHashState`):

```ts
import { LAYER_IDS } from './maplayers';
```

(b) Delete the slice-1 `KNOWN_LAYERS` declaration block (the `/** Layer ids valid in Slice 1. Extended in later slices. */` comment and the `export const KNOWN_LAYERS = ['base'] as const;` line).

(c) In `parseMapHash`, replace the layer-validation line:

```ts
  const layer = (KNOWN_LAYERS as readonly string[]).includes(rawLayer) ? rawLayer : 'base';
```

with:

```ts
  const layer = (LAYER_IDS as readonly string[]).includes(rawLayer) ? rawLayer : 'base';
```

- [ ] **Step 4: Run the maphash + maplayers suites to verify all pass**

Run: `npx vitest run src/lib/maphash.test.ts src/lib/maplayers.test.ts`
Expected: PASS — including the new `radar` test; the existing `'bogus' → base` test still passes.

- [ ] **Step 5: Run the full suite + type-check (no `KNOWN_LAYERS` consumers left)**

Run: `npm test && npm run type-check`
Expected: PASS. (If type-check reports an unused/missing `KNOWN_LAYERS` reference anywhere, it means a consumer existed — search `grep -rn KNOWN_LAYERS src/` and report; in Slice 1 the only definition was in `maphash.ts` with no other importers.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/maphash.ts src/lib/maphash.test.ts
git commit -m "refactor(maps): maphash validates layers against the registry (adds radar)"
```

---

### Task 5: Wire the layer rail, RainViewer radar, opacity, legend into `/mapa`

**Files:**
- Modify: `src/pages/mapa.astro`

> UI/MapLibre wiring — untested by unit tests per repo convention; verified via `npm run type-check` + `npm run build`. Anchors below refer to the Slice 1 file (192 lines).

- [ ] **Step 1: Add the layer-rail / legend markup**

In `src/pages/mapa.astro`, immediately AFTER the search/locate controls `</div>` (the closing tag of the `<div class="absolute right-3 top-3 z-10 flex gap-2">` block — Slice 1 line 31) and BEFORE the `<p id="mapmsg"` element, insert:

```astro
    <div
      class="absolute left-3 top-14 z-10 w-44 space-y-2 rounded-lg bg-white/95 p-3 text-sm shadow dark:bg-gray-900/95"
      aria-label={t.map_layers}
      role="group"
    >
      <p class="font-semibold text-gray-700 dark:text-gray-200">{t.map_layers}</p>
      <div id="layerbtns" class="flex flex-col gap-1"></div>
      <div id="opacitywrap" class="hidden pt-1">
        <label for="opacity" class="block text-xs text-gray-600 dark:text-gray-400"
          >{t.map_opacity}</label
        >
        <input
          id="opacity"
          type="range"
          min="0"
          max="100"
          class="w-full accent-blue-600"
          aria-label={t.map_opacity}
        />
      </div>
      <ul id="legend" class="hidden space-y-1 pt-1 text-xs text-gray-700 dark:text-gray-300"></ul>
    </div>
```

- [ ] **Step 2: Import the registry in the page script**

In the `<script>` block, add to the existing import group (after the `import { parseMapHash, ... } from '../lib/maphash';` line):

```ts
    import {
      LAYERS,
      getLayer,
      RADAR_LEGEND,
      parseRainviewerManifest,
      latestFrame,
      rainviewerTileUrl,
      type RainviewerData,
    } from '../lib/maplayers';
```

- [ ] **Step 3: Add layer state + the radar source/layer ids near the other state**

In the `<script>`, immediately AFTER the Slice 1 line `let searchGen = 0;` (it sits just before the `q?.addEventListener('input', ...)` block), add:

```ts
    const RV_SOURCE = 'rv-radar';
    const RV_LAYER = 'rv-radar-layer';
    let activeLayer: string = 'base';
    let rvData: RainviewerData | null = null;
    let rvOpacity = getLayer('radar')?.defaultOpacity ?? 0.8;

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

    function renderLegend(show: boolean): void {
      const el = document.getElementById('legend');
      if (!el) return;
      if (!show) {
        el.classList.add('hidden');
        el.innerHTML = '';
        return;
      }
      el.innerHTML = RADAR_LEGEND.map(
        (s) =>
          `<li class="flex items-center gap-2"><span class="inline-block h-3 w-3 rounded-sm" style="background:${esc(
            s.color,
          )}"></span>${esc(t[s.labelKey as keyof typeof t])}</li>`,
      ).join('');
      el.classList.remove('hidden');
    }

    function refreshLayerButtons(): void {
      for (const def of LAYERS) {
        const btn = document.getElementById(`layerbtn-${def.id}`);
        if (btn) btn.setAttribute('aria-pressed', String(def.id === activeLayer));
      }
      document
        .getElementById('opacitywrap')
        ?.classList.toggle('hidden', getLayer(activeLayer)?.kind !== 'raster-tile');
      renderLegend(activeLayer === 'radar');
    }

    function setActiveLayer(id: string): void {
      const def = getLayer(id);
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

    function buildLayerButtons(): void {
      const wrap = document.getElementById('layerbtns');
      if (!wrap) return;
      for (const def of LAYERS) {
        const btn = document.createElement('button');
        btn.id = `layerbtn-${def.id}`;
        btn.type = 'button';
        btn.setAttribute('aria-pressed', String(def.id === activeLayer));
        btn.className =
          'rounded px-2 py-1 text-left hover:bg-blue-500/10 aria-pressed:bg-blue-500/15 aria-pressed:font-semibold dark:hover:bg-blue-400/10';
        btn.textContent = t[def.labelKey as keyof typeof t];
        btn.addEventListener('click', () => setActiveLayer(def.id));
        wrap.appendChild(btn);
      }
    }
    buildLayerButtons();

    const opacityEl = document.getElementById('opacity') as HTMLInputElement | null;
    if (opacityEl) {
      opacityEl.value = String(Math.round(rvOpacity * 100));
      opacityEl.addEventListener('input', () => {
        rvOpacity = Number(opacityEl.value) / 100;
        if (map.getLayer(RV_LAYER)) map.setPaintProperty(RV_LAYER, 'raster-opacity', rvOpacity);
      });
    }
```

- [ ] **Step 4: Make `syncHash()` persist the active layer**

In `src/pages/mapa.astro`, in `syncHash()`, replace the line:

```ts
        layer: 'base',
```

with:

```ts
        layer: activeLayer,
```

- [ ] **Step 5: Fetch the manifest and restore the active layer on load**

In `src/pages/mapa.astro`, replace the entire Slice 1 `map.on('load', ...)` block:

```ts
    map.on('load', () => {
      renderPins();
    });
```

with:

```ts
    map.on('load', () => {
      renderPins();
      void (async () => {
        try {
          const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
          rvData = parseRainviewerManifest(await res.json());
        } catch {
          rvData = null;
        }
        const wanted = initial.layer;
        if (wanted && wanted !== 'base' && getLayer(wanted)) {
          setActiveLayer(wanted);
        }
      })();
    });
```

- [ ] **Step 6: Verify types compile**

Run: `npm run type-check`
Expected: PASS (exit 0). (`t[...as keyof typeof t]` indexing is typed because all legend/label keys exist on `UiStrings` from Task 1.)

- [ ] **Step 7: Verify the static build succeeds**

Run: `npm run build`
Expected: PASS — `dist/mapa/index.html` produced (one pre-existing MapLibre chunk-size warning is expected and not an error).

- [ ] **Step 8: Commit**

```bash
git add src/pages/mapa.astro
git commit -m "feat(maps): layer rail + RainViewer radar layer, opacity, legend, shareable layer"
```

---

### Task 6: Extend the e2e smoke test for the layer rail

**Files:**
- Modify: `e2e/mapa.spec.ts`

- [ ] **Step 1: Add a layer-rail test**

In `e2e/mapa.spec.ts`, inside the existing `test.describe('mapa page', ...)` block, add this test after the existing smoke test:

```ts
  test('radar layer button activates and shows legend', async ({ page }) => {
    await page.goto('mapa/');
    const radarBtn = page.locator('#layerbtn-radar');
    await expect(radarBtn).toBeVisible();
    await expect(page.locator('#legend')).toBeHidden();
    await radarBtn.click();
    // The radar button reflects active state and the legend becomes visible
    // (this asserts UI state only — no dependency on external tile pixels).
    await expect(radarBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#legend')).toBeVisible();
    await expect(page.locator('#legend li')).toHaveCount(4);
  });
```

- [ ] **Step 2: Run the e2e suite for this spec**

Run: `npm run test:e2e -- mapa.spec.ts`
Expected: PASS (both tests). If Playwright browsers are missing, run `npx playwright install chromium` first.

> If — and only if — this new test fails because the RainViewer manifest fetch is blocked by the sandbox and that genuinely prevents the radar button from activating (the button calls `setActiveLayer` which requires `rvData`), then: keep the original smoke test active, wrap ONLY this new `radar layer button…` test in `test.skip(...)` with the inline comment `// TODO(weather-maps): re-enable when RainViewer is reachable in CI/sandbox`, and report the exact failing output. Do NOT weaken assertions. Note: the legend is only shown after a successful `addRadar()`, so without network this test cannot pass; document clearly if skipped.

- [ ] **Step 3: Commit**

```bash
git add e2e/mapa.spec.ts
git commit -m "test(maps): e2e for radar layer activation + legend"
```

---

## Self-Review

- **Spec coverage (Slice 2):** layer registry (`maplayers.ts` — Task 2) ✓; RainViewer radar/precipitation, rain vs snow via `snow=1` palette option (Task 3, used by Task 5) ✓; legend mirroring zoom.earth Ligera/Moderada/Intensa/Nieve (Tasks 1, 2, 5) ✓; per-layer opacity slider (Task 5) ✓; one primary weather layer at a time + base (Task 5 `setActiveLayer` swaps) ✓; shareable active layer in URL hash (Task 4 makes `radar` valid; Task 5 syncs/restores) ✓; keyless (RainViewer public API, no key) ✓; failing source → non-blocking `map_layer_unavailable`, map keeps working (Task 5) ✓; Vitest on pure modules only (Tasks 2–4) ✓; Spanish-first i18n (Task 1) ✓; XSS-safe legend via `esc()` (Task 5) ✓. Timeline, satellite/clouds, field layers, sunlight remain later slices — intentionally absent.
- **Placeholder scan:** none — every code/command step is concrete; the only conditional is the documented, evidence-required e2e skip for sandbox-blocked RainViewer.
- **Type consistency:** `LAYER_IDS`/`LAYERS`/`getLayer`/`LayerDef`/`LegendStop`/`RADAR_LEGEND`/`RadarFrame`/`RainviewerData`/`parseRainviewerManifest`/`latestFrame`/`rainviewerTileUrl`/`TileOpts` defined in Tasks 2–3 and consumed with identical names in Tasks 4–5; `maphash.ts` imports `LAYER_IDS` (Task 4) which Task 2 exports; i18n keys used in Task 5 (`map_layers`, `map_layer_radar`, `map_opacity`, `legend_*`, plus Slice 1's `map_layer_base`, `map_layer_unavailable`) all added in Task 1; `RV_SOURCE`/`RV_LAYER`/`activeLayer`/`rvData`/`rvOpacity` are defined once and used consistently within Task 5.

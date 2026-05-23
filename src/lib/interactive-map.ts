/**
 * Interactive map factory — extracted from /mapa for re-use on the
 * home page and the forecast page.
 *
 * The /mapa page passes `mode: 'fullscreen'` to keep the legacy stable IDs
 * (#map, #mapq, #mapac, #layerbtn-*, #opacity, #legend, #timeline, …) so
 * the e2e suite (mapa.spec.ts) and the ?e2e=1 affordance keep working.
 *
 * Embedded instances pass a unique `mapId` (e.g. 'home-map', 'fc-map');
 * all selectors inside the factory are scoped via the supplied `els`
 * record so two map instances on the same DOM never collide.
 *
 * MapLibre itself is dynamic-imported inside `init()` so the home page
 * does not download the GL bundle until the map is in the viewport.
 */
import type maplibregl from 'maplibre-gl';
import type { FeatureCollection, Feature } from 'geojson';

import { parseMapHash, buildMapHash, type MapHashState } from './maphash';
import {
  LAYERS,
  getLayer as getLayerDef,
  RADAR_LEGEND,
  parseRainviewerManifest,
  rainviewerTileUrl,
  type RadarFrame,
  type RainviewerData,
} from './maplayers';
import {
  framesForLayer,
  defaultFrameIndex,
  clampIndex,
  frameOffsetMinutes,
  seekIndexForIso,
} from './maptimeline';
import {
  viewportGrid,
  buildFieldUrl,
  parseFieldResponse,
  fieldFrameIndex,
  tempColor,
  humidityColor,
  pressureColor,
  TEMP_LEGEND,
  HUMIDITY_LEGEND,
  PRESSURE_LEGEND,
  type FieldGrid,
  type LegendStop,
} from './mapfields';
import {
  MAX_WIND_MPS,
  windSpeed,
  windSpeedColor,
  WIND_LEGEND,
  encodeWindGrid,
  initParticlePositions,
  type WindPoint,
} from './mapwind';
import { buildWindUrl, parseWindResponse, type WindGrid } from './mapfields';
import { terminatorPolygon } from './mapsun';
import { presetPins, withUserPin, type MapPin } from './mappins';
import { cities } from '../data/cities';
import { geocode } from './geocode';
import { ui } from '../i18n/ui';
import { siteBase } from '../utils/paths';

export interface InteractiveMapElements {
  /** The container element MapLibre attaches to. Required. */
  container: HTMLElement;
  /** Search input (optional). */
  search?: HTMLInputElement | null;
  /** Autocomplete list (optional). */
  acList?: HTMLUListElement | null;
  /** Locate-me button (optional). */
  locate?: HTMLElement | null;
  /** Layer button wrapper, opacity slider, and legend (optional). */
  layerBtns?: HTMLElement | null;
  opacityWrap?: HTMLElement | null;
  opacity?: HTMLInputElement | null;
  legend?: HTMLElement | null;
  /** Timeline + status message (optional). */
  timeline?: HTMLElement | null;
  tlPrev?: HTMLElement | null;
  tlPlay?: HTMLButtonElement | null;
  tlNext?: HTMLElement | null;
  tlRange?: HTMLInputElement | null;
  tlTime?: HTMLElement | null;
  msg?: HTMLElement | null;
}

export interface InteractiveMapFeatures {
  layerRail?: boolean;
  timeline?: boolean;
  search?: boolean;
  locateButton?: boolean;
  presetPins?: boolean;
}

// ---------------------------------------------------------------------------
// Module-scoped shared cache + request coalescing for Open-Meteo / RainViewer.
// Shared across all map instances on the same page so the home embed, the
// /mapa overlay, and the forecast embed don't fire duplicate requests.
// Keyed by URL only (no method/body discrimination because all our requests
// are GETs).
// ---------------------------------------------------------------------------
const FETCH_CACHE_TTL_MS = 10 * 60 * 1000;
interface CacheEntry {
  ts: number;
  body: string;
  headers: Record<string, string>;
  status: number;
}
const fetchCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<Response>>();

function cachedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = typeof input === 'string' ? input : input.toString();
  const method = (init?.method ?? 'GET').toUpperCase();
  // Don't cache non-GET (we don't have any, but be safe).
  if (method !== 'GET') return window.fetch(input as RequestInfo, init);

  const cached = fetchCache.get(url);
  if (cached && Date.now() - cached.ts < FETCH_CACHE_TTL_MS) {
    return Promise.resolve(
      new Response(cached.body, {
        status: cached.status,
        headers: cached.headers,
      }),
    );
  }

  // Coalesce concurrent identical requests.
  const existing = inFlight.get(url);
  if (existing) {
    // Each caller needs its own Response (body can only be read once),
    // so clone before handing back.
    return existing.then((r) => r.clone());
  }

  const p = window.fetch(input as RequestInfo, init).then(async (res) => {
    // Only cache 2xx so we re-try on 429 / 5xx next call instead of pinning
    // the failure for 10 minutes.
    if (res.ok) {
      try {
        const clone = res.clone();
        const body = await clone.text();
        const headers: Record<string, string> = {};
        clone.headers.forEach((v, k) => {
          headers[k] = v;
        });
        fetchCache.set(url, {
          ts: Date.now(),
          body,
          headers,
          status: res.status,
        });
      } catch {
        /* ignore — fall through and return the original */
      }
    }
    return res;
  });
  inFlight.set(url, p);
  // Always remove from in-flight on settle so future calls don't get a stale
  // Promise after the cache also expires.
  p.finally(() => {
    if (inFlight.get(url) === p) inFlight.delete(url);
  });
  return p.then((r) => r.clone());
}

export interface InteractiveMapOptions {
  els: InteractiveMapElements;
  features: InteractiveMapFeatures;
  initialView?: { lat: number; lng: number; zoom: number };
  /** Layer to activate on first load. Defaults to 'base' (no overlay).
   *  When `useHash` is true and the URL hash specifies a layer, the hash wins.
   *  Use 'temperature' on the forecast embed so users see weather data
   *  near their location without a click. */
  initialLayer?: string;
  /** When true, parses location.hash + writes it back on moveend.
   *  /mapa = true, embeds = false. */
  useHash?: boolean;
  /** When true, exposes the MapLibre instance via window.__map if ?e2e=1.
   *  /mapa = true, embeds = false (only one instance should hold the global). */
  exposeE2eHook?: boolean;
  /** Add a maplibre attribution + nav control? Defaults to true. */
  controls?: boolean;
  /** When false, the map is non-interactive (no pan/zoom). Defaults to true. */
  interactive?: boolean;
  /** When false, marker click does NOT show a popup with a forecast link.
   *  Defaults to true. Set false for forecast page where only one preset pin is shown. */
  markerPopups?: boolean;
  lang?: 'es' | 'en';
}

export interface MapHandle {
  map: maplibregl.Map;
  destroy: () => void;
}

/**
 * Init the interactive map inside `els.container`. Returns a handle the
 * caller can `destroy()` on unmount (kept simple — none of the current
 * pages currently unmount, but the contract is clean).
 */
export async function initInteractiveMap(
  opts: InteractiveMapOptions,
): Promise<MapHandle> {
  const lang = opts.lang ?? 'es';
  const t = ui[lang];
  const base = siteBase();
  const features = opts.features;
  const useHash = opts.useHash ?? false;
  const exposeE2eHook = opts.exposeE2eHook ?? false;
  const controls = opts.controls ?? true;
  const interactive = opts.interactive ?? true;
  const markerPopups = opts.markerPopups ?? true;

  // Dynamic import of MapLibre — keeps the GL bundle out of pages until
  // this factory is actually invoked.
  const maplibreModule = await import('maplibre-gl');
  await import('maplibre-gl/dist/maplibre-gl.css');
  // The module's default export may not be present under strict TS dynamic
  // imports; the named exports are always available.
  const maplibre: typeof maplibregl =
    (maplibreModule as unknown as { default?: typeof maplibregl }).default ??
    (maplibreModule as unknown as typeof maplibregl);

  const deps = {
    // Module-scoped fetch with in-memory cache. Multiple map instances on the
    // same page (home embed + /mapa, or forecast embed) share the cache so we
    // don't repeatedly hammer Open-Meteo / RainViewer with the same request.
    // TTL = 10 min, matching the SDK's natural refresh interval. Coalescing
    // (one in-flight Promise per URL) prevents bursts when two layers ask for
    // overlapping data concurrently.
    fetch: cachedFetch,
    sleep: (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms)),
  };

  function esc(s: string): string {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showMsg(text: string): void {
    const el = opts.els.msg;
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    window.setTimeout(() => el.classList.add('hidden'), 4000);
  }

  function hideMsg(): void {
    opts.els.msg?.classList.add('hidden');
  }

  // ------------------------------------------------------------------
  // Initial view: optionally seeded from URL hash on /mapa, else opts.
  // ------------------------------------------------------------------
  const hashed = useHash ? parseMapHash(location.hash) : null;
  const initial = hashed ?? {
    lat: opts.initialView?.lat ?? 23.6,
    lng: opts.initialView?.lng ?? -102.5,
    zoom: opts.initialView?.zoom ?? 4.5,
    layer: null as string | null,
    t: null as string | null,
  };

  const map = new maplibre.Map({
    container: opts.els.container,
    center: [initial.lng, initial.lat],
    zoom: initial.zoom,
    interactive,
    // MapLibre's attributionControl typing is `false | AttributionControlOptions`;
    // pass `false` to suppress it, or omit (undefined) to use the default control.
    attributionControl: controls ? undefined : false,
    style: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap',
        },
      },
      layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
    },
  });

  if (controls) {
    map.addControl(new maplibre.NavigationControl({}), 'bottom-left');
  }

  let pins: MapPin[] = features.presetPins ? presetPins(cities) : [];
  const markers: maplibregl.Marker[] = [];

  function popupHtml(p: MapPin): string {
    const fc = `${base}forecast?lat=${p.lat}&lng=${p.lng}&name=${encodeURIComponent(p.name)}`;
    return (
      `<div class="text-sm"><strong>${esc(p.name)}</strong><br>` +
      `<a href="${esc(fc)}" class="text-blue-600 underline">${esc(t.map_popup_full_forecast)} →</a></div>`
    );
  }

  function renderPins(): void {
    while (markers.length) markers.pop()!.remove();
    for (const p of pins) {
      const marker = new maplibre.Marker({
        color: p.kind === 'preset' ? '#2563eb' : '#dc2626',
      }).setLngLat([p.lng, p.lat]);
      if (markerPopups) {
        const popup = new maplibre.Popup({ offset: 24 }).setHTML(popupHtml(p));
        marker.setPopup(popup);
      }
      marker.addTo(map);
      markers.push(marker);
    }
  }

  function syncHash(): void {
    if (!useHash) return;
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

  let hashTimer = 0;
  map.on('moveend', () => {
    if (!useHash) return;
    window.clearTimeout(hashTimer);
    hashTimer = window.setTimeout(syncHash, 250);
  });

  map.on('moveend', () => {
    if (getLayerDef(activeLayer)?.kind !== 'field') return;
    window.clearTimeout(fieldResampleTimer);
    fieldResampleTimer = window.setTimeout(() => {
      void (async () => {
        const ok = await loadFieldGrid(activeLayer);
        if (!ok || !fieldGrid) return;
        tlFrames = fieldGrid.times.map((iso) => ({
          time: Math.floor(
            Date.parse(/[Zz]|[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + 'Z') /
              1000,
          ),
          path: '',
        }));
        applyFrame(frameIndex >= 0 ? frameIndex : 0);
      })();
    }, 500);
  });

  if (
    exposeE2eHook &&
    new URLSearchParams(location.search).get('e2e') === '1'
  ) {
    (window as unknown as { __map?: maplibregl.Map }).__map = map;
  }

  const initialCenter = map.getCenter();
  const initialZoom = map.getZoom();
  const firstPaintNudge = (): void => {
    try {
      map.resize();
      map.jumpTo({ center: initialCenter, zoom: initialZoom });
      // Force a layout-property recompute by flipping the basemap raster
      // layer visibility. This is the most reliable way to force MapLibre
      // to schedule a render frame; the bare triggerRepaint() / jumpTo()
      // duo isn't enough on stubborn cold loads (issue #124). Wrapping in
      // a separate try so a missing 'osm' layer (during teardown) doesn't
      // mask the other operations.
      try {
        if (map.getLayer('osm')) {
          map.setLayoutProperty('osm', 'visibility', 'none');
          map.setLayoutProperty('osm', 'visibility', 'visible');
        }
      } catch {
        /* best-effort */
      }
      map.triggerRepaint();
    } catch {
      /* best-effort */
    }
  };
  /** Brute-force first-paint nudger: triggers a repaint at multiple
   *  intervals after init. Some cold loads need the canvas to be hit
   *  4–5 times before the GL backing store actually paints (race between
   *  tile arrival, DOM layout, and the first render frame). The cost of
   *  N extra triggerRepaint() calls is essentially zero — they're no-ops
   *  once the buffer is dirty / a frame is already scheduled — but they
   *  cover the worst-case race. */
  const aggressiveNudge = (): void => {
    [60, 200, 400, 800, 1500, 2500].forEach((delay) => {
      window.setTimeout(firstPaintNudge, delay);
    });
  };
  /** Synthesize a tiny pointer-move sequence on the map canvas after init.
   *  The cold-load blank canvas (#124) is reliably resolved when the user
   *  clicks/moves the pointer anywhere on the map — that suggests
   *  MapLibre's pointer-event handler is the trigger that schedules the
   *  first paint frame the unprompted nudges miss. Replaying the same
   *  pointer trigger programmatically should defeat the race without
   *  user interaction. Tiny offset (1 px) so the synthetic move isn't a
   *  noticeable interaction. */
  const synthesizeMove = (): void => {
    try {
      const canvas = map.getCanvas();
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dispatch = (type: string, x: number, y: number): void => {
        canvas.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerType: 'mouse',
            clientX: x,
            clientY: y,
          }),
        );
        canvas.dispatchEvent(
          new MouseEvent(type === 'pointerdown' ? 'mousedown'
            : type === 'pointerup' ? 'mouseup'
            : type === 'pointermove' ? 'mousemove'
            : type, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
          }),
        );
      };
      dispatch('pointermove', cx, cy);
      dispatch('pointermove', cx + 1, cy + 1);
      dispatch('pointermove', cx, cy);
    } catch {
      /* synthetic-event dispatch is best-effort */
    }
  };
  map.on('load', () => {
    renderPins();
    window.requestAnimationFrame(firstPaintNudge);
    aggressiveNudge();
    // Replay the click/pointer trigger that resolves the cold-load blank
    // canvas (#124) when the user clicks the map. We can't tell what
    // pointer-event MapLibre uses to schedule the first frame in the
    // worst-case timing, so spread the synthetic moves across several
    // intervals after the nudges have run.
    [100, 300, 700, 1200].forEach((delay) => {
      window.setTimeout(synthesizeMove, delay);
    });
    syncBasemapTheme();
    observeThemeForBasemap();
    void (async () => {
      try {
        const res = await deps.fetch(
          'https://api.rainviewer.com/public/weather-maps.json',
        );
        rvData = parseRainviewerManifest(await res.json());
      } catch {
        rvData = null;
      }
      // Hash layer wins over the `initialLayer` opt (so deep-links to
      // /mapa#layer=radar still activate radar even when the caller's
      // initialLayer is 'temperature').
      const wanted = hashed?.layer ?? opts.initialLayer ?? null;
      if (wanted && wanted !== 'base' && getLayerDef(wanted)) {
        // Defer the layer activation by 700 ms so the basemap has time
        // to complete its first render pass before we add the field /
        // raster overlay layers. Without this, cold loads of the embed
        // (forecast / home) sometimes leave the GL backing store stale
        // because the overlay add competes with the first render frame.
        window.setTimeout(() => {
          void setActiveLayer(wanted);
        }, 700);
      }
    })();
  });
  map.once('idle', firstPaintNudge);

  // ResizeObserver — catches embed container size changes (sibling content
  // settling, responsive breakpoints).
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => firstPaintNudge());
    ro.observe(opts.els.container);
  }

  // ------------------------------------------------------------------
  // Dark basemap (CartoDB Dark Matter) when html.dark is set.
  // ------------------------------------------------------------------
  const OSM_TILES = ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'];
  const CARTO_DARK_TILES = [
    'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  ];

  let lastBasemapDark: boolean | null = null;
  function syncBasemapTheme(): void {
    const dark = document.documentElement.classList.contains('dark');
    if (dark === lastBasemapDark) return;
    const src = map.getSource('osm') as
      | maplibregl.RasterTileSource
      | undefined;
    if (!src || typeof src.setTiles !== 'function') return;
    try {
      src.setTiles(dark ? CARTO_DARK_TILES : OSM_TILES);
      const anySrc = src as unknown as { attribution?: string };
      anySrc.attribution = dark
        ? '© OpenStreetMap contributors © CARTO'
        : '© OpenStreetMap';
      lastBasemapDark = dark;
    } catch {
      /* retry on next mutation */
    }
  }

  let themeObserver: MutationObserver | null = null;
  function observeThemeForBasemap(): void {
    themeObserver = new MutationObserver(() => syncBasemapTheme());
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  function setUserPin(
    name: string,
    lat: number,
    lng: number,
    kind: 'search' | 'geo',
  ): void {
    pins = withUserPin(pins, { name, lat, lng, kind });
    renderPins();
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    map.flyTo({
      center: [lng, lat],
      zoom: Math.max(map.getZoom(), 9),
      animate: !reducedMotion,
    });
  }

  // ------------------------------------------------------------------
  // Search autocomplete (scoped to the supplied els.search / els.acList).
  // ------------------------------------------------------------------
  const q = features.search ? opts.els.search ?? null : null;
  const acList = features.search ? opts.els.acList ?? null : null;
  let qTimer = 0;
  let searchGen = 0;

  type GeoItem = {
    name: string;
    admin1?: string;
    country?: string;
    lat: number;
    lng: number;
    tz: string;
    population?: number;
    featureCode?: string;
  };
  let acResults: GeoItem[] = [];
  let acActive = -1;

  function closeAcList(): void {
    if (!acList || !q) return;
    acList.classList.add('hidden');
    acList.textContent = '';
    q.setAttribute('aria-expanded', 'false');
    q.removeAttribute('aria-activedescendant');
    acResults = [];
    acActive = -1;
  }

  function highlightAc(): void {
    if (!acList || !q) return;
    Array.from(acList.children).forEach((li, i) => {
      if (i === acActive) {
        li.classList.add('bg-gray-100', 'dark:bg-gray-800');
        li.setAttribute('aria-selected', 'true');
        q.setAttribute('aria-activedescendant', li.id);
      } else {
        li.classList.remove('bg-gray-100', 'dark:bg-gray-800');
        li.setAttribute('aria-selected', 'false');
      }
    });
    if (acActive < 0) q.removeAttribute('aria-activedescendant');
  }

  function selectAc(r: GeoItem): void {
    hideMsg();
    closeAcList();
    setUserPin(r.name, r.lat, r.lng, 'search');
  }

  function renderAcList(): void {
    if (!acList || !q) return;
    acList.textContent = '';
    acResults.forEach((r, i) => {
      const li = document.createElement('li');
      li.id = (acList.id || 'mapac') + '-' + i;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      li.className =
        'px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800';

      const primary = document.createElement('div');
      primary.className = 'flex items-center gap-2';

      const nameEl = document.createElement('span');
      nameEl.className = 'font-semibold text-gray-900 dark:text-gray-100';
      nameEl.textContent = r.name;
      primary.appendChild(nameEl);

      if (typeof r.population === 'number' && r.population >= 50000) {
        const badge = document.createElement('span');
        badge.className =
          'rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400';
        badge.textContent = 'ciudad';
        primary.appendChild(badge);
      }
      li.appendChild(primary);

      const sub = [r.admin1, r.country].filter(Boolean).join(' · ');
      if (sub) {
        const subEl = document.createElement('div');
        subEl.className = 'text-xs text-gray-500 dark:text-gray-400';
        subEl.textContent = sub;
        li.appendChild(subEl);
      }

      li.addEventListener('click', () => selectAc(r));
      acList.appendChild(li);
    });
    acList.classList.remove('hidden');
    q.setAttribute('aria-expanded', 'true');
    acActive = -1;
  }

  // ------------------------------------------------------------------
  // Weather layer state machine.
  // ------------------------------------------------------------------
  const RV_SOURCE = 'wx-raster';
  const RV_LAYER = 'wx-raster-layer';
  let activeLayer: string = 'base';
  let rvData: RainviewerData | null = null;
  let rvOpacity = getLayerDef('radar')?.defaultOpacity ?? 0.8;
  let tlFrames: RadarFrame[] = [];
  let frameIndex = -1;
  let activeFrameIso: string | null = null;
  let pendingSeekIso: string | null = hashed?.t ?? null;

  const tlEl = opts.els.timeline ?? null;
  const tlRange = opts.els.tlRange ?? null;
  const tlTime = opts.els.tlTime ?? null;

  function frameLabel(frame: RadarFrame): string {
    const off = frameOffsetMinutes(frame, Math.floor(Date.now() / 1000));
    const clock = new Date(frame.time * 1000).toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const rel =
      off === 0 ? t.timeline_now : off < 0 ? `${off} min` : `+${off} min`;
    return `${clock} · ${rel}`;
  }

  function applyFrame(i: number): void {
    const idx = clampIndex(i, tlFrames.length);
    if (idx < 0) return;
    frameIndex = idx;
    const fr = tlFrames[idx];
    if (getLayerDef(activeLayer)?.kind === 'particles') {
      showWindFrame(idx);
    } else if (getLayerDef(activeLayer)?.kind === 'field') {
      renderFieldFrame(idx);
    } else {
      showWeatherFrame(activeLayer, fr);
    }
    activeFrameIso = new Date(fr.time * 1000).toISOString();
    if (tlRange) {
      tlRange.max = String(tlFrames.length - 1);
      tlRange.value = String(idx);
    }
    if (tlTime) tlTime.textContent = frameLabel(fr);
    syncHash();
  }

  function showTimeline(show: boolean): void {
    if (!tlEl || !features.timeline) return;
    tlEl.classList.toggle('hidden', !show);
    tlEl.classList.toggle('flex', show);
  }

  const FIELD_SOURCE = 'wx-field';
  const FIELD_LAYER = 'wx-field-layer';
  let fieldGrid: FieldGrid | null = null;
  let fieldResampleTimer = 0;

  interface FieldConfig {
    hourlyVar: string;
    color: (v: number) => string;
  }
  const FIELD_CONFIGS: Record<string, FieldConfig> = {
    temperature: { hourlyVar: 'temperature_2m', color: tempColor },
    humidity: { hourlyVar: 'relative_humidity_2m', color: humidityColor },
    pressure: { hourlyVar: 'pressure_msl', color: pressureColor },
  };
  let fieldAbort: AbortController | null = null;

  const WIND_LAYER = 'wx-wind-layer';
  const WIND_CIRCLE_LAYER = 'wx-wind-circle';
  const WIND_CIRCLE_SOURCE = 'wx-wind-circle-src';
  const PARTICLE_TEX_SIZE = 64;
  const PARTICLE_COUNT = PARTICLE_TEX_SIZE * PARTICLE_TEX_SIZE;

  let windGrid: WindGrid | null = null;
  let windHourIndex = 0;
  const windReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  let windRaf = 0;
  let windTexDirty = true;

  const SUN_SOURCE_SOFT = 'wx-sun-src-soft';
  const SUN_SOURCE_OUTER = 'wx-sun-src-outer';
  const SUN_SOURCE_MID = 'wx-sun-src-mid';
  const SUN_SOURCE_INNER = 'wx-sun-src';
  const SUN_LAYER_SOFT = 'wx-sun-layer-soft';
  const SUN_LAYER_OUTER = 'wx-sun-layer-outer';
  const SUN_LAYER_MID = 'wx-sun-layer-mid';
  const SUN_LAYER = 'wx-sun-layer';
  // Soft 2-tier terminator: a wide outer band for the twilight feel and a
  // crisp inner polygon for deep night. Stacking more polygons (the original
  // 4-tier #119 stack) produced rectangular-looking masses because adjacent
  // angular distances stack to ~full opacity over most of the night side,
  // visually flattening the gradient into a single dark blob. Two tiers
  // gives a clean curved terminator + a softer day-side feather.
  const SUN_OPACITY_OUTER = 0.18; // twilight band
  const SUN_OPACITY_INNER = 0.42; // deep night
  const SUN_FEATHER_DEG = 1.5;
  let sunTicker = 0;

  function sunScale(): number {
    return rvOpacity / 0.45;
  }

  function removeSun(): void {
    if (sunTicker) {
      window.clearInterval(sunTicker);
      sunTicker = 0;
    }
    for (const id of [
      SUN_LAYER,
      SUN_LAYER_MID,
      SUN_LAYER_OUTER,
      SUN_LAYER_SOFT,
    ]) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    for (const id of [
      SUN_SOURCE_INNER,
      SUN_SOURCE_MID,
      SUN_SOURCE_OUTER,
      SUN_SOURCE_SOFT,
    ]) {
      if (map.getSource(id)) map.removeSource(id);
    }
  }

  function refreshSun(): void {
    const now = Date.now();
    const outerPoly = terminatorPolygon(now, 180, 90 - SUN_FEATHER_DEG);
    const innerPoly = terminatorPolygon(now, 180, 90 + SUN_FEATHER_DEG);
    const toFc = (
      poly: ReturnType<typeof terminatorPolygon>,
    ): FeatureCollection => ({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: poly, properties: {} }],
    });
    const scale = sunScale();
    const tiers: Array<{
      srcId: string;
      layerId: string;
      fc: FeatureCollection;
      opacity: number;
    }> = [
      {
        srcId: SUN_SOURCE_OUTER,
        layerId: SUN_LAYER_OUTER,
        fc: toFc(outerPoly),
        opacity: SUN_OPACITY_OUTER * scale,
      },
      {
        srcId: SUN_SOURCE_INNER,
        layerId: SUN_LAYER,
        fc: toFc(innerPoly),
        opacity: SUN_OPACITY_INNER * scale,
      },
    ];
    for (const tier of tiers) {
      const src = map.getSource(tier.srcId) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (src) {
        src.setData(tier.fc);
        continue;
      }
      map.addSource(tier.srcId, { type: 'geojson', data: tier.fc });
      map.addLayer({
        id: tier.layerId,
        type: 'fill',
        source: tier.srcId,
        paint: {
          'fill-color': '#0b1320',
          'fill-opacity': tier.opacity,
        },
      });
    }
  }

  function removeWind(): void {
    if (windRaf) {
      window.cancelAnimationFrame(windRaf);
      windRaf = 0;
    }
    if (map.getLayer(WIND_LAYER)) map.removeLayer(WIND_LAYER);
    if (map.getLayer(WIND_CIRCLE_LAYER)) map.removeLayer(WIND_CIRCLE_LAYER);
    if (map.getSource(WIND_CIRCLE_SOURCE)) map.removeSource(WIND_CIRCLE_SOURCE);
  }

  function windPointsAtHour(g: WindGrid, h: number): WindPoint[] {
    return g.points.map((p) => ({ lat: p.lat, lng: p.lng, u: p.u[h], v: p.v[h] }));
  }

  function windCircleGeoJSON(g: WindGrid, h: number): FeatureCollection {
    const feats: Feature[] = [];
    for (const p of g.points) {
      const u = p.u[h];
      const v = p.v[h];
      if (u === null || v === null) continue;
      const s = windSpeed(u, v);
      feats.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: { color: windSpeedColor(s), speed: Math.round(s) },
      });
    }
    return { type: 'FeatureCollection', features: feats };
  }

  function showWindFrame(h: number): void {
    if (!windGrid) return;
    windHourIndex = h;
    windTexDirty = true;
    if (windReducedMotion) {
      const data = windCircleGeoJSON(windGrid, h);
      const src = map.getSource(WIND_CIRCLE_SOURCE) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (src) {
        src.setData(data);
      } else {
        map.addSource(WIND_CIRCLE_SOURCE, { type: 'geojson', data });
        map.addLayer({
          id: WIND_CIRCLE_LAYER,
          type: 'circle',
          source: WIND_CIRCLE_SOURCE,
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 6, 8, 18],
            'circle-color': ['get', 'color'],
            'circle-opacity': rvOpacity,
          },
        });
      }
      return;
    }
    if (!map.getLayer(WIND_LAYER)) {
      map.addLayer(makeWindLayer());
    }
  }

  function makeWindLayer(): maplibregl.CustomLayerInterface {
    let prog: WebGLProgram | null = null;
    let updateProg: WebGLProgram | null = null;
    let posTexA: WebGLTexture | null = null;
    let posTexB: WebGLTexture | null = null;
    let windTex: WebGLTexture | null = null;
    let fbo: WebGLFramebuffer | null = null;
    let posBuf: WebGLBuffer | null = null;
    let quadBuf: WebGLBuffer | null = null;
    let upd_aPos = -1;
    let upd_uPos: WebGLUniformLocation | null = null;
    let upd_uWind: WebGLUniformLocation | null = null;
    let upd_uDt: WebGLUniformLocation | null = null;
    let upd_uMax: WebGLUniformLocation | null = null;
    let drw_aIdx = -1;
    let drw_uPos: WebGLUniformLocation | null = null;
    let drw_uWind: WebGLUniformLocation | null = null;
    let drw_uSize: WebGLUniformLocation | null = null;
    let drw_uMax: WebGLUniformLocation | null = null;
    let drw_uPointSize: WebGLUniformLocation | null = null;

    function compile(
      gl: WebGLRenderingContext,
      type: number,
      src: string,
    ): WebGLShader {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error('[wind] shader compile failed:', gl.getShaderInfoLog(sh));
      }
      return sh;
    }
    function link(
      gl: WebGLRenderingContext,
      vs: string,
      fs: string,
    ): WebGLProgram {
      const p = gl.createProgram()!;
      gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
      gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        console.error('[wind] program link failed:', gl.getProgramInfoLog(p));
      }
      return p;
    }

    const updateVs = `
      precision highp float;
      attribute vec2 a_pos;
      varying vec2 v_uv;
      void main() {
        v_uv = a_pos * 0.5 + 0.5;
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }
    `;
    const updateFs = `
      precision highp float;
      uniform sampler2D u_pos;
      uniform sampler2D u_wind;
      uniform float u_dt;
      uniform float u_max;
      varying vec2 v_uv;
      void main() {
        vec4 p = texture2D(u_pos, v_uv);
        vec2 pos = p.xy;
        vec4 wTex = texture2D(u_wind, pos);
        vec2 uv = (wTex.rg * 2.0 - 1.0) * u_max;
        float mask = wTex.a;
        vec2 dp = vec2(uv.x, -uv.y) * u_dt * 0.000045;
        pos += dp * mask;
        float age = p.z + u_dt;
        if (pos.x < 0.0 || pos.x > 1.0 || pos.y < 0.0 || pos.y > 1.0 || age > 0.95) {
          pos = fract(vec2(
            sin(dot(v_uv, vec2(12.9898, 78.233)) + age * 53.0) * 43758.5453,
            cos(dot(v_uv, vec2(4.898, 7.23)) + age * 39.0) * 12345.678
          ));
          age = 0.0;
        }
        gl_FragColor = vec4(pos, age, 0.0);
      }
    `;
    const drawVs = `
      precision highp float;
      attribute float a_index;
      uniform sampler2D u_pos;
      uniform float u_size;
      uniform float u_pointSize;
      varying float v_speed;
      uniform sampler2D u_wind;
      uniform float u_max;
      void main() {
        float i = a_index;
        float row = floor(i / u_size);
        float col = i - row * u_size;
        vec2 uvIdx = (vec2(col, row) + 0.5) / u_size;
        vec4 p = texture2D(u_pos, uvIdx);
        vec4 w = texture2D(u_wind, p.xy);
        vec2 wind = (w.rg * 2.0 - 1.0) * u_max;
        v_speed = length(wind);
        gl_Position = vec4(p.x * 2.0 - 1.0, (1.0 - p.y) * 2.0 - 1.0, 0.0, 1.0);
        gl_PointSize = u_pointSize;
      }
    `;
    const drawFs = `
      precision highp float;
      varying float v_speed;
      uniform float u_max;
      void main() {
        float t = clamp(v_speed / u_max, 0.0, 1.0);
        vec3 cCalm   = vec3(0.169, 0.514, 0.729);
        vec3 cBreeze = vec3(0.671, 0.867, 0.643);
        vec3 cStrong = vec3(0.992, 0.682, 0.380);
        vec3 cGale   = vec3(0.404, 0.000, 0.051);
        vec3 col = mix(cCalm, cBreeze, smoothstep(0.0, 0.25, t));
        col = mix(col, cStrong, smoothstep(0.25, 0.6, t));
        col = mix(col, cGale, smoothstep(0.6, 1.0, t));
        gl_FragColor = vec4(col, 0.85);
      }
    `;

    function ensureWindTex(gl: WebGLRenderingContext): void {
      if (!windGrid || !windTex || !windTexDirty) return;
      const pts = windPointsAtHour(windGrid, windHourIndex);
      const cols = 8;
      const rows = 6;
      if (pts.length !== cols * rows) return;
      const enc = encodeWindGrid(pts, cols, rows);
      gl.bindTexture(gl.TEXTURE_2D, windTex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        cols,
        rows,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        enc.data,
      );
      windTexDirty = false;
    }

    return {
      id: WIND_LAYER,
      type: 'custom',
      renderingMode: '2d',
      onAdd(_map, gl) {
        updateProg = link(gl, updateVs, updateFs);
        prog = link(gl, drawVs, drawFs);
        upd_aPos = gl.getAttribLocation(updateProg, 'a_pos');
        upd_uPos = gl.getUniformLocation(updateProg, 'u_pos');
        upd_uWind = gl.getUniformLocation(updateProg, 'u_wind');
        upd_uDt = gl.getUniformLocation(updateProg, 'u_dt');
        upd_uMax = gl.getUniformLocation(updateProg, 'u_max');
        drw_aIdx = gl.getAttribLocation(prog, 'a_index');
        drw_uPos = gl.getUniformLocation(prog, 'u_pos');
        drw_uWind = gl.getUniformLocation(prog, 'u_wind');
        drw_uSize = gl.getUniformLocation(prog, 'u_size');
        drw_uMax = gl.getUniformLocation(prog, 'u_max');
        drw_uPointSize = gl.getUniformLocation(prog, 'u_pointSize');
        const initial = initParticlePositions(PARTICLE_COUNT, 1234);
        const bytes = new Uint8Array(PARTICLE_COUNT * 4);
        for (let i = 0; i < PARTICLE_COUNT; i++) {
          bytes[i * 4 + 0] = Math.round(initial[i * 4 + 0] * 255);
          bytes[i * 4 + 1] = Math.round(initial[i * 4 + 1] * 255);
          bytes[i * 4 + 2] = 0;
          bytes[i * 4 + 3] = 0;
        }
        function newTex(): WebGLTexture {
          const tx = gl.createTexture()!;
          gl.bindTexture(gl.TEXTURE_2D, tx);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          return tx;
        }
        posTexA = newTex();
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          PARTICLE_TEX_SIZE,
          PARTICLE_TEX_SIZE,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          bytes,
        );
        posTexB = newTex();
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          PARTICLE_TEX_SIZE,
          PARTICLE_TEX_SIZE,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          bytes,
        );
        windTex = newTex();
        fbo = gl.createFramebuffer();
        quadBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
          gl.STATIC_DRAW,
        );
        const idx = new Float32Array(PARTICLE_COUNT);
        for (let i = 0; i < PARTICLE_COUNT; i++) idx[i] = i;
        posBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
        gl.bufferData(gl.ARRAY_BUFFER, idx, gl.STATIC_DRAW);
        ensureWindTex(gl);
        const tick = (): void => {
          map.triggerRepaint();
          windRaf = window.requestAnimationFrame(tick);
        };
        windRaf = window.requestAnimationFrame(tick);
      },
      onRemove(_map, gl) {
        if (windRaf) {
          window.cancelAnimationFrame(windRaf);
          windRaf = 0;
        }
        if (prog) gl.deleteProgram(prog);
        if (updateProg) gl.deleteProgram(updateProg);
        if (posTexA) gl.deleteTexture(posTexA);
        if (posTexB) gl.deleteTexture(posTexB);
        if (windTex) gl.deleteTexture(windTex);
        if (fbo) gl.deleteFramebuffer(fbo);
        if (posBuf) gl.deleteBuffer(posBuf);
        if (quadBuf) gl.deleteBuffer(quadBuf);
      },
      prerender(gl) {
        if (!updateProg || !posTexA || !posTexB || !windTex || !fbo || !quadBuf)
          return;
        ensureWindTex(gl);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          posTexB,
          0,
        );
        gl.viewport(0, 0, PARTICLE_TEX_SIZE, PARTICLE_TEX_SIZE);
        gl.useProgram(updateProg);
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
        gl.enableVertexAttribArray(upd_aPos);
        gl.vertexAttribPointer(upd_aPos, 2, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, posTexA);
        gl.uniform1i(upd_uPos, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, windTex);
        gl.uniform1i(upd_uWind, 1);
        gl.uniform1f(upd_uDt, 0.016);
        gl.uniform1f(upd_uMax, MAX_WIND_MPS);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.disableVertexAttribArray(upd_aPos);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        const tmp = posTexA;
        posTexA = posTexB;
        posTexB = tmp;
      },
      render(gl) {
        if (!prog || !posTexA || !windTex || !posBuf) return;
        gl.useProgram(prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
        gl.enableVertexAttribArray(drw_aIdx);
        gl.vertexAttribPointer(drw_aIdx, 1, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, posTexA);
        gl.uniform1i(drw_uPos, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, windTex);
        gl.uniform1i(drw_uWind, 1);
        gl.uniform1f(drw_uSize, PARTICLE_TEX_SIZE);
        gl.uniform1f(drw_uMax, MAX_WIND_MPS);
        gl.uniform1f(
          drw_uPointSize,
          3.5 * Math.min(window.devicePixelRatio || 1, 2),
        );
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.POINTS, 0, PARTICLE_COUNT);
        gl.disableVertexAttribArray(drw_aIdx);
        gl.disable(gl.BLEND);
      },
    };
  }

  function removeField(): void {
    if (map.getLayer(FIELD_LAYER)) map.removeLayer(FIELD_LAYER);
    if (map.getLayer(FIELD_LAYER + '-halo'))
      map.removeLayer(FIELD_LAYER + '-halo');
    if (map.getSource(FIELD_SOURCE)) map.removeSource(FIELD_SOURCE);
  }

  function fieldGeoJSON(hourIndex: number): FeatureCollection {
    const feats: Feature[] = [];
    const cfg = FIELD_CONFIGS[activeLayer];
    if (fieldGrid && cfg) {
      for (const p of fieldGrid.points) {
        const v = p.values[hourIndex];
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        feats.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
          properties: { color: cfg.color(v) },
        });
      }
    }
    return { type: 'FeatureCollection', features: feats };
  }

  function renderFieldFrame(hourIndex: number): void {
    const data = fieldGeoJSON(hourIndex);
    const existing = map.getSource(FIELD_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (existing) {
      existing.setData(data);
      return;
    }
    map.addSource(FIELD_SOURCE, { type: 'geojson', data });
    // Stack TWO circle layers so the field reads as a continuous cloud
    // rather than dotted grid:
    //   1. Bottom: huge heavily-blurred halos (radius 80→240 px, blur 1.4)
    //      that overlap and blend, producing the continuous-field feel.
    //   2. Top: smaller sharper circles so the underlying data points are
    //      still identifiable as samples (radius 12→32 px, blur 0.5).
    // The two layers share the same source and color expression.
    map.addLayer({
      id: FIELD_LAYER + '-halo',
      type: 'circle',
      source: FIELD_SOURCE,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 80, 8, 240],
        'circle-color': ['get', 'color'],
        'circle-blur': 1.4,
        'circle-opacity': Math.min(rvOpacity * 0.65, 0.6),
      },
    });
    map.addLayer({
      id: FIELD_LAYER,
      type: 'circle',
      source: FIELD_SOURCE,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 12, 8, 32],
        'circle-color': ['get', 'color'],
        'circle-blur': 0.5,
        'circle-opacity': rvOpacity * 0.75,
      },
    });
  }

  async function loadFieldGrid(layerId: string): Promise<boolean> {
    const cfg = FIELD_CONFIGS[layerId];
    if (!cfg) return false;
    const b = map.getBounds();
    const grid = viewportGrid(
      {
        west: b.getWest(),
        south: b.getSouth(),
        east: b.getEast(),
        north: b.getNorth(),
      },
      10,
      7,
    );
    fieldAbort?.abort();
    const ac = new AbortController();
    fieldAbort = ac;
    try {
      const res = await deps.fetch(buildFieldUrl(grid, cfg.hourlyVar), {
        signal: ac.signal,
      });
      if (ac.signal.aborted) return false;
      fieldGrid = parseFieldResponse(await res.json(), grid, cfg.hourlyVar);
    } catch {
      if (ac.signal.aborted) return false;
      fieldGrid = null;
    } finally {
      if (fieldAbort === ac) fieldAbort = null;
    }
    return !!fieldGrid && fieldGrid.points.length > 0;
  }

  function removeWeatherRaster(): void {
    if (map.getLayer(RV_LAYER)) map.removeLayer(RV_LAYER);
    if (map.getSource(RV_SOURCE)) map.removeSource(RV_SOURCE);
  }

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

  function renderLegend(
    kind: 'radar' | 'temperature' | 'humidity' | 'pressure' | 'wind' | null,
  ): void {
    const el = opts.els.legend;
    if (!el) return;
    if (!kind) {
      el.classList.add('hidden');
      el.innerHTML = '';
      return;
    }
    const stops: LegendStop[] =
      kind === 'radar'
        ? RADAR_LEGEND.map((s) => ({
            label: t[s.labelKey as keyof typeof t] as string,
            color: s.color,
          }))
        : kind === 'temperature'
          ? TEMP_LEGEND
          : kind === 'humidity'
            ? HUMIDITY_LEGEND
            : kind === 'pressure'
              ? PRESSURE_LEGEND
              : WIND_LEGEND.map((s) => ({
                  label: t[s.labelKey as keyof typeof t] as string,
                  color: s.color,
                }));
    el.innerHTML = stops
      .map(
        (s) =>
          `<li class="flex items-center gap-2"><span class="inline-block h-3 w-3 rounded-sm" style="background:${esc(
            s.color,
          )}"></span>${esc(s.label)}</li>`,
      )
      .join('');
    el.classList.remove('hidden');
  }

  function refreshLayerButtons(): void {
    const wrap = opts.els.layerBtns;
    if (!wrap) return;
    for (const def of LAYERS) {
      const btn = wrap.querySelector(`#layerbtn-${def.id}`);
      if (btn) btn.setAttribute('aria-pressed', String(def.id === activeLayer));
    }
    const akind = getLayerDef(activeLayer)?.kind;
    opts.els.opacityWrap?.classList.toggle(
      'hidden',
      akind !== 'raster-tile' &&
        akind !== 'field' &&
        akind !== 'particles' &&
        akind !== 'overlay',
    );
    const kindForLegend =
      activeLayer === 'radar'
        ? ('radar' as const)
        : akind === 'field'
          ? (activeLayer as 'temperature' | 'humidity' | 'pressure')
          : akind === 'particles'
            ? ('wind' as const)
            : null;
    renderLegend(kindForLegend);
  }

  async function setActiveLayer(id: string): Promise<void> {
    const def = getLayerDef(id);
    if (!def) return;
    if (def.kind === 'particles') {
      rvOpacity = def.defaultOpacity;
      if (opacityEl) opacityEl.value = String(Math.round(rvOpacity * 100));
      tlStop();
      removeWeatherRaster();
      removeField();
      const b = map.getBounds();
      const grid = viewportGrid(
        {
          west: b.getWest(),
          south: b.getSouth(),
          east: b.getEast(),
          north: b.getNorth(),
        },
        8,
        6,
      );
      fieldAbort?.abort();
      const ac = new AbortController();
      fieldAbort = ac;
      try {
        const res = await deps.fetch(buildWindUrl(grid), { signal: ac.signal });
        if (ac.signal.aborted) {
          removeWind();
          removeSun();
          activeLayer = 'base';
          refreshLayerButtons();
          syncHash();
          return;
        }
        windGrid = parseWindResponse(await res.json(), grid);
        windTexDirty = true;
      } catch {
        if (!ac.signal.aborted) windGrid = null;
      } finally {
        if (fieldAbort === ac) fieldAbort = null;
      }
      if (!windGrid || windGrid.points.length === 0) {
        showMsg(t.map_layer_unavailable);
        activeLayer = 'base';
        removeWind();
        removeSun();
        tlFrames = [];
        frameIndex = -1;
        activeFrameIso = null;
        showTimeline(false);
        refreshLayerButtons();
        syncHash();
        return;
      }
      activeLayer = id;
      tlFrames = windGrid.times.map((iso) => ({
        time: Math.floor(
          Date.parse(/[Zz]|[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + 'Z') / 1000,
        ),
        path: '',
      }));
      const idx = fieldFrameIndex(windGrid.times, pendingSeekIso, Date.now());
      pendingSeekIso = null;
      showTimeline(true);
      refreshLayerButtons();
      applyFrame(idx >= 0 ? idx : 0);
      return;
    }
    if (def.kind === 'overlay') {
      rvOpacity = def.defaultOpacity;
      if (opacityEl) opacityEl.value = String(Math.round(rvOpacity * 100));
      tlStop();
      removeWeatherRaster();
      removeField();
      removeWind();
      activeLayer = id;
      tlFrames = [];
      frameIndex = -1;
      activeFrameIso = null;
      showTimeline(false);
      refreshLayerButtons();
      refreshSun();
      sunTicker = window.setInterval(refreshSun, 60_000);
      syncHash();
      return;
    }
    if (def.kind === 'field') {
      rvOpacity = def.defaultOpacity;
      if (opacityEl) opacityEl.value = String(Math.round(rvOpacity * 100));
      tlStop();
      removeWind();
      removeSun();
      removeWeatherRaster();
      const ok = await loadFieldGrid(id);
      if (!ok || !fieldGrid) {
        showMsg(t.map_layer_unavailable);
        activeLayer = 'base';
        removeField();
        tlFrames = [];
        frameIndex = -1;
        activeFrameIso = null;
        showTimeline(false);
        refreshLayerButtons();
        syncHash();
        return;
      }
      activeLayer = id;
      tlFrames = fieldGrid.times.map((iso) => ({
        time: Math.floor(
          Date.parse(/[Zz]|[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + 'Z') / 1000,
        ),
        path: '',
      }));
      const idx = fieldFrameIndex(fieldGrid.times, pendingSeekIso, Date.now());
      pendingSeekIso = null;
      showTimeline(true);
      refreshLayerButtons();
      applyFrame(idx >= 0 ? idx : 0);
      return;
    }
    if (def.kind === 'raster-tile') {
      rvOpacity = def.defaultOpacity;
      if (opacityEl) opacityEl.value = String(Math.round(rvOpacity * 100));
      const frames = framesForLayer(rvData, id);
      if (!rvData || frames.length === 0) {
        showMsg(t.map_layer_unavailable);
        activeLayer = 'base';
        tlStop();
        removeWeatherRaster();
        removeField();
        removeWind();
        removeSun();
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
      removeField();
      removeWind();
      removeSun();
      applyFrame(idx >= 0 ? idx : defaultFrameIndex(frames, now));
      return;
    }
    tlStop();
    removeWeatherRaster();
    removeField();
    removeWind();
    removeSun();
    activeLayer = id;
    tlFrames = [];
    frameIndex = -1;
    activeFrameIso = null;
    showTimeline(false);
    refreshLayerButtons();
    syncHash();
  }

  function buildLayerButtons(): void {
    const wrap = opts.els.layerBtns;
    if (!wrap || !features.layerRail) return;
    for (const def of LAYERS) {
      const btn = document.createElement('button');
      btn.id = `layerbtn-${def.id}`;
      btn.type = 'button';
      btn.setAttribute('aria-pressed', String(def.id === activeLayer));
      btn.className =
        'rounded px-2 py-1 text-left hover:bg-blue-500/10 aria-pressed:bg-blue-500/15 aria-pressed:font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-blue-400/10';
      btn.textContent = t[def.labelKey as keyof typeof t];
      btn.addEventListener('click', () => void setActiveLayer(def.id));
      wrap.appendChild(btn);
    }
  }
  buildLayerButtons();

  const opacityEl = features.layerRail ? opts.els.opacity ?? null : null;
  if (opacityEl) {
    opacityEl.value = String(Math.round(rvOpacity * 100));
    opacityEl.addEventListener('input', () => {
      rvOpacity = Number(opacityEl.value) / 100;
      if (map.getLayer(RV_LAYER))
        map.setPaintProperty(RV_LAYER, 'raster-opacity', rvOpacity);
      if (map.getLayer(FIELD_LAYER))
        map.setPaintProperty(FIELD_LAYER, 'circle-opacity', rvOpacity * 0.75);
      if (map.getLayer(FIELD_LAYER + '-halo'))
        map.setPaintProperty(
          FIELD_LAYER + '-halo',
          'circle-opacity',
          Math.min(rvOpacity * 0.65, 0.6),
        );
      if (map.getLayer(WIND_CIRCLE_LAYER))
        map.setPaintProperty(WIND_CIRCLE_LAYER, 'circle-opacity', rvOpacity);
      const sunScaleNow = sunScale();
      if (map.getLayer(SUN_LAYER_OUTER))
        map.setPaintProperty(
          SUN_LAYER_OUTER,
          'fill-opacity',
          SUN_OPACITY_OUTER * sunScaleNow,
        );
      if (map.getLayer(SUN_LAYER))
        map.setPaintProperty(
          SUN_LAYER,
          'fill-opacity',
          SUN_OPACITY_INNER * sunScaleNow,
        );
    });
  }

  // ------------------------------------------------------------------
  // Timeline controls (only wired when features.timeline === true).
  // ------------------------------------------------------------------
  let tlPlaying = false;
  let tlTimer = 0;
  const tlReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  const tlPlayBtn = features.timeline
    ? (opts.els.tlPlay ?? null)
    : null;

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

  if (tlPlayBtn) {
    tlPlayBtn.disabled = tlReducedMotion;
    if (tlReducedMotion) tlPlayBtn.title = t.timeline_play;
    tlPlayBtn.addEventListener('click', () => {
      if (tlPlaying) tlStop();
      else tlStart();
    });
  }

  if (features.timeline) {
    opts.els.tlPrev?.addEventListener('click', () => {
      if (tlFrames.length) {
        tlStop();
        applyFrame(frameIndex - 1);
      }
    });
    opts.els.tlNext?.addEventListener('click', () => {
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
  }

  if (features.search && q) {
    q.addEventListener('input', () => {
      window.clearTimeout(qTimer);
      const query = q.value.trim();
      if (query.length < 2) {
        hideMsg();
        closeAcList();
        return;
      }
      qTimer = window.setTimeout(async () => {
        const gen = ++searchGen;
        try {
          const results = await geocode(query, deps);
          if (gen !== searchGen) return;
          if (!results.length) {
            closeAcList();
            showMsg(`${t.no_results} «${query}»`);
            return;
          }
          acResults = results;
          hideMsg();
          renderAcList();
        } catch {
          if (gen !== searchGen) return;
          closeAcList();
          showMsg(t.load_error);
        }
      }, 350);
    });

    q.addEventListener('keydown', (e: KeyboardEvent) => {
      if (acResults.length === 0) {
        if (e.key === 'Escape') closeAcList();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        acActive = (acActive + 1) % acResults.length;
        highlightAc();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        acActive = acActive <= 0 ? acResults.length - 1 : acActive - 1;
        highlightAc();
      } else if (e.key === 'Enter') {
        if (acActive >= 0 && acActive < acResults.length) {
          e.preventDefault();
          selectAc(acResults[acActive]);
        }
      } else if (e.key === 'Escape') {
        closeAcList();
      }
    });

    document.addEventListener('click', (e) => {
      const target = e.target as Node;
      if (q && acList && !q.contains(target) && !acList.contains(target)) {
        closeAcList();
      }
    });
  }

  if (features.locateButton && opts.els.locate) {
    opts.els.locate.addEventListener('click', () => {
      if (!('geolocation' in navigator)) {
        showMsg(t.geo_denied);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          setUserPin(
            t.map_locate,
            pos.coords.latitude,
            pos.coords.longitude,
            'geo',
          ),
        () => showMsg(t.geo_denied),
        { timeout: 10000 },
      );
    });
  }

  return {
    map,
    destroy(): void {
      themeObserver?.disconnect();
      if (sunTicker) window.clearInterval(sunTicker);
      if (windRaf) window.cancelAnimationFrame(windRaf);
      if (tlTimer) window.clearInterval(tlTimer);
      try {
        map.remove();
      } catch {
        /* already removed */
      }
    },
  };
}

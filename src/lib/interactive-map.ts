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
  fetchFieldChunks,
  fetchWindChunks,
  parseFieldResponse,
  parseWindResponse,
  fieldFrameIndex,
  tempColor,
  humidityColor,
  pressureColor,
  HUMIDITY_LEGEND,
  PRESSURE_LEGEND,
  getTempLegend,
  setColorBlindMode,
  getColorBlindMode,
  type FieldGrid,
  type LegendStop,
  type WindGrid,
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
import {
  renderFieldRaster,
  bilerpValue,
  type RasterBounds,
  type ImageCorners,
} from './mapraster';
import { terminatorPolygon, solarPosition } from './mapsun';
import { presetPins, withUserPin, type MapPin } from './mappins';
import { cities } from '../data/cities';
import { geocode } from './geocode';
import { ui } from '../i18n/ui';
import { siteBase } from '../utils/paths';
import {
  createNhcSource,
  type NhcStorm,
  GIBS_LAYERS,
  gibsTileUrl,
  gibsRoundedTime,
  ATTRIBUTION_GIBS,
} from './map/sources';

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
  /** Overlays (Superposiciones) checkbox container — zoom.earth-style
   *  menu of toggleable map decorations. Optional; when null overlays
   *  are reachable only via keyboard shortcuts. */
  overlayBtns?: HTMLElement | null;
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
  /** Floating tooltip overlay that follows the cursor on hover for
   *  field/wind/sun layers (zoom.earth-style). Optional — when absent
   *  the hover handler is a no-op. */
  tooltip?: HTMLElement | null;
  /** Cursor coordinate badge in the bottom-left corner. Optional —
   *  when present, the cursor's lat/lng renders as "19°25′N 99°07′O"
   *  on mousemove (zoom.earth-style). */
  coords?: HTMLElement | null;
}

export interface InteractiveMapFeatures {
  layerRail?: boolean;
  timeline?: boolean;
  search?: boolean;
  locateButton?: boolean;
  presetPins?: boolean;
}

// ---------------------------------------------------------------------------
// Shared fetch cache + request coalescing lives in src/lib/map/utils/fetch.ts
// (extracted in F2 of the architecture migration — see docs/ARCHITECTURE.md).
// Re-imported here so existing call sites in this monolith keep working
// unchanged.
import {
  cachedFetch,
  formatLatLngDM,
  polylineLengthKm as measurePolylineLen,
  sphericalAreaKm2 as measureSphArea,
  formatDistance as measureFmtDist,
  formatArea as measureFmtArea,
} from './map/utils';
import { createVolcanoesOverlay } from './map/overlays/volcanoes';
import { createQuakesOverlay } from './map/overlays/quakes';
import { createLakesOverlay } from './map/overlays/lakes';
import { createHistStormsOverlay } from './map/overlays/hist-storms';
import { createWebcamsOverlay } from './map/overlays/webcams';
import { createAqiOverlay } from './map/overlays/aqi';
import { createSmnStateTintOverlay } from './map/overlays/smn-state-tint';
import { createMarineOverlay } from './map/overlays/marine';
import { createGraticuleOverlay } from './map/overlays/graticule';
import { createFiresOverlay } from './map/overlays/fires';
import { createBordersOverlay } from './map/overlays/borders';
import { createRadarCoverageOverlay } from './map/overlays/radar-coverage';
import { createNightLineOverlay } from './map/overlays/night-line';
import { createNightLightsOverlay } from './map/overlays/night-lights';
import { createTropicalStormsOverlay } from './map/overlays/tropical-storms';
import {
  createBasemapThemeController,
  OSM_TILES as BASEMAP_OSM_TILES,
  CARTO_DARK_TILES as BASEMAP_CARTO_DARK_TILES,
} from './map/chrome/basemap-theme';
import { createSunLayer } from './map/layers/sun-layer';
import { createWeatherRaster } from './map/layers/weather-raster';
import {
  type MapSettings,
  readSettings,
  writeSettings,
} from './map/settings';
import { createAutocompleteController } from './map/chrome/autocomplete';
import { createSnapshotCompare } from './map/chrome/snapshot-compare';
import { createModelToggle } from './map/chrome/model-toggle';
import {
  WIND_PARTICLES_LAYER_ID,
  makeWindParticlesLayer,
  windPointsAtHour,
} from './map/layers/wind-particles';
import { createIsobarsLayer } from './map/layers/isobars';
import { createCloudsOverlay } from './map/overlays/clouds';
import { createCityValuesOverlay } from './map/overlays/city-values';
import { createTimelinePlayer } from './map/chrome/timeline-player';
import { createSubOptionsGroup } from './map/chrome/sub-options';
import { createPinManager } from './map/chrome/pin-manager';
import { createOverlayRegistry } from './map/chrome/overlay-registry';
import { computeIsobars } from './map/utils/isobars';

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

  // Pick the basemap tile URL up-front from the current theme so the very
  // first tile fetches go to the right CDN. Initialising with OSM and then
  // swapping to Dark Matter via setTiles causes a race at low zoom — tiles
  // already in flight come back as OSM (light) and paint as light patches
  // next to Dark Matter tiles for a couple of seconds.
  const initialDark = document.documentElement.classList.contains('dark');
  // Initial tile arrays — sourced from the shared basemap-theme module
  // to keep the single source of truth (no diverging URL lists between
  // the map construction and the runtime theme controller).
  const OSM_TILES_INIT = BASEMAP_OSM_TILES;
  const CARTO_DARK_TILES_INIT = BASEMAP_CARTO_DARK_TILES;

  const map = new maplibre.Map({
    container: opts.els.container,
    center: [initial.lng, initial.lat],
    zoom: initial.zoom,
    interactive,
    // Required so map.getCanvas().toDataURL() returns the rendered
    // pixels (plan 3.3 snapshot compare). WebGL discards the buffer
    // by default at the end of each frame; this keeps it readable.
    // maplibre-gl v5 moved this into canvasContextAttributes (was a
    // top-level MapOption in v4).
    canvasContextAttributes: { preserveDrawingBuffer: true },
    // MapLibre's attributionControl typing is `false | AttributionControlOptions`;
    // pass `false` to suppress it, or omit (undefined) to use the default control.
    attributionControl: controls ? undefined : false,
    style: {
      version: 8,
      // Symbol layers (e.g. city value pills) need a glyphs URL to render
      // text. MapLibre's demotiles host serves a stable Noto/Open Sans
      // stack with no API key required.
      glyphs:
        'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      sources: {
        osm: {
          type: 'raster',
          tiles: initialDark ? CARTO_DARK_TILES_INIT : OSM_TILES_INIT,
          tileSize: 256,
          attribution: initialDark
            ? '© OpenStreetMap contributors © CARTO'
            : '© OpenStreetMap',
        },
      },
      layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
    },
  });

  if (controls) {
    map.addControl(new maplibre.NavigationControl({}), 'bottom-left');
    // Scale bar in the bottom-right — zoom.earth-style, distance updates
    // with zoom (e.g. "200 km" at z=6, "10 km" at z=12).
    map.addControl(
      new maplibre.ScaleControl({ unit: 'metric', maxWidth: 120 }),
      'bottom-right',
    );
  }

  // Cursor coordinate badge — only shown on the full /mapa page, not on
  // the smaller embedded maps. Renders DM-style "19°25′N 99°07′O" in the
  // bottom-left corner, the same format zoom.earth uses.
  if (controls && opts.els.coords) {
    const coordsEl = opts.els.coords;
    map.on('mousemove', (e) => {
      coordsEl.textContent = formatLatLngDM(e.lngLat.lat, e.lngLat.lng);
    });
    map.on('mouseout', () => {
      coordsEl.textContent = '';
    });
  }

  // Pin manager owns the per-pin Marker + Popup lifecycle. The popup
  // HTML builders stay here because they reference the local `base`,
  // `t`, and `esc` closure references.
  function popupHtml(p: MapPin): string {
    const fc = `${base}forecast?lat=${p.lat}&lng=${p.lng}&name=${encodeURIComponent(p.name)}`;
    return (
      `<div class="text-sm"><strong>${esc(p.name)}</strong><br>` +
      `<a href="${esc(fc)}" class="text-blue-600 underline">${esc(t.map_popup_full_forecast)} →</a></div>`
    );
  }

  function placePopupHtml(lat: number, lng: number): string {
    const coords = formatLatLngDM(lat, lng);
    const name = `Ubicación ${coords}`;
    const fc = `${base}forecast?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}&name=${encodeURIComponent(coords)}`;
    return (
      `<div class="text-sm">` +
      `<strong>${esc(coords)}</strong><br>` +
      `<span class="text-gray-600 dark:text-gray-300">${esc(name)}</span><br>` +
      `<a href="${esc(fc)}" class="mt-1 inline-block text-blue-600 underline">${esc(t.map_popup_full_forecast)} →</a>` +
      `</div>`
    );
  }

  const pinManager = createPinManager(
    map,
    features.presetPins ? presetPins(cities) : [],
    { maplibre, popupHtml, enablePopups: !!markerPopups },
  );
  // Aliases kept so the rest of the file's wiring stays unchanged.
  const renderPins = (): void => pinManager.render();
  const setUserPin = (
    name: string,
    lat: number,
    lng: number,
    kind: 'search' | 'geo',
  ): void => {
    pinManager.setUserPin({ name, lat, lng, kind });
  };

  // Click-to-place popup — zoom.earth-style. When the user clicks on
  // empty map (not on a city marker), open a popup with the cursor's
  // DMS coordinates and a link to the full forecast page for that point.
  // Only wired on the full /mapa page (features.layerRail) and when
  // markerPopups is enabled.
  let placePopup: maplibregl.Popup | null = null;
  if (features.layerRail && markerPopups) {
    map.on('click', (e) => {
      // Ignore clicks that landed on a layer feature (storm dots, city
      // values, isobars). Those have their own interactions or none.
      const features = map.queryRenderedFeatures(e.point, {
        layers: ['wx-storms-circle'],
      });
      if (features.length > 0) return;
      if (placePopup) {
        placePopup.remove();
        placePopup = null;
      }
      placePopup = new maplibre.Popup({ offset: 8, closeButton: true })
        .setLngLat(e.lngLat)
        .setHTML(placePopupHtml(e.lngLat.lat, e.lngLat.lng))
        .addTo(map);
    });
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
      model: activeModel === 'best_match' ? null : activeModel,
    };
    history.replaceState(null, '', buildMapHash(state));
  }

  let hashTimer = 0;
  map.on('moveend', () => {
    if (!useHash) return;
    window.clearTimeout(hashTimer);
    hashTimer = window.setTimeout(syncHash, 250);
  });

  // Field layers (temperature/humidity/pressure) now use a FIXED MX
  // grid (see MX_FIELD_BOUNDS) so panning/zooming no longer needs to
  // refetch — values stay stable per lat/lng. The moveend resample
  // handler is intentionally removed; the raster gets upscaled by
  // MapLibre at zoom-in (raster-resampling: linear) and clips
  // gracefully at the fixed extent when the user pans WAY out.

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
  // Source-data hook: whenever ANY source finishes loading (basemap tile
  // batch, raster, geojson), trigger a repaint. This is the final answer
  // to #124 — instead of guessing when tiles arrive, listen for the
  // sourcedata event that fires exactly when tiles finish decoding, then
  // schedule a paint. Cheap (the event also fires during normal panning,
  // which already triggers paints anyway, so this is a no-op there).
  map.on('sourcedata', (e: { isSourceLoaded?: boolean; sourceId?: string }) => {
    if (!e.isSourceLoaded) return;
    try {
      map.triggerRepaint();
    } catch {
      /* best-effort */
    }
  });
  map.on('load', () => {
    renderPins();
    // Fetch active NHC tropical systems once at mount. List is empty
    // outside hurricane season (Dec-May) so this is a no-op then; in
    // season it adds dots over each active storm.
    void refreshTropicalStorms();
    window.requestAnimationFrame(firstPaintNudge);
    aggressiveNudge();
    // Belt-and-suspenders interval: poll triggerRepaint every 200 ms for
    // the first 5 seconds. Each call is essentially free if a frame is
    // already scheduled; covers the worst-case race where neither the
    // load event, sourcedata events, nor the deferred timers happen to
    // align with the moment tiles actually arrive.
    let ticks = 0;
    const intervalId = window.setInterval(() => {
      try {
        map.triggerRepaint();
      } catch {
        /* best-effort */
      }
      ticks += 1;
      if (ticks >= 25) window.clearInterval(intervalId);
    }, 200);
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
        // Cold-load bug (#124, P0.1 in PLAN_UX_PARITY.md): historically a
        // single setTimeout(..., 700) raced the style/source load and the
        // raster layer would silently fail to add ~5% of the time. The
        // user-visible symptom was a "blank field" on first load.
        //
        // Two-part fix:
        //   1. Wait for map.once('idle') — guarantees the style is
        //      resolved AND a paint frame has completed.
        //   2. After activation, verify a known wx layer (RV_LAYER for
        //      raster-tile, wx-field-layer for field) actually exists.
        //      If not, retry with increasing backoff.
        const activateWithRetry = async (): Promise<void> => {
          const def = getLayerDef(wanted);
          if (!def) return;
          const expectedLayerId =
            def.kind === 'raster-tile'
              ? RV_LAYER
              : def.kind === 'field'
                ? 'wx-field-layer'
                : def.kind === 'particles'
                  ? WIND_CIRCLE_LAYER
                  : null;
          const delays = [0, 250, 600, 1300, 2800]; // ~4.9 s total
          for (let i = 0; i < delays.length; i++) {
            if (delays[i] > 0) {
              await new Promise<void>((r) =>
                window.setTimeout(r, delays[i]),
              );
            }
            try {
              await setActiveLayer(wanted);
            } catch {
              continue;
            }
            // Success when the expected layer exists on the map, or
            // when the layer kind has no checkable artifact (overlay).
            if (!expectedLayerId || map.getLayer(expectedLayerId)) {
              return;
            }
          }
        };
        if (map.loaded() && map.isStyleLoaded()) {
          void activateWithRetry();
        } else {
          map.once('idle', () => void activateWithRetry());
        }
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

  // Basemap theme + label-density controller — extracted to
  // src/lib/map/chrome/basemap-theme.ts. Watches the html.dark class
  // and the map's zoom level; swaps the 'osm' source tiles when
  // either crosses a boundary.
  const basemapTheme = createBasemapThemeController(map, {
    sourceId: 'osm',
    initialDark,
  });
  map.on('zoomend', () => basemapTheme.sync());
  const syncBasemapTheme = (): void => basemapTheme.sync();
  // observeThemeForBasemap is now a no-op shim — the observer starts
  // automatically inside the controller's constructor. Kept here so
  // the existing call site in map.on('load') compiles unchanged.
  const observeThemeForBasemap = (): void => {
    /* observer attached by createBasemapThemeController() */
  };
  const themeObserver: { disconnect: () => void } | null = {
    disconnect: () => basemapTheme.dispose(),
  };

  // setUserPin and renderPins now delegate to pinManager (defined
  // earlier in the file via createPinManager).

  // ------------------------------------------------------------------
  // Search autocomplete (scoped to the supplied els.search / els.acList).
  // ------------------------------------------------------------------
  const q = features.search ? opts.els.search ?? null : null;
  const acList = features.search ? opts.els.acList ?? null : null;
  let qTimer = 0;
  let searchGen = 0;

  // Search autocomplete listbox — controller extracted to
  // src/lib/map/chrome/autocomplete.ts. The controller manages state +
  // DOM rendering; this layer wires the select handler (drop pin + set
  // active layer) and the search-input keyboard handlers below.
  const ac =
    q && acList
      ? createAutocompleteController(
          q as HTMLInputElement,
          acList as HTMLUListElement,
          (r) => {
            hideMsg();
            ac?.close();
            setUserPin(r.name, r.lat, r.lng, 'search');
          },
        )
      : null;
  // Thin wrappers preserve the historical names used by existing call
  // sites in this file (keyboard handlers, debounced fetch).
  const closeAcList = (): void => ac?.close();

  // ------------------------------------------------------------------
  // Weather layer state machine.
  // ------------------------------------------------------------------
  const RV_SOURCE = 'wx-raster';
  const RV_LAYER = 'wx-raster-layer';
  let activeLayer: string = 'base';
  // NWP model selector (plan P1.1). best_match is Open-Meteo's default;
  // others route the request to a specific national model. State is
  // sourced from the URL hash (?model=icon_seamless etc.) and synced
  // back when the user clicks a different model pill.
  let activeModel: string = hashed?.model || 'best_match';
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
    const s = readSettings();
    const opts: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
      hour12: s.hourFormat === '12',
    };
    if (s.tz === 'UTC') opts.timeZone = 'UTC';
    const clock = new Date(frame.time * 1000).toLocaleTimeString('es-MX', opts);
    const rel =
      off === 0 ? t.timeline_now : off < 0 ? `${off} min` : `+${off} min`;
    return `${clock}${s.tz === 'UTC' ? ' UTC' : ''} · ${rel}`;
  }

  // Settings persistence — extracted to src/lib/map/settings.ts.
  // (readSettings / writeSettings / MapSettings re-exported via the
  // import so the existing references stay unchanged.)

  function applyFrame(i: number): void {
    const idx = clampIndex(i, tlFrames.length);
    if (idx < 0) return;
    frameIndex = idx;
    const fr = tlFrames[idx];
    if (getLayerDef(activeLayer)?.kind === 'particles') {
      showWindFrame(idx);
    } else if (getLayerDef(activeLayer)?.kind === 'field') {
      void renderFieldFrame(idx);
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
    // Plan P0.3 — timeline pill is now always visible; this function
    // only toggles the controls that depend on having frames. The
    // empty-state placeholder '—' is restored when frames clear.
    if (!show && tlTime) {
      tlTime.textContent = '—';
    }
    if (!show && tlRange) {
      tlRange.value = '0';
      tlRange.setAttribute('max', '0');
    }
  }

  const FIELD_SOURCE = 'wx-field';
  const FIELD_LAYER = 'wx-field-layer';
  // Field-raster pipeline. The grid layout (cols × rows) and the lat/lng
  // bounds the grid covers are NOT carried inside FieldGrid itself, so we
  // store them alongside the grid for the bilinear-raster rebuild on every
  // frame change / pan resample. `fieldBlobUrl` is the URL backing the
  // current MapLibre image source — revoked + replaced on each update.
  // Sample density: 32×24 = 768 points over the ~70°×55° MX bbox
  // (~2.2°×2.3° per cell — finer than zoom.earth's ICON 13km globally
  // and matches their ECMWF 9km within MX). Open-Meteo bulk endpoint
  // accepts up to 5000 locations so 768 is well within limits.
  //
  // History: 10×7 (70 pts, #121 rollback from 140), bumped to 16×11
  // (176 pts, #169 for smoothness), now 32×24 (768 pts, plan 1.1A
  // for zoom.earth-superior field).
  const FIELD_GRID_COLS = 32;
  const FIELD_GRID_ROWS = 24;
  /**
   * Fixed bounding box used by all field layers (temperature, humidity,
   * pressure) so the bilinear interpolation samples the SAME 70 points
   * regardless of camera zoom. Without a fixed grid the same lat/lng
   * paints different colors at different zooms because the sample
   * density changes — temperature in MX would change just by zooming.
   *
   * Covers México plus a margin for the southern US, Caribbean,
   * Central America so when the user pans / zooms out we still have
   * meaningful coverage in the visible viewport.
   */
  const MX_FIELD_BOUNDS: RasterBounds = {
    // Wider bbox so the alpha fade at the raster edges (see mapraster.ts
    // edgeFalloff) lands BEYOND the typical /mapa viewport at z=4..6.
    // Otherwise the user sees the hard rectangle of the field source.
    // Coverage: continental MX + USA west/south + Caribbean + most of
    // Central America.
    west: -130,
    south: -5,
    east: -60,
    north: 50,
  };
  // Offscreen canvas size for the rendered raster. 600×420 is the
  // sweet spot for the bicubic upsample from the 10×7 input grid: each
  // input cell expands into a ~60×60 px region of smoothly-curving
  // color, well above the visual threshold where bilinear-at-the-same-
  // resolution would just look noisy. The per-frame cost (~12 ms on a
  // mid laptop) is still under the 16.6 ms frame budget; only paid on
  // hour-slider scrubs and the initial layer activation.
  // Bumped to 1000×700 to keep ~30×30 px per input cell at 32×24 grid.
  // Per-frame raster cost goes to ~30 ms on a mid laptop (still under
  // the budget for one-time scrubs and layer activation).
  const FIELD_RASTER_W = 1000;
  const FIELD_RASTER_H = 700;
  let fieldGrid: FieldGrid | null = null;
  // Cached per-layer grids so the multi-metric tooltip (#2.1) can show
  // temp + humidity + pressure + wind simultaneously even when the
  // user is only on one of those layers. Keyed by the layer id so the
  // most-recent grid per layer survives layer switches. Small memory
  // cost (~70 KB each) for materially better UX.
  let lastTempGrid: FieldGrid | null = null;
  let lastHumidityGrid: FieldGrid | null = null;
  let lastPressureGrid: FieldGrid | null = null;
  let fieldBounds: RasterBounds | null = null;
  let fieldBlobUrl: string | null = null;
  const fieldResampleTimer = 0;

  interface FieldConfig {
    hourlyVar: string;
    color: (v: number) => string;
  }
  /** Sub-option state per layer. zoom.earth's Temperatura has
   *  Actual/Aparente; we wire Actual + Aparente here. Other layers
   *  will follow the same pattern. */
  type TempSubOption = 'actual' | 'aparente' | 'bulbo';
  type HumiditySubOption = 'relativa' | 'rocio';
  type PressureSubOption = 'msl' | 'surface';
  type WindSubOption = 'velocidad' | 'rachas';
  type SatelliteSubOption = 'geocolor' | 'ir' | 'truecolor';
  let tempSubOption: TempSubOption = 'actual';
  let humiditySubOption: HumiditySubOption = 'relativa';
  let pressureSubOption: PressureSubOption = 'msl';
  let windSubOption: WindSubOption = 'velocidad';
  let satelliteSubOption: SatelliteSubOption = 'geocolor';
  function tempHourlyVar(): string {
    if (tempSubOption === 'aparente') return 'apparent_temperature';
    if (tempSubOption === 'bulbo') return 'wet_bulb_temperature_2m';
    return 'temperature_2m';
  }
  function humidityHourlyVar(): string {
    return humiditySubOption === 'rocio'
      ? 'dew_point_2m'
      : 'relative_humidity_2m';
  }
  function pressureHourlyVar(): string {
    return pressureSubOption === 'surface' ? 'surface_pressure' : 'pressure_msl';
  }
  const FIELD_CONFIGS: Record<string, FieldConfig> = {
    temperature: { get hourlyVar() { return tempHourlyVar(); }, color: tempColor },
    humidity: { get hourlyVar() { return humidityHourlyVar(); }, color: humidityColor },
    pressure: { get hourlyVar() { return pressureHourlyVar(); }, color: pressureColor },
  } as unknown as Record<string, FieldConfig>;
  let fieldAbort: AbortController | null = null;

  // Wind particles WebGL layer — shader + GPU setup extracted to
  // src/lib/map/layers/wind-particles.ts. Layer id is re-exported as
  // WIND_PARTICLES_LAYER_ID; alias kept for the rest of this file.
  const WIND_LAYER = WIND_PARTICLES_LAYER_ID;
  const WIND_CIRCLE_LAYER = 'wx-wind-circle';
  const WIND_CIRCLE_SOURCE = 'wx-wind-circle-src';

  let windGrid: WindGrid | null = null;
  let windHourIndex = 0;
  const windReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  let windRaf = 0;
  let windTexDirty = true;

  // Sun / day-night terminator layer — extracted to
  // src/lib/map/layers/sun-layer.ts. The factory takes an opacity
  // getter so the layer follows the opacity slider's value.
  const sunLayer = createSunLayer(map, () => rvOpacity / 0.45);
  const refreshSun = (): void => sunLayer.refresh();
  const removeSun = (): void => sunLayer.remove();

  function removeWind(): void {
    if (windRaf) {
      window.cancelAnimationFrame(windRaf);
      windRaf = 0;
    }
    if (map.getLayer(WIND_LAYER)) map.removeLayer(WIND_LAYER);
    if (map.getLayer(WIND_CIRCLE_LAYER)) map.removeLayer(WIND_CIRCLE_LAYER);
    if (map.getSource(WIND_CIRCLE_SOURCE)) map.removeSource(WIND_CIRCLE_SOURCE);
    removeCityValues();
  }

  /** Plan P2.6 — Wind animation as a concurrent overlay.
   *
   * When the user enables "Animación de viento" with a field layer
   * active (temperatura/humedad/presión), we render the WIND particles
   * on top of the field without unsetting activeLayer. The wind grid
   * is fetched once for the current viewport and tracks the global
   * frameIndex (both are 1-hour stride from Open-Meteo).
   *
   * Distinct from removeWind() which is called by the layer switcher:
   * this one leaves city-value pills intact (those belong to the
   * underlying field).
   */
  let windOverlayEnabled = false;
  async function addWindOverlay(): Promise<void> {
    if (activeLayer === 'wind') return; // already showing
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
    const speedVar =
      windSubOption === 'rachas' ? 'wind_gusts_10m' : 'wind_speed_10m';
    try {
      const json = await fetchWindChunks(grid, speedVar, deps.fetch, {
        model: activeModel,
      });
      const wg = parseWindResponse(json, grid, speedVar);
      if (!wg || wg.points.length === 0) return;
      windGrid = wg;
      windTexDirty = true;
      const h = Math.max(
        0,
        Math.min(wg.times.length - 1, frameIndex >= 0 ? frameIndex : 0),
      );
      showWindFrame(h);
    } catch {
      /* enhancement only — silent on failure */
    }
  }
  function removeWindOverlay(): void {
    if (activeLayer === 'wind') return; // owned by the layer, not us
    if (windRaf) {
      window.cancelAnimationFrame(windRaf);
      windRaf = 0;
    }
    if (map.getLayer(WIND_LAYER)) map.removeLayer(WIND_LAYER);
    if (map.getLayer(WIND_CIRCLE_LAYER)) map.removeLayer(WIND_CIRCLE_LAYER);
    if (map.getSource(WIND_CIRCLE_SOURCE)) map.removeSource(WIND_CIRCLE_SOURCE);
  }

  // windPointsAtHour now imported from the wind-particles module so
  // the layer + this layer-rail wiring share a single implementation.

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
      map.addLayer(
        makeWindParticlesLayer(map, {
          getWindGrid: () => windGrid,
          getHourIndex: () => windHourIndex,
          isTexDirty: () => windTexDirty,
          markTexClean: () => {
            windTexDirty = false;
          },
          onTick: (id) => {
            windRaf = id;
          },
        }),
      );
    }
    // City value pills for wind (e.g. "12 km/h ↑").
    refreshCityValues();
  }


  function revokeFieldBlob(): void {
    if (fieldBlobUrl) {
      try {
        URL.revokeObjectURL(fieldBlobUrl);
      } catch {
        /* some test envs lack URL.revokeObjectURL — ignore */
      }
      fieldBlobUrl = null;
    }
  }

  function removeField(): void {
    if (map.getLayer(FIELD_LAYER)) map.removeLayer(FIELD_LAYER);
    // Legacy halo + circle layer cleanup (PR #119/#121 stacks). Kept
    // defensive so older sessions / hot-reloads don't leak the layer.
    if (map.getLayer(FIELD_LAYER + '-halo'))
      map.removeLayer(FIELD_LAYER + '-halo');
    if (map.getSource(FIELD_SOURCE)) map.removeSource(FIELD_SOURCE);
    revokeFieldBlob();
    removeIsobars();
    removeCityValues();
  }

  // City value pills overlay — extracted to
  // src/lib/map/overlays/city-values.ts.
  const cityValues = createCityValuesOverlay(map, {
    cities,
    getValueAt: (lng, lat) => tooltipValueAt(lng, lat),
    isShowable: () => {
      const def = getLayerDef(activeLayer);
      return def?.kind === 'field' || def?.kind === 'particles';
    },
  });
  // Thin wrappers preserve historic names used by the multi-metric
  // tooltip + field/wind refresh paths.
  const removeCityValues = (): void => cityValues.remove();
  const refreshCityValues = (): void => cityValues.refresh();
  // Backing flag mirrored by the overlay registry entry below.
  let cityValuesEnabled = true;

  // Pressure isobars — extracted to src/lib/map/layers/isobars.ts.
  const isobarsLayer = createIsobarsLayer(map);
  const removeIsobars = (): void => isobarsLayer.remove();

  // Graticule overlay — extracted to src/lib/map/overlays/graticule.ts
  const graticuleOverlay = createGraticuleOverlay(map);

  // Night lights + night line overlays — extracted to modules.
  const nightLightsOverlay = createNightLightsOverlay(map);
  const nightLineOverlay = createNightLineOverlay(map);

  // Borders overlay — extracted to src/lib/map/overlays/borders.ts.
  const bordersOverlay = createBordersOverlay(map, {
    fetch: cachedFetch,
    base,
  });

  // Radar coverage overlay — extracted to src/lib/map/overlays/radar-coverage.ts.
  const radarCoverageOverlay = createRadarCoverageOverlay(map);

  // Fires overlay — extracted to src/lib/map/overlays/fires.ts. Takes
  // cachedFetch + the site base for the cached JSON path.
  const firesOverlay = createFiresOverlay(map, {
    fetch: cachedFetch,
    base,
  });

  // Static MX-unique overlays — extracted to per-module factories
  // under src/lib/map/overlays/. Single line per overlay because all
  // the implementation (data list + add/remove logic) lives in the
  // module, not here.
  const lakesOverlay = createLakesOverlay(map);
  const histStormsOverlay = createHistStormsOverlay(map, {
    fetch: cachedFetch,
    base,
  });
  const webcamsOverlay = createWebcamsOverlay(map);

  // Active volcanoes overlay — extracted to src/lib/map/overlays/volcanoes.ts
  // (refactor: see PLAN_UX_PARITY.md §Refactor). Factory returns an
  // object matching the overlay registry interface.
  const volcanoesOverlay = createVolcanoesOverlay(map);
  const aqiOverlay = createAqiOverlay(map, { fetch: cachedFetch, base });
  const smnStateTintOverlay = createSmnStateTintOverlay(map, {
    fetch: cachedFetch,
    base,
  });
  const marineOverlay = createMarineOverlay(map, {
    fetch: cachedFetch,
    base,
  });

  // USGS earthquakes overlay — extracted to src/lib/map/overlays/quakes.ts
  // (refactor). The factory takes a fetch function so it can be the
  // existing cachedFetch in production and a stub in unit tests.
  const quakesOverlay = createQuakesOverlay(map, {
    fetch: cachedFetch,
    base,
  });

  // ----------------------------------------------------------------
  // Cloud cover overlay (zoom.earth's "Nubes" — translucent grayscale
  // cloud field over any base layer). Uses Open-Meteo cloud_cover
  // sampled on the same 32×24 MX grid, rendered as a grayscale raster
  // where alpha tracks cloud_cover %.
  // ----------------------------------------------------------------
  // Clouds overlay — extracted to src/lib/map/overlays/clouds.ts.
  const cloudsOverlay = createCloudsOverlay(map, {
    fetch: deps.fetch,
    bounds: MX_FIELD_BOUNDS,
    gridCols: FIELD_GRID_COLS,
    gridRows: FIELD_GRID_ROWS,
    getModel: () => activeModel,
    base,
  });


  // Tropical storms overlay — extracted to src/lib/map/overlays/tropical-storms.ts.
  // The factory takes the NHC source and an onEmpty callback so it
  // can auto-disable the checkbox when there are no active systems.
  const tropicalStormsOverlay = createTropicalStormsOverlay(
    map,
    createNhcSource(base),
    () => {
      tropicalEnabled = false;
      refreshOverlayCheckboxes();
    },
  );
  // Backwards-compat alias used by callers below (refreshTropicalStorms
  // is invoked from the map's 'load' handler).
  const refreshTropicalStorms = (): Promise<void> =>
    tropicalStormsOverlay.refresh();

  function refreshIsobars(): void {
    if (activeLayer !== 'pressure' || !fieldGrid || !fieldBounds) {
      isobarsLayer.remove();
      return;
    }
    // Pick the values at the active hour for every grid point, in
    // row-major order matching viewportGrid (south→north, west→east).
    const values: number[] = [];
    for (const p of fieldGrid.points) {
      const v = p.values[frameIndex];
      values.push(typeof v === 'number' ? v : NaN);
    }
    // d3-contour can't handle NaN, replace with field mean (rare).
    const finite = values.filter((v) => Number.isFinite(v));
    if (finite.length < 4) {
      isobarsLayer.remove();
      return;
    }
    const mean = finite.reduce((a, b) => a + b, 0) / finite.length;
    const safe = values.map((v) => (Number.isFinite(v) ? v : mean));
    isobarsLayer.update({
      values: safe,
      cols: FIELD_GRID_COLS,
      rows: FIELD_GRID_ROWS,
      bounds: fieldBounds,
    });
  }

  /**
   * Render the field's bilinearly interpolated continuous-gradient raster
   * for `hourIndex` and swap it into the FIELD_LAYER image source. First
   * call adds the source + raster layer; subsequent calls re-use the same
   * source via `updateImage`, revoking the previous Blob URL.
   *
   * In test environments where neither OffscreenCanvas nor a DOM canvas is
   * available, renderFieldRaster returns null and we skip the swap — the
   * layer is just absent (the e2e suite only asserts UI controls / opacity
   * wrap visibility for field layers, not the GL texture pixels).
   */
  async function renderFieldFrame(hourIndex: number): Promise<void> {
    const cfg = FIELD_CONFIGS[activeLayer];
    if (!fieldGrid || !fieldBounds || !cfg) return;
    // Isobars track the same field/frame as the pressure raster; refresh
    // them whenever the underlying grid or frame changes. No-op for other
    // field layers (early-returns inside refreshIsobars).
    refreshIsobars();
    // City value pills (zoom.earth "Valores de etiquetas") follow the same
    // cadence — value sampled via tooltipValueAt() at each city.
    refreshCityValues();
    const render = await renderFieldRaster(
      fieldGrid,
      FIELD_GRID_ROWS,
      FIELD_GRID_COLS,
      fieldBounds,
      hourIndex,
      cfg.color,
      { width: FIELD_RASTER_W, height: FIELD_RASTER_H },
    );
    if (!render) return;
    // Activelayer may have flipped while the canvas blob was settling.
    if (getLayerDef(activeLayer)?.kind !== 'field') {
      URL.revokeObjectURL(render.blobUrl);
      return;
    }
    const existing = map.getSource(FIELD_SOURCE) as
      | (maplibregl.ImageSource & {
          updateImage?: (opts: {
            url: string;
            coordinates?: ImageCorners;
          }) => void;
        })
      | undefined;
    if (existing && typeof existing.updateImage === 'function') {
      existing.updateImage({ url: render.blobUrl, coordinates: render.coords });
      revokeFieldBlob();
      fieldBlobUrl = render.blobUrl;
      return;
    }
    // Either no source yet, or the runtime stub lacks updateImage —
    // (re)create both the source and the layer.
    if (map.getLayer(FIELD_LAYER)) map.removeLayer(FIELD_LAYER);
    if (map.getSource(FIELD_SOURCE)) map.removeSource(FIELD_SOURCE);
    revokeFieldBlob();
    map.addSource(FIELD_SOURCE, {
      type: 'image',
      url: render.blobUrl,
      coordinates: render.coords,
    });
    map.addLayer({
      id: FIELD_LAYER,
      type: 'raster',
      source: FIELD_SOURCE,
      paint: {
        'raster-opacity': rvOpacity,
        'raster-fade-duration': 0,
        // Linear resampling is the critical bit — MapLibre's GPU does a
        // second bilinear pass on top of our 400×280 raster, smearing the
        // already-interpolated texels into a continuous gradient at any
        // zoom level. With nearest-neighbour the seams between texels
        // would still be visible at high zoom.
        'raster-resampling': 'linear',
      },
    });
    fieldBlobUrl = render.blobUrl;
  }

  /** Default hourly variables we pre-bake via the field-grids.yml
   *  workflow. When the user hasn't touched a sub-option AND is on
   *  best_match, the static cache is byte-compatible with the live
   *  response and we can skip the live API entirely. */
  const STATIC_FIELD_VARS: ReadonlySet<string> = new Set([
    'temperature_2m',
    'relative_humidity_2m',
    'pressure_msl',
    'cloud_cover',
  ]);

  async function loadFieldGrid(layerId: string): Promise<boolean> {
    const cfg = FIELD_CONFIGS[layerId];
    if (!cfg) return false;
    // Always sample on a FIXED grid covering Mexico + margin so the
    // bilinear interpolation gives stable values per lat/lng across
    // zoom levels. The raster image is drawn at MX_FIELD_BOUNDS — when
    // the viewport zooms in, MapLibre's raster-resampling: linear
    // smoothly upscales the same field; zooming changes detail, not
    // colors.
    const bounds: RasterBounds = { ...MX_FIELD_BOUNDS };
    const grid = viewportGrid(bounds, FIELD_GRID_COLS, FIELD_GRID_ROWS);
    fieldBounds = bounds;
    fieldAbort?.abort();
    const ac = new AbortController();
    fieldAbort = ac;

    // Static-first: when the current sub-option resolves to a pre-baked
    // hourly variable on best_match, try the snapshot before the live
    // API. Static returns the same FieldGrid shape so no conversion
    // needed; on miss / network failure we fall through to live.
    const wantsStatic =
      activeModel === 'best_match' && STATIC_FIELD_VARS.has(cfg.hourlyVar);
    if (wantsStatic) {
      try {
        const r = await deps.fetch(
          `${base}data/field-grids/${cfg.hourlyVar}.json`,
          { signal: ac.signal },
        );
        if (!ac.signal.aborted && r.ok) {
          const snap = (await r.json()) as FieldGrid | null;
          if (
            snap &&
            Array.isArray(snap.points) &&
            snap.points.length === grid.length &&
            Array.isArray(snap.times) &&
            snap.times.length > 0
          ) {
            fieldGrid = snap;
            if (layerId === 'temperature') lastTempGrid = snap;
            else if (layerId === 'humidity') lastHumidityGrid = snap;
            else if (layerId === 'pressure') lastPressureGrid = snap;
            if (fieldAbort === ac) fieldAbort = null;
            return true;
          }
        }
      } catch {
        /* fall through to live */
      }
      if (ac.signal.aborted) return false;
    }

    // Cold-load resilience: the first Open-Meteo fetch occasionally
    // fails (network race on page init, transient DNS, etc.). Retry
    // once after 500 ms before falling back to base layer — empirically
    // resolves the URL-hash cold-load failure where ?layer=temperature
    // sometimes activated as base.
    //
    // Chunked: at 32×24=768 points the single-request URL exceeds
    // Open-Meteo's ~8 KB GET limit and the server returns HTTP 414.
    // fetchFieldChunks splits into ≤200-point batches under the hood
    // and concatenates the response arrays in input order.
    async function attempt(): Promise<unknown[]> {
      return fetchFieldChunks(grid, cfg.hourlyVar, deps.fetch, {
        signal: ac.signal,
        model: activeModel,
      });
    }
    try {
      let json: unknown[];
      try {
        json = await attempt();
      } catch {
        if (ac.signal.aborted) return false;
        await new Promise((r) => setTimeout(r, 500));
        if (ac.signal.aborted) return false;
        json = await attempt();
      }
      if (ac.signal.aborted) return false;
      fieldGrid = parseFieldResponse(json, grid, cfg.hourlyVar);
      // Cache per layer so the multi-metric tooltip can read it later
      // even when the user has switched to a different layer.
      if (fieldGrid) {
        if (layerId === 'temperature') lastTempGrid = fieldGrid;
        else if (layerId === 'humidity') lastHumidityGrid = fieldGrid;
        else if (layerId === 'pressure') lastPressureGrid = fieldGrid;
      }
    } catch {
      if (ac.signal.aborted) return false;
      fieldGrid = null;
    } finally {
      if (fieldAbort === ac) fieldAbort = null;
    }
    return !!fieldGrid && fieldGrid.points.length > 0;
  }

  // Radar/satellite weather raster + dim backdrop — extracted to
  // src/lib/map/layers/weather-raster.ts. The factory exposes show /
  // remove / setOpacity. We bind it to the existing showMsg/hideMsg so
  // the satellite zoom-limit hint still surfaces from this map's UI.
  const weatherRaster = createWeatherRaster(map, {
    showMsg,
    hideMsg,
  });
  const removeWeatherRaster = (): void => weatherRaster.remove();
  const showWeatherFrame = (layerId: string, frame: RadarFrame): void => {
    weatherRaster.show(
      layerId === 'satellite' ? 'satellite' : 'radar',
      frame,
      {
        rvData,
        satelliteSubOption,
        opacity: rvOpacity,
        currentZoom: map.getZoom(),
      },
    );
  };

  function renderLegend(
    kind: 'radar' | 'temperature' | 'humidity' | 'pressure' | 'wind' | null,
  ): void {
    const el = opts.els.legend;
    const bar = document.getElementById('legend-bar');
    const unitEl = document.getElementById('legend-unit');
    if (!el) return;
    if (!kind) {
      el.innerHTML = '';
      // Inline display:none beats the base sm:flex utility in the
      // cascade — otherwise the legend would stay visible at sm+.
      if (bar) bar.style.display = 'none';
      if (unitEl) unitEl.textContent = '';
      return;
    }
    const stops: LegendStop[] =
      kind === 'radar'
        ? RADAR_LEGEND.map((s) => ({
            label: t[s.labelKey as keyof typeof t] as string,
            color: s.color,
          }))
        : kind === 'temperature'
          ? getTempLegend()
          : kind === 'humidity'
            ? HUMIDITY_LEGEND
            : kind === 'pressure'
              ? PRESSURE_LEGEND
              : WIND_LEGEND.map((s) => ({
                  label: t[s.labelKey as keyof typeof t] as string,
                  color: s.color,
                }));
    // Horizontal stop layout (plan P0.2): a 28×12 swatch with the
    // label below, similar to zoom.earth's bottom-left scale.
    el.innerHTML = stops
      .map(
        (s) =>
          `<li class="flex flex-col items-center gap-0.5 leading-none"><span class="inline-block h-2.5 w-7" style="background:${esc(
            s.color,
          )}"></span><span class="text-[10px] tabular-nums">${esc(s.label)}</span></li>`,
      )
      .join('');
    // Unit label varies per layer kind. zoom.earth shows °C for the
    // temperature scale; we mirror that for each metric.
    const unit: Record<typeof kind & string, string> = {
      radar: 'mm/h',
      temperature: '°C',
      humidity: '%',
      pressure: 'hPa',
      wind: 'km/h',
    } as Record<string, string>;
    if (unitEl) unitEl.textContent = unit[kind] ?? '';
    if (bar) bar.style.display = '';
  }

  function refreshLayerButtons(): void {
    const wrap = opts.els.layerBtns;
    if (!wrap) return;
    for (const def of LAYERS) {
      const btn = wrap.querySelector(`#layerbtn-${def.id}`);
      if (btn) btn.setAttribute('aria-pressed', String(def.id === activeLayer));
    }
    refreshTempSubOptions();
    refreshHumiditySubOptions();
    refreshPressureSubOptions();
    refreshWindSubOptions();
    refreshSatelliteSubOptions();
    // Plan P2.6: reconcile the wind overlay so it persists across
    // layer changes. addWindOverlay() is async-safe and idempotent;
    // removeWindOverlay() refuses to touch the wind layer when it
    // belongs to the active layer (activeLayer === 'wind').
    if (activeLayer !== 'wind') {
      if (windOverlayEnabled && !map.getLayer(WIND_LAYER)) {
        void addWindOverlay();
      } else if (!windOverlayEnabled && map.getLayer(WIND_LAYER)) {
        removeWindOverlay();
      }
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
    // Hide the hover tooltip when switching to a layer that doesn't
    // expose per-pixel values (or back to base). The next mousemove
    // re-evaluates tooltipValueAt and re-shows when appropriate.
    if (activeLayer === 'base' || akind === 'raster-tile') {
      hideTooltip();
    }
  }

  // ------------------------------------------------------------------
  // Hover tooltip — zoom.earth-style floating card following the cursor
  // with the value at that pixel for the active field/wind/sun layer.
  //
  // We re-use the cheap bilinear sample (bilerpValue) rather than the
  // bicubic the raster uses — at one point per pointermove the visual
  // difference is invisible and bilinear is half the cost. The grid is
  // already at 10×7 with edge clamping so the interpolation reaches the
  // whole viewport.
  // ------------------------------------------------------------------
  const tooltipEl = opts.els.tooltip ?? null;
  // Avoid layout thrash by only writing to the tooltip when its content
  // changes (typing into the DOM with the same string would still
  // invalidate styles in some browsers).
  let lastTooltipText: string | null = null;

  function hideTooltip(): void {
    if (!tooltipEl) return;
    if (!tooltipEl.classList.contains('hidden')) {
      tooltipEl.classList.add('hidden');
    }
    lastTooltipText = null;
  }

  function setTooltip(text: string, x: number, y: number): void {
    if (!tooltipEl) return;
    if (text !== lastTooltipText) {
      tooltipEl.textContent = text;
      lastTooltipText = text;
    }
    // Offset so the cursor doesn't cover the card. The container is the
    // map root (position: relative), and e.point is canvas-relative —
    // which equals map-root-relative when the canvas fills the root, so
    // we can use e.point.x/y directly. The 14px offset clears the
    // pointer arrow and the GL cursor on mobile.
    tooltipEl.style.left = `${x + 14}px`;
    tooltipEl.style.top = `${y + 14}px`;
    if (tooltipEl.classList.contains('hidden')) {
      tooltipEl.classList.remove('hidden');
    }
  }

  /**
   * Multi-metric tooltip at the cursor. zoom.earth shows only the
   * active layer's value; we additionally surface any other previously-
   * loaded metric (temp, humidity, pressure) so the user sees the full
   * weather context with one hover. Returns null when no data is
   * available at this point.
   *
   * Format: "26°\n78%\n1014 hPa" — newline-separated; the floating
   * tooltip div whitespace-preserves them via CSS.
   */
  function tooltipValueAt(lng: number, lat: number): string | null {
    const def = getLayerDef(activeLayer);
    if (!def) return null;
    if (def.kind === 'field' || def.kind === 'particles') {
      if (!fieldBounds || frameIndex < 0) return null;
      const bounds = fieldBounds;
      const lines: string[] = [];
      const sampleField = (g: FieldGrid | null): number | null =>
        g
          ? bilerpValue(
              g,
              FIELD_GRID_ROWS,
              FIELD_GRID_COLS,
              bounds,
              lat,
              lng,
              frameIndex,
            )
          : null;

      // Temperature
      const tGrid = activeLayer === 'temperature' ? fieldGrid : lastTempGrid;
      const tVal = sampleField(tGrid);
      if (tVal !== null) lines.push(`🌡 ${Math.round(tVal)}°`);

      // Humidity
      const hGrid = activeLayer === 'humidity' ? fieldGrid : lastHumidityGrid;
      const hVal = sampleField(hGrid);
      if (hVal !== null) lines.push(`💧 ${Math.round(hVal)}%`);

      // Pressure
      const pGrid = activeLayer === 'pressure' ? fieldGrid : lastPressureGrid;
      const pVal = sampleField(pGrid);
      if (pVal !== null) lines.push(`🧭 ${Math.round(pVal)} hPa`);

      if (lines.length === 0 && def.kind !== 'particles') {
        // Fall through to legacy single-value behavior for field layers
        // when no cached grids exist yet (first paint).
        if (fieldGrid) {
          const v = bilerpValue(
            fieldGrid,
            FIELD_GRID_ROWS,
            FIELD_GRID_COLS,
            fieldBounds,
            lat,
            lng,
            frameIndex,
          );
          if (v === null) return null;
          if (activeLayer === 'temperature') return `${Math.round(v)}°`;
          if (activeLayer === 'humidity') return `${Math.round(v)}%`;
          if (activeLayer === 'pressure') return `${Math.round(v)} hPa`;
          return `${Math.round(v)}`;
        }
        return null;
      }

      if (def.kind === 'field') {
        return lines.join('\n');
      }
      // particles continues below (wind) and appends to lines
    }
    if (def.kind === 'particles') {
      // Wind: lerp u/v at the cursor, then derive speed (km/h) +
      // cardinal heading. The wind grid is 8×6 covering the same
      // viewport bounds as the field grid (fieldBounds is the latest
      // viewportGrid bounds). When no wind grid is present we can't
      // sample — fall back to hiding the tooltip.
      if (!windGrid || !fieldBounds || frameIndex < 0) return null;
      const wg = windGrid;
      const fb = fieldBounds;
      const sampleUv = (h: number): { u: number; v: number } | null => {
        // Build a 1-hour pseudo-field of u and v and call bilerp on each
        // separately. We can't call bilerpValue on the WindGrid directly
        // because its shape differs (u/v vs values); inline the same
        // bilinear lerp here for the 8×6 wind grid.
        const cols = 8;
        const rows = 6;
        if (wg.points.length !== cols * rows) return null;
        const dLng = fb.east - fb.west;
        const dLat = fb.north - fb.south;
        if (dLng <= 0 || dLat <= 0) return null;
        let fx = ((lng - fb.west) / dLng) * (cols - 1);
        let fy = ((lat - fb.south) / dLat) * (rows - 1);
        if (fx < 0) fx = 0;
        if (fx > cols - 1) fx = cols - 1;
        if (fy < 0) fy = 0;
        if (fy > rows - 1) fy = rows - 1;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const x1 = Math.min(x0 + 1, cols - 1);
        const y1 = Math.min(y0 + 1, rows - 1);
        const tx = fx - x0;
        const ty = fy - y0;
        const p00 = wg.points[y0 * cols + x0];
        const p10 = wg.points[y0 * cols + x1];
        const p01 = wg.points[y1 * cols + x0];
        const p11 = wg.points[y1 * cols + x1];
        const u00 = p00?.u[h];
        const u10 = p10?.u[h];
        const u01 = p01?.u[h];
        const u11 = p11?.u[h];
        const v00 = p00?.v[h];
        const v10 = p10?.v[h];
        const v01 = p01?.v[h];
        const v11 = p11?.v[h];
        if (
          u00 == null || u10 == null || u01 == null || u11 == null ||
          v00 == null || v10 == null || v01 == null || v11 == null
        ) return null;
        const au = u00 * (1 - tx) + u10 * tx;
        const bu = u01 * (1 - tx) + u11 * tx;
        const av = v00 * (1 - tx) + v10 * tx;
        const bv = v01 * (1 - tx) + v11 * tx;
        return { u: au * (1 - ty) + bu * ty, v: av * (1 - ty) + bv * ty };
      };
      const uv = sampleUv(frameIndex);
      if (!uv) return null;
      const speedMps = Math.hypot(uv.u, uv.v);
      const kmh = Math.round(speedMps * 3.6);
      // Heading = direction wind is BLOWING TOWARD (math convention).
      // 0° = east (positive u), 90° = north (positive v). Convert to
      // compass bearing where 0° = north, 90° = east, then cardinal.
      const bearing = (Math.atan2(uv.u, uv.v) * 180) / Math.PI;
      const norm = ((bearing % 360) + 360) % 360;
      const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      const idx = Math.round(norm / 45) % 8;
      const windLine = `💨 ${kmh} km/h ${cardinals[idx]}`;
      // Wind layer: combine with cached field grids (multi-metric).
      const fLines: string[] = [];
      const wb = fieldBounds;
      const sample = (g: FieldGrid | null): number | null =>
        g && wb
          ? bilerpValue(
              g,
              FIELD_GRID_ROWS,
              FIELD_GRID_COLS,
              wb,
              lat,
              lng,
              frameIndex,
            )
          : null;
      const tV = sample(lastTempGrid);
      if (tV !== null) fLines.push(`🌡 ${Math.round(tV)}°`);
      const hV = sample(lastHumidityGrid);
      if (hV !== null) fLines.push(`💧 ${Math.round(hV)}%`);
      const pV = sample(lastPressureGrid);
      if (pV !== null) fLines.push(`🧭 ${Math.round(pV)} hPa`);
      fLines.push(windLine);
      return fLines.join('\n');
    }
    if (def.kind === 'overlay' && activeLayer === 'sol') {
      // Day/Night = angular distance from subsolar point < or > 90°.
      // No polygon math needed; this is the same condition the
      // terminatorPolygon helper uses to draw the boundary.
      const sun = solarPosition(Date.now());
      const DEG = Math.PI / 180;
      const cosDist =
        Math.sin(sun.lat * DEG) * Math.sin(lat * DEG) +
        Math.cos(sun.lat * DEG) *
          Math.cos(lat * DEG) *
          Math.cos((lng - sun.lng) * DEG);
      return cosDist >= 0 ? 'Día' : 'Noche';
    }
    return null;
  }

  function handleHover(
    lng: number,
    lat: number,
    pointX: number,
    pointY: number,
  ): void {
    if (!tooltipEl) return;
    const text = tooltipValueAt(lng, lat);
    if (text === null) {
      hideTooltip();
      return;
    }
    setTooltip(text, pointX, pointY);
  }

  if (tooltipEl) {
    map.on('mousemove', (e) => {
      handleHover(e.lngLat.lng, e.lngLat.lat, e.point.x, e.point.y);
    });
    map.on('mouseout', hideTooltip);
    // Map drags fire mousemove with stale lngLat under some browsers —
    // a fresh mouseleave on the canvas is the most reliable hide.
    map.getCanvas().addEventListener('mouseleave', hideTooltip);
    // Touch: hide on touchend, follow on touchmove. We need the same
    // canvas-relative coordinates Maplibre uses, so unproject the touch
    // x/y via the map's unproject helper.
    const canvas = map.getCanvas();
    const onTouchMove = (ev: TouchEvent): void => {
      if (!ev.touches || ev.touches.length === 0) return;
      const t0 = ev.touches[0];
      const rect = canvas.getBoundingClientRect();
      const x = t0.clientX - rect.left;
      const y = t0.clientY - rect.top;
      const ll = map.unproject([x, y]);
      handleHover(ll.lng, ll.lat, x, y);
    };
    canvas.addEventListener('touchmove', onTouchMove, { passive: true });
    canvas.addEventListener('touchend', hideTooltip);
    canvas.addEventListener('touchcancel', hideTooltip);
  }

  /**
   * Layer first-use explainer (zoom.earth shows a modal the first time
   * the user opens each layer). We use a non-modal inline showMsg() so
   * the user can keep interacting with the map. Persisted per-layer in
   * localStorage so it only appears once.
   */
  const LAYER_EXPLAINERS: Record<string, string> = {
    radar:
      'Radar muestra precipitación detectada (lluvia, nieve) en tiempo casi real desde RainViewer. Usa Animación de lluvia (P) para reproducir.',
    satellite:
      'Satélite usa NASA GIBS GOES-East IR — nubes en infrarrojo. Activa N para ver luces nocturnas (VIIRS).',
    temperature:
      'Temperatura del aire a 2 m sobre el suelo, gradiente continuo. Sub-opción Aparente incluye humedad y viento (sensación térmica).',
    humidity:
      'Humedad relativa o punto de rocío a 2 m, según sub-opción. Mayor humedad = sensación más pesada al mismo calor.',
    pressure:
      'Presión atmosférica. Sub-opción Nivel del mar (msl) es la presión reducida estándar usada en meteorología; Superficie respeta la altitud real.',
    wind: 'Velocidad y dirección del viento a 10 m. Activa Rachas para ver las máximas instantáneas en lugar del promedio.',
    sunlight:
      'Posición del Sol y zonas en sombra (terminador día/noche). Activa Límite nocturno (O) para ver sólo la línea sobre cualquier capa.',
  };
  function maybeShowLayerExplainer(id: string): void {
    const text = LAYER_EXPLAINERS[id];
    if (!text) return;
    let seen: Record<string, true>;
    try {
      seen = JSON.parse(
        window.localStorage.getItem('mw:seen-layer-explainer') ?? '{}',
      ) as Record<string, true>;
    } catch {
      seen = {};
    }
    if (seen[id]) return;
    seen[id] = true;
    try {
      window.localStorage.setItem(
        'mw:seen-layer-explainer',
        JSON.stringify(seen),
      );
    } catch {
      /* private mode — fall through */
    }
    showMsg(text);
    // Auto-dismiss after ~8 s so it doesn't linger forever.
    window.setTimeout(() => hideMsg(), 8000);
  }

  async function setActiveLayer(id: string): Promise<void> {
    const def = getLayerDef(id);
    if (!def) return;
    maybeShowLayerExplainer(id);
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
        const speedVar = windSubOption === 'rachas'
          ? 'wind_gusts_10m'
          : 'wind_speed_10m';
        // Cold-load resilience: same retry pattern as loadFieldGrid (#164).
        // Wind layer activation from a fresh URL hash like ?layer=wind
        // sometimes hit TypeError: Failed to fetch on first try and fell
        // back to base. A single 500 ms retry resolves the transient.
        async function attempt(): Promise<unknown[]> {
          return await fetchWindChunks(grid, speedVar, deps.fetch, {
            signal: ac.signal,
            model: activeModel,
          });
        }
        let json: unknown[];
        try {
          json = await attempt();
        } catch {
          if (ac.signal.aborted) {
            removeWind();
            removeSun();
            activeLayer = 'base';
            refreshLayerButtons();
            syncHash();
            return;
          }
          await new Promise((r) => setTimeout(r, 500));
          if (ac.signal.aborted) {
            removeWind();
            removeSun();
            activeLayer = 'base';
            refreshLayerButtons();
            syncHash();
            return;
          }
          json = await attempt();
        }
        if (ac.signal.aborted) {
          removeWind();
          removeSun();
          activeLayer = 'base';
          refreshLayerButtons();
          syncHash();
          return;
        }
        windGrid = parseWindResponse(json, grid, speedVar);
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
      sunLayer.startTicker(60_000);
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
        'flex items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-blue-500/10 aria-pressed:bg-blue-500/15 aria-pressed:font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-blue-400/10';
      // zoom.earth-style icon prefix; falls back to text-only when LayerDef
      // has no icon glyph.
      if (def.icon) {
        const iconSpan = document.createElement('span');
        iconSpan.setAttribute('aria-hidden', 'true');
        iconSpan.textContent = def.icon;
        iconSpan.className = 'text-base leading-none';
        btn.appendChild(iconSpan);
      }
      const labelSpan = document.createElement('span');
      labelSpan.textContent = t[def.labelKey as keyof typeof t];
      // Hide label text on narrow viewports — the icon + tooltip carry
      // the meaning and the rail stays narrow on mobile (zoom.earth
      // parity). Desktop (>=sm) sees full text.
      labelSpan.className = 'hidden sm:inline';
      btn.appendChild(labelSpan);
      // For screen readers we still need the label; the title attribute
      // already includes it but ensure SR users get it.
      if (!btn.getAttribute('aria-label')) {
        btn.setAttribute(
          'aria-label',
          t[def.labelKey as keyof typeof t] ?? def.id,
        );
      }
      // Keyboard shortcut hint as a tiny trailing chip on desktop. Hidden
      // on narrow screens to keep the rail compact.
      if (def.shortcut) {
        const kbd = document.createElement('kbd');
        kbd.textContent = def.shortcut;
        kbd.className =
          'ml-auto hidden rounded border border-gray-500/40 px-1 text-xs font-mono text-gray-400 lg:inline';
        btn.appendChild(kbd);
        btn.title = `${t[def.labelKey as keyof typeof t]} (${def.shortcut})`;
      }
      btn.addEventListener('click', () => void setActiveLayer(def.id));
      wrap.appendChild(btn);
    }
  }
  buildLayerButtons();

  // ----------------------------------------------------------------
  // Settings panel wiring — pressed-state + click handlers for
  // the timezone (local/UTC) and hour format (12/24) toggle groups.
  // Pure DOM; settings persist via writeSettings(). On change the
  // timeline label re-renders so the user sees their preference take
  // effect immediately.
  // ----------------------------------------------------------------
  function refreshSettingsButtons(): void {
    if (!features.layerRail) return;
    const cur = readSettings();
    document
      .querySelectorAll<HTMLButtonElement>('[data-mw-tz] button')
      .forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.val === cur.tz));
      });
    document
      .querySelectorAll<HTMLButtonElement>('[data-mw-hour] button')
      .forEach((b) => {
        b.setAttribute(
          'aria-pressed',
          String(b.dataset.val === cur.hourFormat),
        );
      });
  }
  function bindSettingsButtons(): void {
    if (!features.layerRail) return;
    document
      .querySelectorAll<HTMLButtonElement>('[data-mw-tz] button')
      .forEach((b) => {
        b.addEventListener('click', () => {
          const val = b.dataset.val === 'UTC' ? 'UTC' : 'local';
          writeSettings({ ...readSettings(), tz: val });
          refreshSettingsButtons();
          // Re-render timeline label so the new tz takes effect.
          if (frameIndex >= 0 && tlFrames[frameIndex]) {
            const tt = opts.els.tlTime;
            if (tt) tt.textContent = frameLabel(tlFrames[frameIndex]);
          }
        });
      });
    document
      .querySelectorAll<HTMLButtonElement>('[data-mw-hour] button')
      .forEach((b) => {
        b.addEventListener('click', () => {
          const val = b.dataset.val === '12' ? '12' : '24';
          writeSettings({ ...readSettings(), hourFormat: val });
          refreshSettingsButtons();
          if (frameIndex >= 0 && tlFrames[frameIndex]) {
            const tt = opts.els.tlTime;
            if (tt) tt.textContent = frameLabel(tlFrames[frameIndex]);
          }
        });
      });
  }
  bindSettingsButtons();
  refreshSettingsButtons();

  // ----------------------------------------------------------------
  // Sub-options (zoom.earth's per-layer variants). Single generic
  // factory (createSubOptionsGroup) replaces five near-identical
  // copies — see src/lib/map/chrome/sub-options.ts.
  // ----------------------------------------------------------------
  const tempSub = createSubOptionsGroup<TempSubOption>(opts.els.layerBtns ?? null, {
    containerId: 'temp-sub-options',
    getActive: () => tempSubOption,
    onSelect: (id) => {
      tempSubOption = id;
      void setActiveLayer('temperature');
    },
    isVisible: () => activeLayer === 'temperature',
    options: [
      { id: 'actual', label: 'Actual' },
      { id: 'aparente', label: 'Aparente' },
      { id: 'bulbo', label: 'Bulbo húmedo' },
    ],
  });
  const refreshTempSubOptions = (): void => tempSub.refresh();

  const humiditySub = createSubOptionsGroup<HumiditySubOption>(
    opts.els.layerBtns ?? null,
    {
      containerId: 'humidity-sub-options',
      getActive: () => humiditySubOption,
      onSelect: (id) => {
        humiditySubOption = id;
        void setActiveLayer('humidity');
      },
      isVisible: () => activeLayer === 'humidity',
      options: [
        { id: 'relativa', label: 'Relativa' },
        { id: 'rocio', label: 'Punto de rocío' },
      ],
    },
  );
  const refreshHumiditySubOptions = (): void => humiditySub.refresh();

  const pressureSub = createSubOptionsGroup<PressureSubOption>(
    opts.els.layerBtns ?? null,
    {
      containerId: 'pressure-sub-options',
      getActive: () => pressureSubOption,
      onSelect: (id) => {
        pressureSubOption = id;
        void setActiveLayer('pressure');
      },
      isVisible: () => activeLayer === 'pressure',
      options: [
        { id: 'msl', label: 'Nivel del mar' },
        { id: 'surface', label: 'Superficie' },
      ],
    },
  );
  const refreshPressureSubOptions = (): void => pressureSub.refresh();

  const windSub = createSubOptionsGroup<WindSubOption>(opts.els.layerBtns ?? null, {
    containerId: 'wind-sub-options',
    getActive: () => windSubOption,
    onSelect: (id) => {
      windSubOption = id;
      void setActiveLayer('wind');
    },
    isVisible: () => activeLayer === 'wind',
    options: [
      { id: 'velocidad', label: 'Velocidad' },
      { id: 'rachas', label: 'Rachas' },
    ],
  });
  const refreshWindSubOptions = (): void => windSub.refresh();

  const satelliteSub = createSubOptionsGroup<SatelliteSubOption>(
    opts.els.layerBtns ?? null,
    {
      containerId: 'satellite-sub-options',
      getActive: () => satelliteSubOption,
      onSelect: (id) => {
        satelliteSubOption = id;
        void setActiveLayer('satellite');
      },
      isVisible: () => activeLayer === 'satellite',
      options: [
        { id: 'geocolor', label: 'GeoColor' },
        { id: 'ir', label: 'Infrarrojo' },
        { id: 'truecolor', label: 'Color real' },
      ],
    },
  );
  const refreshSatelliteSubOptions = (): void => satelliteSub.refresh();

  // ----------------------------------------------------------------
  // Overlays menu — zoom.earth's "Superposiciones" panel. Each entry
  // declares its label + keyboard shortcut + toggle function so the
  // UI checkboxes and the global keydown handler stay in sync via
  // refreshOverlayCheckboxes().
  // ----------------------------------------------------------------
  interface OverlayDef {
    id:
      | 'graticule'
      | 'tropical'
      | 'nightLights'
      | 'nightLine'
      | 'borders'
      | 'fires'
      | 'radarCoverage'
      | 'clouds'
      | 'quakes'
      | 'volcanoes'
      | 'colorBlind'
      | 'cityValues'
      | 'windOverlay'
      | 'aqi'
      | 'marine'
      | 'webcams'
      | 'lakes'
      | 'histStorms'
      | 'smnStateTint';
    label: string;
    shortcut: string;
    isEnabled: () => boolean;
    setEnabled: (on: boolean) => void;
  }
  let tropicalEnabled = true;
  const overlayDefs: OverlayDef[] = [
    {
      id: 'tropical',
      label: 'Sistemas tropicales',
      shortcut: 'T',
      isEnabled: () => tropicalEnabled,
      setEnabled: (on) => {
        tropicalEnabled = on;
        tropicalStormsOverlay.setEnabled(on);
      },
    },
    {
      id: 'graticule',
      label: 'Retícula',
      shortcut: 'X',
      isEnabled: () => graticuleOverlay.isEnabled(),
      setEnabled: (on) => graticuleOverlay.setEnabled(on),
    },
    {
      id: 'nightLights',
      label: 'Luces nocturnas',
      shortcut: 'N',
      isEnabled: () => nightLightsOverlay.isEnabled(),
      setEnabled: (on) => nightLightsOverlay.setEnabled(on),
    },
    {
      id: 'nightLine',
      label: 'Límite nocturno',
      shortcut: 'O',
      isEnabled: () => nightLineOverlay.isEnabled(),
      setEnabled: (on) => nightLineOverlay.setEnabled(on),
    },
    {
      id: 'borders',
      label: 'Líneas fronteras',
      shortcut: 'F',
      isEnabled: () => bordersOverlay.isEnabled(),
      setEnabled: (on) => {
        void bordersOverlay.setEnabled(on);
      },
    },
    {
      id: 'fires',
      label: 'Incendios activos',
      shortcut: 'I',
      isEnabled: () => firesOverlay.isEnabled(),
      setEnabled: (on) => {
        void firesOverlay.setEnabled(on);
      },
    },
    {
      id: 'radarCoverage',
      label: 'Cobertura de radar',
      shortcut: 'Q',
      isEnabled: () => radarCoverageOverlay.isEnabled(),
      setEnabled: (on) => radarCoverageOverlay.setEnabled(on),
    },
    {
      id: 'clouds',
      label: 'Nubes',
      shortcut: 'U',
      isEnabled: () => cloudsOverlay.isEnabled(),
      setEnabled: (on) => {
        void cloudsOverlay.setEnabled(on);
      },
    },
    {
      id: 'quakes',
      label: 'Sismos (USGS)',
      shortcut: 'K',
      isEnabled: () => quakesOverlay.isEnabled(),
      setEnabled: (on) => {
        void quakesOverlay.setEnabled(on);
      },
    },
    {
      id: 'volcanoes',
      label: 'Volcanes activos',
      shortcut: 'J',
      isEnabled: () => volcanoesOverlay.isEnabled(),
      setEnabled: (on) => volcanoesOverlay.setEnabled(on),
    },
    {
      id: 'cityValues',
      label: 'Valores de etiquetas',
      shortcut: 'E',
      isEnabled: () => cityValues.isEnabled(),
      setEnabled: (on) => {
        cityValuesEnabled = on;
        cityValues.setEnabled(on);
      },
    },
    {
      id: 'windOverlay',
      label: 'Animación de viento',
      shortcut: 'C',
      isEnabled: () => windOverlayEnabled || activeLayer === 'wind',
      setEnabled: (on) => {
        windOverlayEnabled = on;
        if (on) {
          void addWindOverlay();
        } else {
          removeWindOverlay();
        }
      },
    },
    {
      id: 'aqi',
      label: 'Calidad del aire (PM2.5)',
      shortcut: 'Y',
      isEnabled: () => aqiOverlay.isEnabled(),
      setEnabled: (on) => {
        void aqiOverlay.setEnabled(on);
      },
    },
    {
      id: 'smnStateTint',
      label: 'Alertas SMN por estado',
      shortcut: 'A',
      isEnabled: () => smnStateTintOverlay.isEnabled(),
      setEnabled: (on) => {
        void smnStateTintOverlay.setEnabled(on);
      },
    },
    {
      id: 'marine',
      label: 'Playas (oleaje + SST)',
      shortcut: 'Z',
      isEnabled: () => marineOverlay.isEnabled(),
      setEnabled: (on) => {
        void marineOverlay.setEnabled(on);
      },
    },
    {
      id: 'webcams',
      label: 'Cámaras en vivo',
      shortcut: 'W',
      isEnabled: () => webcamsOverlay.isEnabled(),
      setEnabled: (on) => webcamsOverlay.setEnabled(on),
    },
    {
      id: 'lakes',
      label: 'Lagos y presas',
      shortcut: 'G',
      isEnabled: () => lakesOverlay.isEnabled(),
      setEnabled: (on) => lakesOverlay.setEnabled(on),
    },
    {
      id: 'histStorms',
      label: 'Huracanes notables MX',
      shortcut: 'D',
      isEnabled: () => histStormsOverlay.isEnabled(),
      setEnabled: (on) => histStormsOverlay.setEnabled(on),
    },
    {
      id: 'colorBlind',
      label: 'Paleta accesible',
      shortcut: 'B',
      isEnabled: () => getColorBlindMode(),
      setEnabled: (on) => {
        setColorBlindMode(on);
        // Re-render temperature: legend swap + raster recolour.
        if (activeLayer === 'temperature') {
          void setActiveLayer('temperature');
        }
      },
    },
  ];

  // Overlay registry — extracted to chrome/overlay-registry.ts. Owns
  // the Superposiciones panel build + the global keyboard shortcuts.
  const overlayRegistry = createOverlayRegistry(
    { wrap: features.layerRail ? opts.els.overlayBtns ?? null : null },
    overlayDefs,
    {
      layers: LAYERS.filter(
        (l): l is typeof l & { shortcut: string } => !!l.shortcut,
      ).map((l) => ({ shortcut: l.shortcut, id: l.id })),
      onLayerShortcut: (id) => void setActiveLayer(id),
    },
  );
  overlayRegistry.build();
  const refreshOverlayCheckboxes = (): void => overlayRegistry.refresh();
  if (features.layerRail) {
    (
      overlayRegistry as ReturnType<typeof createOverlayRegistry> & {
        installShortcuts: () => void;
      }
    ).installShortcuts();
  }

  const opacityEl = features.layerRail ? opts.els.opacity ?? null : null;
  if (opacityEl) {
    opacityEl.value = String(Math.round(rvOpacity * 100));
    opacityEl.addEventListener('input', () => {
      rvOpacity = Number(opacityEl.value) / 100;
      if (map.getLayer(RV_LAYER))
        map.setPaintProperty(RV_LAYER, 'raster-opacity', rvOpacity);
      if (map.getLayer(FIELD_LAYER))
        map.setPaintProperty(FIELD_LAYER, 'raster-opacity', rvOpacity);
      if (map.getLayer(WIND_CIRCLE_LAYER))
        map.setPaintProperty(WIND_CIRCLE_LAYER, 'circle-opacity', rvOpacity);
      // Sun layer reads rvOpacity via its opacityScaleFn closure on
      // each refresh — calling refresh() re-applies the expression to
      // both tiers without duplicating the constants here.
      sunLayer.refresh();
    });
  }

  // ------------------------------------------------------------------
  // Timeline play/pause loop — extracted to chrome/timeline-player.ts.
  // ------------------------------------------------------------------
  const tlPlayBtn = features.timeline ? (opts.els.tlPlay ?? null) : null;
  const tlPlayer = createTimelinePlayer(
    { playBtn: tlPlayBtn },
    { play: t.timeline_play, pause: t.timeline_pause },
    () => tlFrames.length,
    () => frameIndex,
    (i) => applyFrame(i),
  );
  const tlStop = (): void => tlPlayer.stop();
  const tlStart = (): void => tlPlayer.start();
  const tlReducedMotion = tlPlayer.reducedMotion();
  tlPlayBtn?.addEventListener('click', () => tlPlayer.toggle());

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
    // Day-skip + 'Ahora' (plan P0.3 — zoom.earth has these as separate
    // ↑↓ keys for hour and day). We compute the day-stride dynamically
    // from the frame timestamps because raster-tile frames are usually
    // ~10 min apart (RainViewer) while field/wind frames are 1 h apart.
    const dayStride = (): number => {
      if (tlFrames.length < 2) return 0;
      const a = tlFrames[0]?.time;
      const b = tlFrames[1]?.time;
      if (typeof a !== 'number' || typeof b !== 'number') return 0;
      const stepSec = Math.abs(b - a);
      if (stepSec <= 0) return 0;
      return Math.max(1, Math.round(86400 / stepSec));
    };
    document.getElementById('tl-day-prev')?.addEventListener('click', () => {
      if (tlFrames.length) {
        tlStop();
        applyFrame(frameIndex - dayStride());
      }
    });
    document.getElementById('tl-day-next')?.addEventListener('click', () => {
      if (tlFrames.length) {
        tlStop();
        applyFrame(frameIndex + dayStride());
      }
    });
    document.getElementById('tl-now')?.addEventListener('click', () => {
      if (tlFrames.length) {
        tlStop();
        // Pick the frame whose timestamp is closest to "now" (Date.now()/1000).
        const now = Date.now() / 1000;
        let best = 0;
        let bestDelta = Infinity;
        for (let i = 0; i < tlFrames.length; i++) {
          const t = tlFrames[i]?.time;
          if (typeof t !== 'number') continue;
          const d = Math.abs(t - now);
          if (d < bestDelta) {
            best = i;
            bestDelta = d;
          }
        }
        applyFrame(best);
      }
    });
    // Surface the day-skip + 'Ahora' buttons once frames are available.
    const surfaceWideControls = (): void => {
      if (!tlFrames.length) return;
      const dayPrev = document.getElementById('tl-day-prev');
      const dayNext = document.getElementById('tl-day-next');
      const now = document.getElementById('tl-now');
      // Day-stride buttons only when there are ≥48 frames covered (~2 days).
      const hasDays = dayStride() > 0 && tlFrames.length >= dayStride();
      dayPrev?.classList.toggle('hidden', !hasDays);
      dayNext?.classList.toggle('hidden', !hasDays);
      now?.classList.toggle('hidden', false);
    };
    // The frame array is rebuilt every time activeLayer changes; we re-
    // evaluate on each tick of the visibility refresh (frame change).
    const surfaceInterval = window.setInterval(surfaceWideControls, 1500);
    window.setTimeout(() => window.clearInterval(surfaceInterval), 30000);
  }

  if (features.search && q) {
    // Search collapse (plan P1.7). Icon-only by default; click reveals
    // the input; ESC or blur (when empty) collapses back to icon.
    const searchToggle = document.getElementById('mw-search-toggle');
    function expandSearch(): void {
      q?.classList.remove('hidden');
      searchToggle?.setAttribute('aria-expanded', 'true');
      try { q?.focus(); } catch { /* ignore */ }
    }
    function collapseSearch(): void {
      if (!q || q.value.trim().length > 0) return;
      q.classList.add('hidden');
      searchToggle?.setAttribute('aria-expanded', 'false');
    }
    searchToggle?.addEventListener('click', () => {
      const isHidden = q?.classList.contains('hidden');
      if (isHidden) expandSearch();
      else collapseSearch();
    });
    q.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        q.value = '';
        collapseSearch();
      }
    });
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
          const results = await geocode(query, deps, 'es', undefined, base);
          if (gen !== searchGen) return;
          if (!results.length) {
            closeAcList();
            showMsg(`${t.no_results} «${query}»`);
            return;
          }
          hideMsg();
          ac?.setResults(results);
        } catch {
          if (gen !== searchGen) return;
          closeAcList();
          showMsg(t.load_error);
        }
      }, 350);
    });

    q.addEventListener('keydown', (e: KeyboardEvent) => {
      const results = ac?.getResults() ?? [];
      if (results.length === 0) {
        if (e.key === 'Escape') closeAcList();
        return;
      }
      const active = ac?.getActiveIndex() ?? -1;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        ac?.setActiveIndex((active + 1) % results.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        ac?.setActiveIndex(active <= 0 ? results.length - 1 : active - 1);
      } else if (e.key === 'Enter') {
        if (active >= 0 && active < results.length) {
          e.preventDefault();
          // Re-uses the select callback the controller was wired with
          // via setResults's click handlers — but a keyboard Enter has
          // to dispatch manually. Simulate a click on the active option.
          const li = (acList?.children[active] ?? null) as HTMLElement | null;
          li?.click();
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

  // ----------------------------------------------------------------
  // Measure tools (plan P2.1). Two modes — 'distance' (open polyline)
  // and 'area' (closed polygon). Pure math lives in
  // src/lib/map/utils/measure.ts; this block is the MapLibre wiring.
  // ESC exits the active mode.
  if (features.layerRail) {
    const MEASURE_SOURCE = 'mw-measure-src';
    const MEASURE_LINE_LAYER = 'mw-measure-line';
    const MEASURE_POINTS_LAYER = 'mw-measure-points';
    type MeasureMode = 'distance' | 'area' | null;
    let measureMode: MeasureMode = null;
    let measurePts: [number, number][] = [];
    const distBtn = document.getElementById('mw-measure-distance');
    const areaBtn = document.getElementById('mw-measure-area');
    const wrap = document.getElementById('mw-measure-wrap');
    const resultEl = document.getElementById('mw-measure-result');
    function ensureMeasureLayers(): void {
      if (!map.getSource(MEASURE_SOURCE)) {
        map.addSource(MEASURE_SOURCE, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }
      if (!map.getLayer(MEASURE_LINE_LAYER)) {
        map.addLayer({
          id: MEASURE_LINE_LAYER,
          type: 'line',
          source: MEASURE_SOURCE,
          filter: ['==', ['geometry-type'], 'LineString'],
          paint: {
            'line-color': '#2563eb',
            'line-width': 2.5,
            'line-dasharray': [2, 2],
          },
        });
      }
      if (!map.getLayer(MEASURE_POINTS_LAYER)) {
        map.addLayer({
          id: MEASURE_POINTS_LAYER,
          type: 'circle',
          source: MEASURE_SOURCE,
          filter: ['==', ['geometry-type'], 'Point'],
          paint: {
            'circle-radius': 4,
            'circle-color': '#2563eb',
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.5,
          },
        });
      }
    }
    function refreshMeasureGeometry(): void {
      ensureMeasureLayers();
      const src = map.getSource(MEASURE_SOURCE) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (!src) return;
      const features: Feature[] = measurePts.map((p) => ({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: p },
      }));
      if (measurePts.length >= 2) {
        const coords =
          measureMode === 'area' && measurePts.length >= 3
            ? [...measurePts, measurePts[0]]
            : measurePts;
        features.push({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: coords },
        });
      }
      src.setData({ type: 'FeatureCollection', features });
    }
    function refreshMeasureResult(): void {
      if (!resultEl) return;
      if (!measureMode || measurePts.length < 1) {
        resultEl.classList.add('hidden');
        resultEl.textContent = '';
        return;
      }
      if (measureMode === 'distance') {
        if (measurePts.length < 2) {
          resultEl.textContent = 'Toca otro punto para medir';
        } else {
          const km = measurePolylineLen(measurePts);
          const n = measurePts.length - 1;
          resultEl.textContent = `${measureFmtDist(km)} · ${n} ${n === 1 ? 'segmento' : 'segmentos'}`;
        }
      } else {
        if (measurePts.length < 3) {
          resultEl.textContent = `Añade ${3 - measurePts.length} punto(s) más`;
        } else {
          const km2 = measureSphArea(measurePts);
          resultEl.textContent = measureFmtArea(km2);
        }
      }
      resultEl.classList.remove('hidden');
    }
    function setMeasureMode(next: MeasureMode): void {
      measureMode = next;
      measurePts = [];
      distBtn?.setAttribute('aria-pressed', String(next === 'distance'));
      areaBtn?.setAttribute('aria-pressed', String(next === 'area'));
      refreshMeasureGeometry();
      refreshMeasureResult();
      map.getCanvas().style.cursor = next ? 'crosshair' : '';
    }
    distBtn?.addEventListener('click', () => {
      setMeasureMode(measureMode === 'distance' ? null : 'distance');
    });
    areaBtn?.addEventListener('click', () => {
      setMeasureMode(measureMode === 'area' ? null : 'area');
    });
    map.on('click', (e) => {
      if (!measureMode) return;
      measurePts.push([e.lngLat.lng, e.lngLat.lat]);
      refreshMeasureGeometry();
      refreshMeasureResult();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && measureMode) {
        e.preventDefault();
        setMeasureMode(null);
      }
    });
    map.once('idle', () => {
      wrap?.classList.remove('hidden');
      wrap?.classList.add('flex');
    });
  }

  // ----------------------------------------------------------------
  // Model toggle (plan P1.1). The 5 pills at bottom-right let the user
  // override Open-Meteo's default best_match selector with a specific
  // NWP model. State is mirrored into the URL hash so #model=icon_seamless
  // round-trips. Changing model invalidates the cached grids and forces
  // a refetch via setActiveLayer.
  if (features.layerRail) {
    // Model toggle pills (plan P1.1) — DOM wiring extracted to
    // src/lib/map/chrome/model-toggle.ts. The caller still owns the
    // activeModel variable + the cache-invalidation side-effects.
    createModelToggle(
      { wrap: document.getElementById('mw-model-toggle') },
      () => activeModel,
      (next) => {
        activeModel = next;
        // Invalidate cached grids + force re-fetch with the new model.
        fieldGrid = null;
        lastTempGrid = null;
        lastHumidityGrid = null;
        lastPressureGrid = null;
        windGrid = null;
        if (
          activeLayer !== 'base' &&
          activeLayer !== 'satellite' &&
          activeLayer !== 'radar' &&
          activeLayer !== 'sunlight'
        ) {
          void setActiveLayer(activeLayer);
        }
        syncHash();
      },
    );
  }

  // Snapshot compare (plan 3.3). Captures the WebGL canvas to an
  // <img> overlay so the user can scrub the timeline or switch
  // layers and visually diff "antes" vs "ahora". Doesn't require any
  // extra network fetches — pure client-side canvas → data URL.
  // ----------------------------------------------------------------
  if (features.layerRail) {
    // Snapshot compare tool — extracted to chrome/snapshot-compare.ts.
    createSnapshotCompare({
      map,
      captureBtn: document.getElementById('mw-snapshot-capture'),
      toggleBtn: document.getElementById('mw-snapshot-toggle'),
      clearBtn: document.getElementById('mw-snapshot-clear'),
      imgEl: document.getElementById(
        'mw-snapshot-img',
      ) as HTMLImageElement | null,
    }).refresh();
  }

  return {
    map,
    destroy(): void {
      themeObserver?.disconnect();
      sunLayer.remove(); // also stops the internal ticker
      if (windRaf) window.cancelAnimationFrame(windRaf);
      tlPlayer.stop(); // clears the timeline timer if running
      try {
        map.remove();
      } catch {
        /* already removed */
      }
    },
  };
}

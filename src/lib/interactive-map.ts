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
  HUMIDITY_LEGEND,
  PRESSURE_LEGEND,
  getTempLegend,
  setColorBlindMode,
  getColorBlindMode,
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
  nhcSource,
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
    preserveDrawingBuffer: true,
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

  let pins: MapPin[] = features.presetPins ? presetPins(cities) : [];
  const markers: maplibregl.Marker[] = [];

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
      // MapLibre adds aria-label="Map marker" on a role-less div which
      // axe-core flags as aria-prohibited-attr. Add role=button to make
      // it valid + give it a real name (city / coords) so screen readers
      // announce something useful.
      try {
        const el = marker.getElement();
        el.setAttribute('role', 'button');
        el.setAttribute(
          'aria-label',
          p.name ? `Marcador: ${p.name}` : 'Marcador en el mapa',
        );
      } catch {
        /* best-effort */
      }
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

  // Settings persistence — zoom.earth-parity gear-icon panel writes here.
  interface MapSettings {
    tz: 'local' | 'UTC';
    hourFormat: '12' | '24';
  }
  function readSettings(): MapSettings {
    try {
      const raw = window.localStorage.getItem('mw:settings');
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<MapSettings>;
        return {
          tz: parsed.tz === 'UTC' ? 'UTC' : 'local',
          hourFormat: parsed.hourFormat === '12' ? '12' : '24',
        };
      }
    } catch {
      /* default below */
    }
    return { tz: 'local', hourFormat: '24' };
  }
  function writeSettings(s: MapSettings): void {
    try {
      window.localStorage.setItem('mw:settings', JSON.stringify(s));
    } catch {
      /* private mode — ignore */
    }
  }

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
      const res = await deps.fetch(
        buildWindUrl(grid, speedVar, activeModel),
      );
      if (!res.ok) return;
      const wg = parseWindResponse(await res.json(), grid, speedVar);
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
    // City value pills for wind (e.g. "12 km/h ↑").
    refreshCityValues();
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
      onAdd(_map: maplibregl.Map, gl: WebGLRenderingContext) {
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
      onRemove(_map: maplibregl.Map, gl: WebGLRenderingContext) {
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
      prerender(gl: WebGLRenderingContext) {
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
      render(gl: WebGLRenderingContext) {
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

  // ----------------------------------------------------------------
  // City value pills — zoom.earth's "Valores de etiquetas (B)" overlay.
  // For field/wind layers, paints the active layer's value over each
  // preset city as a small pill (e.g. "26°", "78%", "1014 hPa",
  // "12 km/h ↑"). Recomputed via tooltipValueAt() whenever the grid
  // or frame changes.
  // ----------------------------------------------------------------
  const CITY_VALUES_SOURCE = 'wx-city-values-src';
  const CITY_VALUES_LAYER = 'wx-city-values-text';

  function removeCityValues(): void {
    if (map.getLayer(CITY_VALUES_LAYER)) map.removeLayer(CITY_VALUES_LAYER);
    if (map.getSource(CITY_VALUES_SOURCE)) map.removeSource(CITY_VALUES_SOURCE);
  }

  // User toggle for the value pills overlay (plan P1.3). Default ON
  // because the value is exactly the feature that differentiates a
  // weather pill from a generic city label — but the user can hide it
  // to get a clean basemap view (e.g. for screenshot).
  let cityValuesEnabled = true;

  function refreshCityValues(): void {
    const def = getLayerDef(activeLayer);
    const showable =
      cityValuesEnabled && (def?.kind === 'field' || def?.kind === 'particles');
    if (!showable) {
      removeCityValues();
      return;
    }
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: cities
        .map((c) => {
          const value = tooltipValueAt(c.lng, c.lat);
          if (!value) return null;
          // Pre-compose label as "Name\nValue" so the symbol layer
          // uses a plain ['get','label'] expression — the format/
          // section expression in #167 was silently failing on the
          // MapLibre version we ship.
          const label = `${c.name}\n${value}`;
          return {
            type: 'Feature' as const,
            properties: { value, name: c.name, label },
            geometry: {
              type: 'Point' as const,
              coordinates: [c.lng, c.lat] as [number, number],
            },
          };
        })
        .filter((f): f is NonNullable<typeof f> => f !== null),
    };
    const existing = map.getSource(CITY_VALUES_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (existing) {
      existing.setData(fc);
      return;
    }
    map.addSource(CITY_VALUES_SOURCE, { type: 'geojson', data: fc });
    map.addLayer({
      id: CITY_VALUES_LAYER,
      type: 'symbol',
      source: CITY_VALUES_SOURCE,
      // Hide at country-wide zoom (≤4.99) to avoid label saturation
      // — at zoom 5 the labels start to be readable; at zoom 7+ the
      // value text reads clearly.
      minzoom: 5,
      layout: {
        // Pre-composed "Name\nValue" in properties.label. Plain getter
        // — no format/section expression because that silently failed
        // in production (#167 attempted format() but the layer didn't
        // get added at all — checked via source absence).
        'text-field': ['get', 'label'],
        'text-size': 12,
        'text-offset': [0, 1.4],
        'text-anchor': 'top',
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        'text-padding': 4,
        'text-line-height': 1.1,
        'text-font': ['Open Sans Semibold'],
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': 'rgba(0,0,0,0.75)',
        'text-halo-width': 1.4,
        'text-halo-blur': 0.2,
      },
    });
  }

  // ----------------------------------------------------------------
  // Isobars (Isolíneas de presión) — d3-contour iso-lines over the
  // pressure field. zoom.earth shows these as thin white contour lines
  // labeled in hPa. We render the contours only; labels TBD.
  // ----------------------------------------------------------------
  const ISOBAR_SOURCE = 'wx-isobars-src';
  const ISOBAR_LAYER = 'wx-isobars-line';

  function removeIsobars(): void {
    if (map.getLayer(ISOBAR_LAYER)) map.removeLayer(ISOBAR_LAYER);
    if (map.getSource(ISOBAR_SOURCE)) map.removeSource(ISOBAR_SOURCE);
  }

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
  const histStormsOverlay = createHistStormsOverlay(map);
  const webcamsOverlay = createWebcamsOverlay(map);

  // Active volcanoes overlay — extracted to src/lib/map/overlays/volcanoes.ts
  // (refactor: see PLAN_UX_PARITY.md §Refactor). Factory returns an
  // object matching the overlay registry interface.
  const volcanoesOverlay = createVolcanoesOverlay(map);
  const aqiOverlay = createAqiOverlay(map, { fetch: cachedFetch });
  const marineOverlay = createMarineOverlay(map, { fetch: cachedFetch });

  // USGS earthquakes overlay — extracted to src/lib/map/overlays/quakes.ts
  // (refactor). The factory takes a fetch function so it can be the
  // existing cachedFetch in production and a stub in unit tests.
  const quakesOverlay = createQuakesOverlay(map, { fetch: cachedFetch });

  // ----------------------------------------------------------------
  // Cloud cover overlay (zoom.earth's "Nubes" — translucent grayscale
  // cloud field over any base layer). Uses Open-Meteo cloud_cover
  // sampled on the same 32×24 MX grid, rendered as a grayscale raster
  // where alpha tracks cloud_cover %.
  // ----------------------------------------------------------------
  const CLOUDS_SOURCE = 'wx-clouds-src';
  const CLOUDS_LAYER = 'wx-clouds-layer';
  let cloudsBlobUrl: string | null = null;
  let cloudsAbort: AbortController | null = null;

  async function setCloudsEnabled(on: boolean): Promise<void> {
    if (!on) {
      if (map.getLayer(CLOUDS_LAYER)) map.removeLayer(CLOUDS_LAYER);
      if (map.getSource(CLOUDS_SOURCE)) map.removeSource(CLOUDS_SOURCE);
      cloudsAbort?.abort();
      if (cloudsBlobUrl) {
        try {
          URL.revokeObjectURL(cloudsBlobUrl);
        } catch {
          /* ignore */
        }
        cloudsBlobUrl = null;
      }
      return;
    }
    if (map.getSource(CLOUDS_SOURCE)) return;
    cloudsAbort?.abort();
    const ac = new AbortController();
    cloudsAbort = ac;
    const bounds: RasterBounds = { ...MX_FIELD_BOUNDS };
    const grid = viewportGrid(bounds, FIELD_GRID_COLS, FIELD_GRID_ROWS);
    try {
      const url = buildFieldUrl(grid, 'cloud_cover');
      const res = await deps.fetch(url, { signal: ac.signal });
      if (!res.ok || ac.signal.aborted) return;
      const cloudGrid = parseFieldResponse(
        await res.json(),
        grid,
        'cloud_cover',
      );
      if (!cloudGrid || ac.signal.aborted) return;
      // Render grayscale raster: alpha = clamp(cloud% / 100, 0..0.85).
      // White color so light cloud reads as haze, dense cloud reads as
      // solid white — matches zoom.earth's cloud appearance.
      const render = await renderFieldRaster(
        cloudGrid,
        FIELD_GRID_ROWS,
        FIELD_GRID_COLS,
        bounds,
        0, // first frame
        () => '#f8fafc', // near-white; alpha encodes density
        { width: 800, height: 560, alpha: 255 },
      );
      if (!render || ac.signal.aborted) return;
      cloudsBlobUrl = render.blobUrl;
      map.addSource(CLOUDS_SOURCE, {
        type: 'image',
        url: render.blobUrl,
        coordinates: render.coords,
      });
      map.addLayer({
        id: CLOUDS_LAYER,
        type: 'raster',
        source: CLOUDS_SOURCE,
        paint: {
          // Color ramp is constant white; cloud density modulates alpha
          // through the field's edgeFalloff. Cap at 0.55 so basemap
          // labels stay legible.
          'raster-opacity': 0.55,
          'raster-resampling': 'linear',
        },
      });
    } catch {
      /* network failure — silently skip */
    } finally {
      if (cloudsAbort === ac) cloudsAbort = null;
    }
  }


  // Tropical storms overlay — extracted to src/lib/map/overlays/tropical-storms.ts.
  // The factory takes the NHC source and an onEmpty callback so it
  // can auto-disable the checkbox when there are no active systems.
  const tropicalStormsOverlay = createTropicalStormsOverlay(
    map,
    nhcSource,
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
      removeIsobars();
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
      removeIsobars();
      return;
    }
    const mean = finite.reduce((a, b) => a + b, 0) / finite.length;
    const safe = values.map((v) => (Number.isFinite(v) ? v : mean));

    const fc = computeIsobars({
      values: safe,
      cols: FIELD_GRID_COLS,
      rows: FIELD_GRID_ROWS,
      south: fieldBounds.south,
      west: fieldBounds.west,
      north: fieldBounds.north,
      east: fieldBounds.east,
    });

    const existing = map.getSource(ISOBAR_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (existing) {
      existing.setData(fc);
      return;
    }
    map.addSource(ISOBAR_SOURCE, { type: 'geojson', data: fc });
    map.addLayer({
      id: ISOBAR_LAYER,
      type: 'line',
      source: ISOBAR_SOURCE,
      paint: {
        'line-color': '#ffffff',
        'line-width': 1.0,
        'line-opacity': 0.55,
      },
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
    // Cold-load resilience: the first Open-Meteo fetch occasionally
    // fails (network race on page init, transient DNS, etc.). Retry
    // once after 500 ms before falling back to base layer — empirically
    // resolves the URL-hash cold-load failure where ?layer=temperature
    // sometimes activated as base.
    async function attempt(): Promise<unknown> {
      const res = await deps.fetch(
        buildFieldUrl(grid, cfg.hourlyVar, activeModel),
        { signal: ac.signal },
      );
      if (!res.ok) throw new Error('non-2xx');
      return res.json();
    }
    try {
      let json: unknown;
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

  // ----------------------------------------------------------------
  // Radar / satellite "no-coverage dim" overlay. RainViewer tiles are
  // fully transparent where the radar/satellite mosaic has no data
  // (large stretches of ocean, parts of central Mexico, polar regions).
  // zoom.earth's trick is to paint a uniform dark fill UNDER the tiles
  // so the user reads the coverage shape — present-radar areas stay
  // bright (radar pixels are opaque), absent-radar areas show through
  // as deliberately darker than the basemap.
  // ----------------------------------------------------------------
  const RV_DIM_SOURCE = 'wx-rv-dim-src';
  const RV_DIM_LAYER = 'wx-rv-dim-layer';
  /** Full-world rectangle (clipped to Web Mercator's ±85° lat clamp). */
  const WORLD_RECT_FC: FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-180, -85],
              [180, -85],
              [180, 85],
              [-180, 85],
              [-180, -85],
            ],
          ],
        },
      },
    ],
  };

  function addRadarDim(): void {
    if (map.getLayer(RV_DIM_LAYER)) return;
    if (!map.getSource(RV_DIM_SOURCE)) {
      map.addSource(RV_DIM_SOURCE, { type: 'geojson', data: WORLD_RECT_FC });
    }
    // Insert BEFORE any existing radar/sat raster layer so the dim
    // paints underneath — opaque radar pixels will then cover the dim,
    // transparent tiles let it show through.
    const beneath = map.getLayer(RV_LAYER) ? RV_LAYER : undefined;
    map.addLayer(
      {
        id: RV_DIM_LAYER,
        type: 'fill',
        source: RV_DIM_SOURCE,
        paint: {
          'fill-color': '#0a0e1a',
          'fill-opacity': 0.45,
        },
      },
      beneath,
    );
  }

  function removeRadarDim(): void {
    if (map.getLayer(RV_DIM_LAYER)) map.removeLayer(RV_DIM_LAYER);
    if (map.getSource(RV_DIM_SOURCE)) map.removeSource(RV_DIM_SOURCE);
  }

  function removeWeatherRaster(): void {
    if (map.getLayer(RV_LAYER)) map.removeLayer(RV_LAYER);
    if (map.getSource(RV_SOURCE)) map.removeSource(RV_SOURCE);
    removeRadarDim();
  }

  function showWeatherFrame(layerId: string, frame: RadarFrame): void {
    removeWeatherRaster();
    addRadarDim();
    if (layerId === 'satellite') {
      // Satellite sub-options (zoom.earth parity + extension):
      //   geocolor  → GOES-East GeoColor (true color day + night lights)
      //   ir        → GOES-East ABI Band 13 Clean IR (thermal, always-on)
      //   truecolor → MODIS Terra CorrectedReflectance (true color, ~1×/day)
      const gibsLayer =
        satelliteSubOption === 'ir'
          ? GIBS_LAYERS.goesIR
          : satelliteSubOption === 'truecolor'
            ? GIBS_LAYERS.modisTrueColor
            : GIBS_LAYERS.goesGeocolor;
      const tileUrl = gibsTileUrl(gibsLayer, gibsRoundedTime());
      map.addSource(RV_SOURCE, {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        maxzoom: gibsLayer.maxZoom,
        attribution: ATTRIBUTION_GIBS,
      });
      // GIBS GOES products max at z6 (truecolor at z9); at city zoom
      // the overzoom is 4-16× which makes the satellite raster
      // essentially indistinguishable from the basemap. Surface that
      // limit so the user understands why they're not seeing detail.
      const currentZ = map.getZoom();
      if (currentZ > gibsLayer.maxZoom + 1) {
        showMsg(
          `Satélite limitado a zoom z${gibsLayer.maxZoom} (NASA GIBS). Acercando más solo aparece la mancha del basemap.`,
        );
        window.setTimeout(hideMsg, 5000);
      }
    } else {
      // Radar from RainViewer.
      //
      // The 256-pixel tile pyramid only reaches z≈8 — at z9+ the
      // server returns a "Zoom Level Not Supported" placeholder PNG
      // that ends up rendered all over the map (user-reported bug,
      // visible at city zoom across MX). The 512-pixel pyramid covers
      // up through z10, so we ask for size=512 and tell MapLibre the
      // tileSize is 512 — equivalent visual density to a native 256
      // tile at z+1 but with the higher z available.
      //
      // maxzoom: 10 retained — at zoom 11+ MapLibre auto-overzooms
      // from the z10 tile, slightly blurry but a valid raster.
      if (!rvData) return;
      const tileUrl = rainviewerTileUrl(rvData.host, frame, { size: 512 });
      map.addSource(RV_SOURCE, {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 512,
        maxzoom: 10,
        attribution: '© RainViewer',
      });
    }
    map.addLayer({
      id: RV_LAYER,
      type: 'raster',
      source: RV_SOURCE,
      paint: {
        'raster-opacity': rvOpacity,
        'raster-resampling': 'linear',
      },
    });
  }

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
        async function attempt(): Promise<Response> {
          const r = await deps.fetch(
            buildWindUrl(grid, speedVar, activeModel),
            { signal: ac.signal },
          );
          if (!r.ok) throw new Error('non-2xx');
          return r;
        }
        let res: Response;
        try {
          res = await attempt();
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
          res = await attempt();
        }
        if (ac.signal.aborted) {
          removeWind();
          removeSun();
          activeLayer = 'base';
          refreshLayerButtons();
          syncHash();
          return;
        }
        windGrid = parseWindResponse(await res.json(), grid, speedVar);
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
  // Sub-options (zoom.earth's per-layer variants). Only Temperature
  // gets sub-options today: Actual ↔ Aparente. Rendered inline in the
  // layer rail, below the active layer's button when that layer has
  // sub-options. Hidden otherwise.
  // ----------------------------------------------------------------
  function buildTempSubOptions(): void {
    const wrap = opts.els.layerBtns;
    if (!wrap || !features.layerRail) return;
    const container = document.createElement('div');
    container.id = 'temp-sub-options';
    container.className =
      'mt-1 ml-4 hidden max-sm:!hidden flex-col gap-0.5 text-xs text-gray-600 dark:text-gray-400';
    const mkBtn = (id: TempSubOption, label: string): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.sub = id;
      btn.textContent = label;
      btn.className =
        'rounded px-2 py-0.5 text-left hover:bg-blue-500/10 aria-pressed:bg-blue-500/15 aria-pressed:font-semibold aria-pressed:text-gray-800 dark:aria-pressed:text-gray-100';
      btn.setAttribute('aria-pressed', String(tempSubOption === id));
      btn.addEventListener('click', () => {
        if (tempSubOption === id) return;
        tempSubOption = id;
        refreshTempSubOptions();
        // Refetch the field with the new variable.
        void setActiveLayer('temperature');
      });
      return btn;
    };
    container.appendChild(mkBtn('actual', 'Actual'));
    container.appendChild(mkBtn('aparente', 'Aparente'));
    container.appendChild(mkBtn('bulbo', 'Bulbo húmedo'));
    wrap.appendChild(container);
  }
  function refreshTempSubOptions(): void {
    const container = document.getElementById('temp-sub-options');
    if (!container) return;
    const show = activeLayer === 'temperature';
    container.classList.toggle('hidden', !show);
    container.classList.toggle('flex', show);
    container.querySelectorAll('button').forEach((b) => {
      b.setAttribute(
        'aria-pressed',
        String((b as HTMLButtonElement).dataset.sub === tempSubOption),
      );
    });
  }
  buildTempSubOptions();
  refreshTempSubOptions();

  function buildHumiditySubOptions(): void {
    const wrap = opts.els.layerBtns;
    if (!wrap || !features.layerRail) return;
    const container = document.createElement('div');
    container.id = 'humidity-sub-options';
    container.className =
      'mt-1 ml-4 hidden max-sm:!hidden flex-col gap-0.5 text-xs text-gray-600 dark:text-gray-400';
    const mkBtn = (
      id: HumiditySubOption,
      label: string,
    ): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.sub = id;
      btn.textContent = label;
      btn.className =
        'rounded px-2 py-0.5 text-left hover:bg-blue-500/10 aria-pressed:bg-blue-500/15 aria-pressed:font-semibold aria-pressed:text-gray-800 dark:aria-pressed:text-gray-100';
      btn.setAttribute('aria-pressed', String(humiditySubOption === id));
      btn.addEventListener('click', () => {
        if (humiditySubOption === id) return;
        humiditySubOption = id;
        refreshHumiditySubOptions();
        void setActiveLayer('humidity');
      });
      return btn;
    };
    container.appendChild(mkBtn('relativa', 'Relativa'));
    container.appendChild(mkBtn('rocio', 'Punto de rocío'));
    wrap.appendChild(container);
  }
  function refreshHumiditySubOptions(): void {
    const container = document.getElementById('humidity-sub-options');
    if (!container) return;
    const show = activeLayer === 'humidity';
    container.classList.toggle('hidden', !show);
    container.classList.toggle('flex', show);
    container.querySelectorAll('button').forEach((b) => {
      b.setAttribute(
        'aria-pressed',
        String((b as HTMLButtonElement).dataset.sub === humiditySubOption),
      );
    });
  }
  buildHumiditySubOptions();
  refreshHumiditySubOptions();

  function buildPressureSubOptions(): void {
    const wrap = opts.els.layerBtns;
    if (!wrap || !features.layerRail) return;
    const container = document.createElement('div');
    container.id = 'pressure-sub-options';
    container.className =
      'mt-1 ml-4 hidden max-sm:!hidden flex-col gap-0.5 text-xs text-gray-600 dark:text-gray-400';
    const mkBtn = (
      id: PressureSubOption,
      label: string,
    ): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.sub = id;
      btn.textContent = label;
      btn.className =
        'rounded px-2 py-0.5 text-left hover:bg-blue-500/10 aria-pressed:bg-blue-500/15 aria-pressed:font-semibold aria-pressed:text-gray-800 dark:aria-pressed:text-gray-100';
      btn.setAttribute('aria-pressed', String(pressureSubOption === id));
      btn.addEventListener('click', () => {
        if (pressureSubOption === id) return;
        pressureSubOption = id;
        refreshPressureSubOptions();
        void setActiveLayer('pressure');
      });
      return btn;
    };
    container.appendChild(mkBtn('msl', 'Nivel del mar'));
    container.appendChild(mkBtn('surface', 'Superficie'));
    wrap.appendChild(container);
  }
  function refreshPressureSubOptions(): void {
    const container = document.getElementById('pressure-sub-options');
    if (!container) return;
    const show = activeLayer === 'pressure';
    container.classList.toggle('hidden', !show);
    container.classList.toggle('flex', show);
    container.querySelectorAll('button').forEach((b) => {
      b.setAttribute(
        'aria-pressed',
        String((b as HTMLButtonElement).dataset.sub === pressureSubOption),
      );
    });
  }
  buildPressureSubOptions();
  refreshPressureSubOptions();

  function buildWindSubOptions(): void {
    const wrap = opts.els.layerBtns;
    if (!wrap || !features.layerRail) return;
    const container = document.createElement('div');
    container.id = 'wind-sub-options';
    container.className =
      'mt-1 ml-4 hidden max-sm:!hidden flex-col gap-0.5 text-xs text-gray-600 dark:text-gray-400';
    const mkBtn = (id: WindSubOption, label: string): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.sub = id;
      btn.textContent = label;
      btn.className =
        'rounded px-2 py-0.5 text-left hover:bg-blue-500/10 aria-pressed:bg-blue-500/15 aria-pressed:font-semibold aria-pressed:text-gray-800 dark:aria-pressed:text-gray-100';
      btn.setAttribute('aria-pressed', String(windSubOption === id));
      btn.addEventListener('click', () => {
        if (windSubOption === id) return;
        windSubOption = id;
        refreshWindSubOptions();
        void setActiveLayer('wind');
      });
      return btn;
    };
    container.appendChild(mkBtn('velocidad', 'Velocidad'));
    container.appendChild(mkBtn('rachas', 'Rachas'));
    wrap.appendChild(container);
  }
  function refreshWindSubOptions(): void {
    const container = document.getElementById('wind-sub-options');
    if (!container) return;
    const show = activeLayer === 'wind';
    container.classList.toggle('hidden', !show);
    container.classList.toggle('flex', show);
    container.querySelectorAll('button').forEach((b) => {
      b.setAttribute(
        'aria-pressed',
        String((b as HTMLButtonElement).dataset.sub === windSubOption),
      );
    });
  }
  buildWindSubOptions();
  refreshWindSubOptions();

  function buildSatelliteSubOptions(): void {
    const wrap = opts.els.layerBtns;
    if (!wrap || !features.layerRail) return;
    const container = document.createElement('div');
    container.id = 'satellite-sub-options';
    container.className =
      'mt-1 ml-4 hidden max-sm:!hidden flex-col gap-0.5 text-xs text-gray-600 dark:text-gray-400';
    const mkBtn = (
      id: SatelliteSubOption,
      label: string,
    ): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.sub = id;
      btn.textContent = label;
      btn.className =
        'rounded px-2 py-0.5 text-left hover:bg-blue-500/10 aria-pressed:bg-blue-500/15 aria-pressed:font-semibold aria-pressed:text-gray-800 dark:aria-pressed:text-gray-100';
      btn.setAttribute('aria-pressed', String(satelliteSubOption === id));
      btn.addEventListener('click', () => {
        if (satelliteSubOption === id) return;
        satelliteSubOption = id;
        refreshSatelliteSubOptions();
        void setActiveLayer('satellite');
      });
      return btn;
    };
    container.appendChild(mkBtn('geocolor', 'GeoColor'));
    container.appendChild(mkBtn('ir', 'Infrarrojo'));
    container.appendChild(mkBtn('truecolor', 'Color real'));
    wrap.appendChild(container);
  }
  function refreshSatelliteSubOptions(): void {
    const container = document.getElementById('satellite-sub-options');
    if (!container) return;
    const show = activeLayer === 'satellite';
    container.classList.toggle('hidden', !show);
    container.classList.toggle('flex', show);
    container.querySelectorAll('button').forEach((b) => {
      b.setAttribute(
        'aria-pressed',
        String((b as HTMLButtonElement).dataset.sub === satelliteSubOption),
      );
    });
  }
  buildSatelliteSubOptions();
  refreshSatelliteSubOptions();

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
      | 'histStorms';
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
      isEnabled: () => !!map.getLayer(CLOUDS_LAYER),
      setEnabled: (on) => {
        void setCloudsEnabled(on);
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
      isEnabled: () => cityValuesEnabled,
      setEnabled: (on) => {
        cityValuesEnabled = on;
        refreshCityValues();
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

  function buildOverlayCheckboxes(): void {
    const wrap = opts.els.overlayBtns;
    if (!wrap || !features.layerRail) return;
    for (const def of overlayDefs) {
      const id = `overlay-${def.id}`;
      const row = document.createElement('label');
      row.htmlFor = id;
      row.className =
        'flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 hover:bg-blue-500/10';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = id;
      cb.checked = def.isEnabled();
      cb.className = 'accent-blue-600';
      cb.addEventListener('change', () => def.setEnabled(cb.checked));
      const lbl = document.createElement('span');
      lbl.textContent = def.label;
      lbl.className = 'flex-1';
      const kbd = document.createElement('kbd');
      kbd.textContent = def.shortcut;
      kbd.className =
        'rounded border border-gray-500/40 px-1 text-[10px] font-mono text-gray-400';
      row.appendChild(cb);
      row.appendChild(lbl);
      row.appendChild(kbd);
      wrap.appendChild(row);
    }
  }
  buildOverlayCheckboxes();

  function refreshOverlayCheckboxes(): void {
    for (const def of overlayDefs) {
      const cb = document.getElementById(
        `overlay-${def.id}`,
      ) as HTMLInputElement | null;
      if (cb) cb.checked = def.isEnabled();
    }
  }

  // Keyboard shortcuts to activate layers (zoom.earth M/R/A/T/H/P/V/L parity).
  // Only bound when the layer rail is enabled (full /mapa page); embeds
  // don't hijack global key events. Ignores keys typed into inputs/textareas.
  if (features.layerRail) {
    window.addEventListener('keydown', (e) => {
      // Don't capture keys while the user is typing in an input/textarea or
      // when a modifier is held (so cmd+R reload still works).
      const target = e.target as HTMLElement | null;
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        (target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable))
      ) {
        return;
      }
      const key = e.key.toUpperCase();
      const match = LAYERS.find((l) => l.shortcut === key);
      if (match) {
        e.preventDefault();
        void setActiveLayer(match.id);
        return;
      }
      const overlay = overlayDefs.find((o) => o.shortcut === key);
      if (overlay) {
        e.preventDefault();
        overlay.setEnabled(!overlay.isEnabled());
        refreshOverlayCheckboxes();
      }
    });
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
    const modelWrap = document.getElementById('mw-model-toggle');
    const modelBtns = modelWrap?.querySelectorAll<HTMLButtonElement>('button.mw-model-btn');
    function refreshModelBtns(): void {
      modelBtns?.forEach((b) => {
        b.setAttribute(
          'aria-pressed',
          String((b.dataset.model || 'best_match') === activeModel),
        );
      });
    }
    refreshModelBtns();
    modelBtns?.forEach((b) => {
      b.addEventListener('click', () => {
        const next = b.dataset.model || 'best_match';
        if (next === activeModel) return;
        activeModel = next;
        refreshModelBtns();
        // Invalidate cached grids + force re-fetch with new model.
        fieldGrid = null;
        lastTempGrid = null;
        lastHumidityGrid = null;
        lastPressureGrid = null;
        windGrid = null;
        if (activeLayer !== 'base' && activeLayer !== 'satellite' && activeLayer !== 'radar' && activeLayer !== 'sunlight') {
          void setActiveLayer(activeLayer);
        }
        syncHash();
      });
    });
  }

  // Snapshot compare (plan 3.3). Captures the WebGL canvas to an
  // <img> overlay so the user can scrub the timeline or switch
  // layers and visually diff "antes" vs "ahora". Doesn't require any
  // extra network fetches — pure client-side canvas → data URL.
  // ----------------------------------------------------------------
  if (features.layerRail) {
    const snapCapBtn = document.getElementById('mw-snapshot-capture');
    const snapToggleBtn = document.getElementById('mw-snapshot-toggle');
    const snapClearBtn = document.getElementById('mw-snapshot-clear');
    const snapImg = document.getElementById(
      'mw-snapshot-img',
    ) as HTMLImageElement | null;
    let snapVisible = true;
    function refreshSnapBtns(): void {
      if (!snapImg) return;
      const has = !!snapImg.src;
      snapCapBtn?.classList.toggle('hidden', has);
      snapToggleBtn?.classList.toggle('hidden', !has);
      snapClearBtn?.classList.toggle('hidden', !has);
      snapImg.classList.toggle('hidden', !has || !snapVisible);
      if (snapToggleBtn) {
        snapToggleBtn.textContent = snapVisible
          ? '👁 Ocultar comparación'
          : '👁 Mostrar comparación';
        snapToggleBtn.setAttribute('aria-pressed', String(snapVisible));
      }
    }
    snapCapBtn?.addEventListener('click', () => {
      try {
        // MapLibre needs preserveDrawingBuffer=true to read the canvas;
        // we trigger a synchronous render first to ensure we capture
        // the most recent frame.
        map.triggerRepaint();
        const url = map.getCanvas().toDataURL('image/png');
        if (snapImg) {
          snapImg.src = url;
          snapVisible = true;
          refreshSnapBtns();
        }
      } catch {
        /* WebGL context lost / canvas tainted — degrade silently */
      }
    });
    snapToggleBtn?.addEventListener('click', () => {
      snapVisible = !snapVisible;
      refreshSnapBtns();
    });
    snapClearBtn?.addEventListener('click', () => {
      if (!snapImg) return;
      snapImg.removeAttribute('src');
      snapVisible = true;
      refreshSnapBtns();
    });
    refreshSnapBtns();
  }

  return {
    map,
    destroy(): void {
      themeObserver?.disconnect();
      sunLayer.remove(); // also stops the internal ticker
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

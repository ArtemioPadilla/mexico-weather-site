/**
 * Basemap theme + label-density controller.
 *
 * Swaps the OSM/Carto raster source's tile URLs in response to two
 * inputs:
 *   1. html.dark class — toggles dark↔light variant.
 *   2. map zoom level  — toggles labels↔nolabels variant at z<5 to
 *      reduce label saturation (plan P2.5).
 *
 * Stays out of interactive-map.ts so the theme logic is reusable on
 * any other map instance (e.g. forecast page embed) and testable in
 * isolation.
 */
import type maplibregl from 'maplibre-gl';

// Labeled light basemap — CARTO Positron. This replaced a single-host
// `tile.openstreetmap.org` source that blanked the map in light mode at
// zoom ≥5: a single host gives MapLibre's concurrent tile burst no
// parallelism (OSM also forbids heavy app use), so tiles dropped and the
// canvas went white while dark mode (CARTO's 4-subdomain CDN) was fine.
// Positron is OSM-derived, served from the same reliable a/b/c/d CDN as
// the dark `dark_all` tiles, so light now behaves identically to dark.
export const CARTO_LIGHT_TILES = [
  'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
  'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
  'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
  'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
];
export const CARTO_DARK_TILES = [
  'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
];
export const CARTO_DARK_NOLABELS = [
  'https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
  'https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
  'https://c.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
  'https://d.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
];
export const CARTO_LIGHT_NOLABELS = [
  'https://a.basemaps.cartocdn.com/voyager_nolabels/{z}/{x}/{y}.png',
  'https://b.basemaps.cartocdn.com/voyager_nolabels/{z}/{x}/{y}.png',
  'https://c.basemaps.cartocdn.com/voyager_nolabels/{z}/{x}/{y}.png',
  'https://d.basemaps.cartocdn.com/voyager_nolabels/{z}/{x}/{y}.png',
];

/** Below this zoom the basemap drops labels to reduce saturation. */
export const LABEL_ZOOM_THRESHOLD = 5;

/** Pure mapping (dark, dense?) → tile URL list. Exposed for tests. */
export function pickBasemapTiles(dark: boolean, dense: boolean): string[] {
  if (dark) return dense ? CARTO_DARK_TILES : CARTO_DARK_NOLABELS;
  return dense ? CARTO_LIGHT_TILES : CARTO_LIGHT_NOLABELS;
}

export interface BasemapThemeController {
  /** Re-evaluate (dark, zoom) and swap tiles if either changed. */
  sync: () => void;
  /** Tear down the html.dark MutationObserver started by start(). */
  dispose: () => void;
}

/**
 * Attach the theme controller to a map. Returns { sync, dispose }.
 * Caller wires `map.on('zoomend', sync)` and the initial `sync()`.
 */
export function createBasemapThemeController(
  map: maplibregl.Map,
  opts: { sourceId?: string; initialDark?: boolean } = {},
): BasemapThemeController {
  const sourceId = opts.sourceId ?? 'osm';
  let lastDark: boolean | null = opts.initialDark ?? null;
  let lastDense: boolean | null = null;
  let observer: MutationObserver | null = null;

  const sync = (): void => {
    const dark = document.documentElement.classList.contains('dark');
    const dense = map.getZoom() >= LABEL_ZOOM_THRESHOLD;
    if (dark === lastDark && dense === lastDense) return;
    const src = map.getSource(sourceId) as
      | maplibregl.RasterTileSource
      | undefined;
    if (!src || typeof src.setTiles !== 'function') return;
    try {
      src.setTiles(pickBasemapTiles(dark, dense));
      const anySrc = src as unknown as { attribution?: string };
      anySrc.attribution = dark
        ? '© OpenStreetMap contributors © CARTO'
        : '© OpenStreetMap © CARTO';
      // setTiles updates the URL template for FUTURE fetches but leaves
      // already-cached tiles painting from the old CDN. Force a refetch
      // via the source cache so all tiles re-resolve through the new
      // URL within one frame.
      const styleAny = map.style as unknown as {
        sourceCaches?: Record<
          string,
          { clearTiles?: () => void; update?: (t: unknown) => void }
        >;
        _otherSourceCaches?: Record<
          string,
          { clearTiles?: () => void; update?: (t: unknown) => void }
        >;
      };
      const sc =
        styleAny.sourceCaches?.[sourceId] ??
        styleAny._otherSourceCaches?.[sourceId];
      sc?.clearTiles?.();
      sc?.update?.((map as unknown as { transform: unknown }).transform);
      lastDark = dark;
      lastDense = dense;
    } catch {
      /* retry on next mutation */
    }
  };

  // Watch html.dark class changes (user-driven theme toggle).
  observer = new MutationObserver(() => sync());
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });

  return {
    sync,
    dispose: (): void => {
      observer?.disconnect();
      observer = null;
    },
  };
}

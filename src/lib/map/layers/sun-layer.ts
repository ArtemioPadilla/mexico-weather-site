/**
 * Sun / day-night terminator overlay layer.
 *
 * Two stacked translucent polygons paint the night side of the world
 * with a softer outer (twilight) band and a deeper inner (deep night)
 * band. Mercator-distortion attenuation at low zoom keeps the polygon
 * from looking rectangular at world view.
 *
 * Extracted from interactive-map.ts as a self-contained module: the
 * factory takes the map + an opacity getter (so it can follow the
 * opacity slider) and returns { refresh, remove, startTicker }.
 */
import type { FeatureCollection } from 'geojson';
import type maplibregl from 'maplibre-gl';
import { terminatorPolygon } from '../../mapsun';

const SOURCE_OUTER = 'wx-sun-src-outer';
const SOURCE_INNER = 'wx-sun-src';
const LAYER_OUTER = 'wx-sun-layer-outer';
const LAYER_INNER = 'wx-sun-layer';
const LAYER_MID = 'wx-sun-layer-mid'; // legacy id — kept for removal
const LAYER_SOFT = 'wx-sun-layer-soft';
const SOURCE_MID = 'wx-sun-src-mid';
const SOURCE_SOFT = 'wx-sun-src-soft';

const ALL_LAYER_IDS = [
  LAYER_INNER,
  LAYER_MID,
  LAYER_OUTER,
  LAYER_SOFT,
] as const;
const ALL_SOURCE_IDS = [
  SOURCE_INNER,
  SOURCE_MID,
  SOURCE_OUTER,
  SOURCE_SOFT,
] as const;

/** Two-tier terminator: twilight band + deep-night core. Stacking more
 *  polygons (the original 4-tier #119 stack) produced rectangular-
 *  looking masses because adjacent angular distances stacked to ~full
 *  opacity over most of the night side. Two tiers gives a clean curved
 *  terminator + a softer day-side feather. */
const OPACITY_OUTER = 0.18;
const OPACITY_INNER = 0.42;
const FEATHER_DEG = 1.5;

/** zoom-aware fill-opacity. Mercator stretches the terminator polygon
 *  into a rectangular mass at world view, so we fade to 40 % below z4
 *  and ramp back to full strength by z6. */
export function sunZoomOpacityExpr(base: number): unknown {
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    0,
    base * 0.4,
    4,
    base * 0.4,
    6,
    base,
  ];
}

export interface SunLayer {
  /** Re-build the GeoJSON for the current time. Call on activation +
   *  every minute via the internal ticker. */
  refresh: () => void;
  /** Tear down all sun sources/layers + stop the ticker. */
  remove: () => void;
  /** Start a window.setInterval that calls refresh() every `ms` ms.
   *  Returns the interval id; caller can clearInterval if needed.
   *  Stopped automatically by remove(). */
  startTicker: (ms: number) => number;
}

export function createSunLayer(
  map: maplibregl.Map,
  /** Returns the current opacity multiplier; 1.0 is the design baseline.
   *  Lets the layer follow the opacity slider in interactive-map.ts
   *  without binding to a specific variable. */
  opacityScaleFn: () => number,
): SunLayer {
  let ticker = 0;

  function buildFc(
    poly: ReturnType<typeof terminatorPolygon>,
  ): FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: poly, properties: {} }],
    };
  }

  const refresh = (): void => {
    const now = Date.now();
    const outerPoly = terminatorPolygon(now, 180, 90 - FEATHER_DEG);
    const innerPoly = terminatorPolygon(now, 180, 90 + FEATHER_DEG);
    const scale = opacityScaleFn();
    const tiers = [
      {
        srcId: SOURCE_OUTER,
        layerId: LAYER_OUTER,
        fc: buildFc(outerPoly),
        opacity: OPACITY_OUTER * scale,
      },
      {
        srcId: SOURCE_INNER,
        layerId: LAYER_INNER,
        fc: buildFc(innerPoly),
        opacity: OPACITY_INNER * scale,
      },
    ];
    for (const tier of tiers) {
      const src = map.getSource(tier.srcId) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (src) {
        src.setData(tier.fc);
        if (map.getLayer(tier.layerId)) {
          map.setPaintProperty(
            tier.layerId,
            'fill-opacity',
            sunZoomOpacityExpr(tier.opacity),
          );
        }
        continue;
      }
      map.addSource(tier.srcId, { type: 'geojson', data: tier.fc });
      map.addLayer({
        id: tier.layerId,
        type: 'fill',
        source: tier.srcId,
        paint: {
          'fill-color': '#0b1320',
          'fill-opacity': sunZoomOpacityExpr(
            tier.opacity,
          ) as unknown as number,
        },
      });
    }
  };

  const remove = (): void => {
    if (ticker) {
      window.clearInterval(ticker);
      ticker = 0;
    }
    for (const id of ALL_LAYER_IDS) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    for (const id of ALL_SOURCE_IDS) {
      if (map.getSource(id)) map.removeSource(id);
    }
  };

  const startTicker = (ms: number): number => {
    if (ticker) window.clearInterval(ticker);
    ticker = window.setInterval(refresh, ms);
    return ticker;
  };

  return { refresh, remove, startTicker };
}

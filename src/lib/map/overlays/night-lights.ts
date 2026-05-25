/**
 * Night lights overlay — NASA VIIRS Day-Night Band imagery.
 *
 * Painted as a translucent raster so the basemap labels still read.
 * GIBS tile URL stays stable for the source's refresh interval; the
 * raster keeps updating naturally as the map pans.
 */
import type maplibregl from 'maplibre-gl';
import {
  ATTRIBUTION_GIBS,
  GIBS_LAYERS,
  gibsRoundedTime,
  gibsTileUrl,
} from '../sources/nasa-gibs';

const SOURCE_ID = 'wx-night-lights-src';
const LAYER_ID = 'wx-night-lights-layer';

export interface NightLightsOverlay {
  isEnabled: () => boolean;
  setEnabled: (on: boolean) => void;
}

export function createNightLightsOverlay(
  map: maplibregl.Map,
): NightLightsOverlay {
  return {
    isEnabled: (): boolean => !!map.getLayer(LAYER_ID),
    setEnabled: (on: boolean): void => {
      if (!on) {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
        return;
      }
      if (map.getSource(SOURCE_ID)) return;
      map.addSource(SOURCE_ID, {
        type: 'raster',
        tiles: [
          gibsTileUrl(GIBS_LAYERS.viirsNightLights, gibsRoundedTime()),
        ],
        tileSize: 256,
        maxzoom: GIBS_LAYERS.viirsNightLights.maxZoom,
        attribution: ATTRIBUTION_GIBS,
      });
      map.addLayer({
        id: LAYER_ID,
        type: 'raster',
        source: SOURCE_ID,
        paint: {
          // 0.7 keeps basemap labels readable through the night raster.
          'raster-opacity': 0.7,
          'raster-resampling': 'linear',
        },
      });
    },
  };
}

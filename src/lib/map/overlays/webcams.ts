/**
 * Webcams overlay (plan 3.7).
 *
 * Curated list of public live webcams across MX destinations. Click on
 * a marker opens the external page in a new tab (noopener,noreferrer).
 * We never embed third-party iframes ourselves; URLs may rot over time.
 */
import type { FeatureCollection } from 'geojson';
import type maplibregl from 'maplibre-gl';

const SOURCE_ID = 'wx-webcams-src';
const CIRCLE_LAYER_ID = 'wx-webcams-circle';
const LABEL_LAYER_ID = 'wx-webcams-label';

export interface Webcam {
  name: string;
  lng: number;
  lat: number;
  url: string;
}

export const MX_WEBCAMS: Webcam[] = [
  {
    name: 'Cancún — Playa',
    lng: -86.85,
    lat: 21.16,
    url: 'https://www.skylinewebcams.com/en/webcam/mexico/quintana-roo/cancun.html',
  },
  {
    name: 'Playa del Carmen',
    lng: -87.07,
    lat: 20.63,
    url: 'https://www.skylinewebcams.com/en/webcam/mexico/quintana-roo/playa-del-carmen.html',
  },
  {
    name: 'Cozumel',
    lng: -86.95,
    lat: 20.42,
    url: 'https://www.skylinewebcams.com/en/webcam/mexico/quintana-roo/cozumel.html',
  },
  {
    name: 'Acapulco — Bahía',
    lng: -99.82,
    lat: 16.85,
    url: 'https://www.skylinewebcams.com/en/webcam/mexico/guerrero/acapulco.html',
  },
  {
    name: 'Puerto Vallarta',
    lng: -105.23,
    lat: 20.65,
    url: 'https://www.skylinewebcams.com/en/webcam/mexico/jalisco/puerto-vallarta.html',
  },
  {
    name: 'Cabo San Lucas — Arco',
    lng: -109.7,
    lat: 22.89,
    url: 'https://www.skylinewebcams.com/en/webcam/mexico/baja-california-sur/los-cabos.html',
  },
  {
    name: 'Tulum',
    lng: -87.46,
    lat: 20.21,
    url: 'https://www.skylinewebcams.com/en/webcam/mexico/quintana-roo/tulum.html',
  },
];

export interface WebcamsOverlay {
  isEnabled: () => boolean;
  setEnabled: (on: boolean) => void;
}

export function createWebcamsOverlay(
  map: maplibregl.Map,
  webcams: Webcam[] = MX_WEBCAMS,
): WebcamsOverlay {
  let listenersAttached = false;
  return {
    isEnabled: (): boolean => !!map.getLayer(CIRCLE_LAYER_ID),
    setEnabled: (on: boolean): void => {
      if (!on) {
        if (map.getLayer(LABEL_LAYER_ID)) map.removeLayer(LABEL_LAYER_ID);
        if (map.getLayer(CIRCLE_LAYER_ID)) map.removeLayer(CIRCLE_LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
        return;
      }
      if (map.getSource(SOURCE_ID)) return;
      const data: FeatureCollection = {
        type: 'FeatureCollection',
        features: webcams.map((w) => ({
          type: 'Feature',
          properties: { name: w.name, url: w.url, label: `📹 ${w.name}` },
          geometry: { type: 'Point', coordinates: [w.lng, w.lat] },
        })),
      };
      map.addSource(SOURCE_ID, { type: 'geojson', data });
      map.addLayer({
        id: CIRCLE_LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': 6,
          'circle-color': '#0ea5e9',
          'circle-opacity': 0.85,
          'circle-stroke-color': '#e0f2fe',
          'circle-stroke-width': 1.2,
        },
      });
      map.addLayer({
        id: LABEL_LAYER_ID,
        type: 'symbol',
        source: SOURCE_ID,
        minzoom: 5,
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-offset': [0, 1.1],
          'text-anchor': 'top',
          'text-allow-overlap': false,
          'text-optional': true,
        },
        paint: {
          'text-color': '#0369a1',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.2,
        },
      });
      // One-shot listener registration (idempotent across toggles).
      // The handlers reference the marker layer id directly; they're
      // no-ops when the layer doesn't exist.
      if (!listenersAttached) {
        listenersAttached = true;
        map.on('mouseenter', CIRCLE_LAYER_ID, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', CIRCLE_LAYER_ID, () => {
          map.getCanvas().style.cursor = '';
        });
        map.on('click', CIRCLE_LAYER_ID, (e) => {
          const f = e.features?.[0];
          const url =
            f &&
            typeof (f.properties as Record<string, unknown> | null)?.url === 'string'
              ? (f.properties as Record<string, string>).url
              : null;
          if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
          }
        });
      }
    },
  };
}

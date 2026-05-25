/**
 * Air-quality (PM2.5) by city overlay — MX-unique (plan 2.4).
 *
 * Open-Meteo air-quality API is keyless + CORS-enabled. Sampled at
 * the 12 major MX metros covering ~80% of MX urban population.
 * Renders as colored circles with the µg/m³ value as a label.
 *
 * EPA PM2.5 24h-avg breakpoints (µg/m³):
 *   0-12   good        → green
 *   12-35  moderate    → yellow
 *   35-55  USG         → orange
 *   55-150 unhealthy   → red
 *   150+   hazardous   → dark red
 */
import type { FeatureCollection } from 'geojson';
import type maplibregl from 'maplibre-gl';

const SOURCE_ID = 'wx-aqi-src';
const CIRCLE_LAYER_ID = 'wx-aqi-circle';
const LABEL_LAYER_ID = 'wx-aqi-label';

export interface AqiCity {
  name: string;
  lng: number;
  lat: number;
}

export const MX_AQI_CITIES: AqiCity[] = [
  { name: 'CDMX', lng: -99.13, lat: 19.43 },
  { name: 'Guadalajara', lng: -103.35, lat: 20.66 },
  { name: 'Monterrey', lng: -100.31, lat: 25.67 },
  { name: 'Puebla', lng: -98.2, lat: 19.04 },
  { name: 'Tijuana', lng: -117.04, lat: 32.51 },
  { name: 'León', lng: -101.67, lat: 21.13 },
  { name: 'Toluca', lng: -99.65, lat: 19.29 },
  { name: 'Mérida', lng: -89.61, lat: 20.97 },
  { name: 'Querétaro', lng: -100.39, lat: 20.59 },
  { name: 'Chihuahua', lng: -106.07, lat: 28.63 },
  { name: 'Hermosillo', lng: -110.95, lat: 29.07 },
  { name: 'Veracruz', lng: -96.13, lat: 19.18 },
];

/** Build the Open-Meteo air-quality URL for a list of cities. */
export function buildAqiUrl(cities: AqiCity[]): string {
  const lats = cities.map((c) => c.lat).join(',');
  const lngs = cities.map((c) => c.lng).join(',');
  return (
    `https://air-quality-api.open-meteo.com/v1/air-quality?` +
    `latitude=${lats}&longitude=${lngs}&current=pm2_5&timezone=UTC`
  );
}

export interface AqiOverlay {
  isEnabled: () => boolean;
  setEnabled: (on: boolean) => Promise<void>;
}

export interface AqiOverlayDeps {
  fetch: typeof fetch;
}

export function createAqiOverlay(
  map: maplibregl.Map,
  deps: AqiOverlayDeps,
  cities: AqiCity[] = MX_AQI_CITIES,
): AqiOverlay {
  const fetchData = async (): Promise<FeatureCollection> => {
    try {
      const r = await deps.fetch(buildAqiUrl(cities));
      if (!r.ok) throw new Error('aqi http');
      const json = (await r.json()) as
        | { current?: { pm2_5?: number } }
        | { current?: { pm2_5?: number } }[];
      const arr = Array.isArray(json) ? json : [json];
      const features = cities
        .map((c, i) => {
          const v = arr[i]?.current?.pm2_5;
          const pm = typeof v === 'number' && Number.isFinite(v) ? v : null;
          return {
            type: 'Feature' as const,
            properties: {
              name: c.name,
              pm,
              label: pm === null ? c.name : `${c.name}\n${Math.round(pm)} µg/m³`,
            },
            geometry: {
              type: 'Point' as const,
              coordinates: [c.lng, c.lat] as [number, number],
            },
          };
        })
        .filter((f) => f.properties.pm !== null);
      return { type: 'FeatureCollection', features };
    } catch {
      return { type: 'FeatureCollection', features: [] };
    }
  };

  return {
    isEnabled: (): boolean => !!map.getLayer(CIRCLE_LAYER_ID),
    setEnabled: async (on: boolean): Promise<void> => {
      if (!on) {
        if (map.getLayer(LABEL_LAYER_ID)) map.removeLayer(LABEL_LAYER_ID);
        if (map.getLayer(CIRCLE_LAYER_ID)) map.removeLayer(CIRCLE_LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
        return;
      }
      if (map.getSource(SOURCE_ID)) return;
      const data = await fetchData();
      if (map.getSource(SOURCE_ID)) return; // raced with another toggle
      map.addSource(SOURCE_ID, { type: 'geojson', data });
      map.addLayer({
        id: CIRCLE_LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': 9,
          'circle-color': [
            'interpolate',
            ['linear'],
            ['get', 'pm'],
            0, '#22c55e',
            12, '#facc15',
            35, '#f97316',
            55, '#dc2626',
            150, '#7c2d12',
          ],
          'circle-opacity': 0.85,
          'circle-stroke-color': '#1e293b',
          'circle-stroke-width': 1.2,
        },
      });
      map.addLayer({
        id: LABEL_LAYER_ID,
        type: 'symbol',
        source: SOURCE_ID,
        minzoom: 4,
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 10,
          'text-offset': [0, 1.4],
          'text-anchor': 'top',
          'text-allow-overlap': false,
          'text-optional': true,
        },
        paint: {
          'text-color': '#0f172a',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.3,
        },
      });
    },
  };
}

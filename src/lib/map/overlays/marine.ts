/**
 * Beaches / marine overlay — MX-unique (plan 2.4 + 3.8 beach).
 *
 * Wave height (Hs) + sea-surface temperature at 14 major MX coastal
 * destinations. Open-Meteo marine API is keyless + CORS-enabled.
 * Pacific + Caribbean + Gulf coverage.
 */
import type { FeatureCollection } from 'geojson';
import type maplibregl from 'maplibre-gl';

const SOURCE_ID = 'wx-marine-src';
const CIRCLE_LAYER_ID = 'wx-marine-circle';
const LABEL_LAYER_ID = 'wx-marine-label';

export interface Beach {
  name: string;
  lng: number;
  lat: number;
}

export const MX_BEACHES: Beach[] = [
  { name: 'Cancún', lng: -86.85, lat: 21.16 },
  { name: 'Playa del Carmen', lng: -87.07, lat: 20.63 },
  { name: 'Cozumel', lng: -86.95, lat: 20.42 },
  { name: 'Veracruz', lng: -96.13, lat: 19.18 },
  { name: 'Tampico', lng: -97.86, lat: 22.25 },
  { name: 'Acapulco', lng: -99.82, lat: 16.85 },
  { name: 'Puerto Vallarta', lng: -105.23, lat: 20.65 },
  { name: 'Mazatlán', lng: -106.42, lat: 23.22 },
  { name: 'Los Cabos', lng: -109.7, lat: 22.89 },
  { name: 'La Paz', lng: -110.31, lat: 24.14 },
  { name: 'Huatulco', lng: -96.13, lat: 15.77 },
  { name: 'Puerto Escondido', lng: -97.07, lat: 15.86 },
  { name: 'Manzanillo', lng: -104.32, lat: 19.11 },
  { name: 'Ensenada', lng: -116.6, lat: 31.86 },
];

/** Cold (≤18°) → blue, warm (>29°) → orange. Coarse 5-stop ramp. */
export function sstToColor(sst: number): string {
  if (sst <= 18) return '#5b8ff9';
  if (sst <= 22) return '#7dd1c8';
  if (sst <= 26) return '#7ad151';
  if (sst <= 29) return '#f9d423';
  return '#f08a24';
}

export function buildMarineUrl(beaches: Beach[]): string {
  const lats = beaches.map((c) => c.lat).join(',');
  const lngs = beaches.map((c) => c.lng).join(',');
  return (
    `https://marine-api.open-meteo.com/v1/marine?` +
    `latitude=${lats}&longitude=${lngs}` +
    `&current=wave_height,sea_surface_temperature&timezone=UTC`
  );
}

export interface MarineOverlay {
  isEnabled: () => boolean;
  setEnabled: (on: boolean) => Promise<void>;
}

export interface MarineOverlayDeps {
  fetch: typeof fetch;
}

export function createMarineOverlay(
  map: maplibregl.Map,
  deps: MarineOverlayDeps,
  beaches: Beach[] = MX_BEACHES,
): MarineOverlay {
  const fetchData = async (): Promise<FeatureCollection> => {
    try {
      const r = await deps.fetch(buildMarineUrl(beaches));
      if (!r.ok) throw new Error('marine http');
      const json = (await r.json()) as
        | { current?: { wave_height?: number; sea_surface_temperature?: number } }
        | { current?: { wave_height?: number; sea_surface_temperature?: number } }[];
      const arr = Array.isArray(json) ? json : [json];
      const features = beaches
        .map((c, i) => {
          const cur = arr[i]?.current;
          const hs = typeof cur?.wave_height === 'number' ? cur.wave_height : null;
          const sst =
            typeof cur?.sea_surface_temperature === 'number'
              ? cur.sea_surface_temperature
              : null;
          if (hs === null && sst === null) return null;
          const parts: string[] = [c.name];
          if (hs !== null) parts.push(`🌊 ${hs.toFixed(1)} m`);
          if (sst !== null) parts.push(`🌡 ${Math.round(sst)}°`);
          return {
            type: 'Feature' as const,
            properties: {
              name: c.name,
              hs: hs ?? 0,
              color: sst === null ? '#94a3b8' : sstToColor(sst),
              label: parts.join('\n'),
            },
            geometry: {
              type: 'Point' as const,
              coordinates: [c.lng, c.lat] as [number, number],
            },
          };
        })
        .filter((f): f is NonNullable<typeof f> => f !== null);
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
      if (map.getSource(SOURCE_ID)) return;
      map.addSource(SOURCE_ID, { type: 'geojson', data });
      map.addLayer({
        id: CIRCLE_LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'hs'],
            0, 5,
            1.5, 8,
            3, 11,
            5, 14,
          ],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.85,
          'circle-stroke-color': '#0f172a',
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
          'text-offset': [0, 1.5],
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

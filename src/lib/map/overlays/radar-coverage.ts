/**
 * Radar coverage overlay (zoom.earth "Cobertura de radar").
 *
 * Hardcoded SMN/CONAGUA station list rendered as ~230 km radius discs.
 * RainViewer's mosaic aggregates these stations but doesn't expose
 * per-station shapes; this is the closest UX parity.
 */
import type { FeatureCollection } from 'geojson';
import type maplibregl from 'maplibre-gl';

const SOURCE_ID = 'wx-radar-coverage-src';
const LAYER_ID = 'wx-radar-coverage-fill';

export interface RadarStation {
  name: string;
  lat: number;
  lng: number;
  rangeKm: number;
}

export const RADAR_STATIONS: ReadonlyArray<RadarStation> = [
  { name: 'Cancún', lat: 21.04, lng: -86.85, rangeKm: 230 },
  { name: 'Mérida', lat: 20.94, lng: -89.65, rangeKm: 230 },
  { name: 'Cerro Catedral', lat: 19.55, lng: -99.43, rangeKm: 230 },
  { name: 'Guasave', lat: 25.57, lng: -108.46, rangeKm: 230 },
  { name: 'Hermosillo', lat: 28.99, lng: -111.04, rangeKm: 230 },
  { name: 'La Paz', lat: 24.16, lng: -110.32, rangeKm: 230 },
  { name: 'Mazatlán', lat: 23.21, lng: -106.42, rangeKm: 230 },
  { name: 'Querétaro', lat: 20.61, lng: -100.39, rangeKm: 230 },
  { name: 'Sabancuy', lat: 18.96, lng: -91.18, rangeKm: 230 },
  { name: 'Tampico', lat: 22.27, lng: -97.86, rangeKm: 230 },
  { name: 'Veracruz', lat: 19.18, lng: -96.13, rangeKm: 230 },
];

/** Approximate a circle of given radius (km) around a (lat,lng) as a
 *  64-gon. Equirectangular projection — fine for the radar dome scale
 *  (radius << earth circumference). Exposed for tests. */
export function circlePolygon(
  lat: number,
  lng: number,
  rangeKm: number,
): { type: 'Polygon'; coordinates: [number, number][][] } {
  const KM_PER_DEG_LAT = 110.574;
  const km_per_deg_lng = 111.32 * Math.cos((lat * Math.PI) / 180);
  const dLat = rangeKm / KM_PER_DEG_LAT;
  const dLng = rangeKm / km_per_deg_lng;
  const ring: [number, number][] = [];
  const STEPS = 64;
  for (let i = 0; i <= STEPS; i++) {
    const t = (i / STEPS) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(t), lat + dLat * Math.sin(t)]);
  }
  return { type: 'Polygon', coordinates: [ring] };
}

export function buildRadarCoverageFeatureCollection(
  stations: ReadonlyArray<RadarStation> = RADAR_STATIONS,
): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: stations.map((s) => ({
      type: 'Feature',
      properties: { name: s.name },
      geometry: circlePolygon(s.lat, s.lng, s.rangeKm),
    })),
  };
}

export interface RadarCoverageOverlay {
  isEnabled: () => boolean;
  setEnabled: (on: boolean) => void;
}

export function createRadarCoverageOverlay(
  map: maplibregl.Map,
  stations: ReadonlyArray<RadarStation> = RADAR_STATIONS,
): RadarCoverageOverlay {
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
        type: 'geojson',
        data: buildRadarCoverageFeatureCollection(stations),
      });
      map.addLayer({
        id: LAYER_ID,
        type: 'fill',
        source: SOURCE_ID,
        paint: {
          'fill-color': '#10b981',
          'fill-opacity': 0.12,
          'fill-outline-color': '#34d399',
        },
      });
    },
  };
}

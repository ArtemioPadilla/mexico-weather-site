/**
 * Huracanes notables MX overlay (plan 3.2).
 *
 * Hand-curated best-track polylines for hurricanes that made or
 * threatened MX landfall in recent years. NHC's HURDAT2 archive is
 * the source of truth but doesn't expose CORS, so coordinates were
 * extracted manually from public advisories.
 */
import type { Feature, FeatureCollection } from 'geojson';
import type maplibregl from 'maplibre-gl';

const SOURCE_ID = 'wx-histstorms-src';
const LINE_LAYER_ID = 'wx-histstorms-line';
const LABEL_LAYER_ID = 'wx-histstorms-label';

export interface HistStorm {
  name: string;
  year: number;
  /** Saffir-Simpson category (1-5). */
  cat: number;
  coords: [number, number][];
}

export const HIST_STORMS_MX: HistStorm[] = [
  // Otis (Oct 2023): explosive intensification → Cat 5 landfall at Acapulco.
  {
    name: 'Otis',
    year: 2023,
    cat: 5,
    coords: [
      [-100.0, 14.1],
      [-100.0, 14.7],
      [-99.9, 15.4],
      [-99.9, 16.2],
      [-99.9, 16.85],
      [-99.5, 17.5],
      [-99.0, 18.2],
    ],
  },
  // Patricia (Oct 2015): strongest recorded EPAC hurricane, Cat 5 landfall.
  {
    name: 'Patricia',
    year: 2015,
    cat: 5,
    coords: [
      [-95.7, 12.6],
      [-97.5, 14.1],
      [-99.5, 16.3],
      [-101.5, 17.6],
      [-103.6, 18.5],
      [-104.7, 19.4],
      [-104.9, 20.2],
    ],
  },
  // Hilary (Aug 2023): Cat 4 → weakened, hit Baja California then SoCal.
  {
    name: 'Hilary',
    year: 2023,
    cat: 4,
    coords: [
      [-104.1, 14.0],
      [-106.0, 16.8],
      [-108.0, 19.6],
      [-110.0, 22.4],
      [-112.5, 25.0],
      [-114.5, 28.0],
      [-116.5, 31.5],
    ],
  },
];

/** Map Saffir-Simpson category to a colour (green→deep-red gradient). */
export function categoryColor(c: number): string {
  if (c >= 5) return '#7f1d1d';
  if (c >= 4) return '#dc2626';
  if (c >= 3) return '#f97316';
  if (c >= 2) return '#facc15';
  return '#22c55e';
}

export interface HistStormsOverlay {
  isEnabled: () => boolean;
  setEnabled: (on: boolean) => void;
}

/** GeoJSON variant shipped by the static archive (cached by
 *  `.github/workflows/hurricanes-mx.yml`). Each feature is a
 *  LineString carrying name/year/maxCat properties. */
interface ArchiveFeature {
  type: 'Feature';
  properties: {
    name: string;
    year: number;
    maxCat?: number;
    cat?: number;
    label?: string;
  };
  geometry: { type: 'LineString'; coordinates: [number, number][] };
}

interface ArchiveFeatureCollection {
  type: 'FeatureCollection';
  features: ArchiveFeature[];
  metadata?: { source?: string; count?: number };
}

export interface HistStormsOverlayDeps {
  /** Optional fetcher + base path so the overlay can pull the
   *  static archive at /data/hurricanes-mx.json. When omitted, the
   *  factory falls back to the inline HIST_STORMS_MX list (3 storms). */
  fetch?: typeof fetch;
  base?: string;
}

export function createHistStormsOverlay(
  map: maplibregl.Map,
  depsOrStorms: HistStormsOverlayDeps | HistStorm[] = {},
): HistStormsOverlay {
  // Legacy signature: caller passed a HistStorm[] array directly.
  const deps: HistStormsOverlayDeps = Array.isArray(depsOrStorms)
    ? {}
    : depsOrStorms;
  const inlineStorms: HistStorm[] = Array.isArray(depsOrStorms)
    ? depsOrStorms
    : HIST_STORMS_MX;

  let archivePromise: Promise<ArchiveFeatureCollection | null> | null = null;
  function loadArchive(): Promise<ArchiveFeatureCollection | null> {
    if (archivePromise) return archivePromise;
    if (!deps.fetch || !deps.base) return Promise.resolve(null);
    archivePromise = deps
      .fetch(`${deps.base}data/hurricanes-mx.json`)
      .then((r) =>
        r.ok ? (r.json() as Promise<ArchiveFeatureCollection>) : null,
      )
      .catch(() => null);
    return archivePromise;
  }

  function inlineFeatureCollection(): FeatureCollection {
    const features: Feature[] = [];
    for (const s of inlineStorms) {
      features.push({
        type: 'Feature',
        properties: {
          name: s.name,
          year: s.year,
          cat: s.cat,
          color: categoryColor(s.cat),
          label: `${s.name} ${s.year} · Cat ${s.cat}`,
        },
        geometry: { type: 'LineString', coordinates: s.coords },
      });
      features.push({
        type: 'Feature',
        properties: {
          label: `${s.name} ${s.year}`,
          color: categoryColor(s.cat),
        },
        geometry: {
          type: 'Point',
          coordinates: s.coords[s.coords.length - 1],
        },
      });
    }
    return { type: 'FeatureCollection', features };
  }

  function archiveFeatureCollection(
    archive: ArchiveFeatureCollection,
  ): FeatureCollection {
    const features: Feature[] = [];
    for (const a of archive.features) {
      const cat = a.properties.maxCat ?? a.properties.cat ?? 0;
      const label =
        a.properties.label ?? `${a.properties.name} ${a.properties.year}`;
      const color = categoryColor(cat);
      features.push({
        type: 'Feature',
        properties: {
          name: a.properties.name,
          year: a.properties.year,
          cat,
          color,
          label: `${label} · Cat ${cat}`,
        },
        geometry: a.geometry,
      });
      const last =
        a.geometry.coordinates[a.geometry.coordinates.length - 1];
      if (last) {
        features.push({
          type: 'Feature',
          properties: { label, color },
          geometry: { type: 'Point', coordinates: last },
        });
      }
    }
    return { type: 'FeatureCollection', features };
  }

  function addLayers(data: FeatureCollection): void {
    map.addSource(SOURCE_ID, { type: 'geojson', data });
    map.addLayer({
      id: LINE_LAYER_ID,
      type: 'line',
      source: SOURCE_ID,
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 3,
        'line-opacity': 0.85,
      },
    });
    map.addLayer({
      id: LABEL_LAYER_ID,
      type: 'symbol',
      source: SOURCE_ID,
      filter: ['==', ['geometry-type'], 'Point'],
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 11,
        'text-offset': [0, 1.0],
        'text-anchor': 'top',
        'text-allow-overlap': false,
        'text-optional': true,
      },
      paint: {
        'text-color': ['get', 'color'],
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.2,
      },
    });
  }

  return {
    isEnabled: (): boolean => !!map.getLayer(LINE_LAYER_ID),
    setEnabled: (on: boolean): void => {
      if (!on) {
        if (map.getLayer(LABEL_LAYER_ID)) map.removeLayer(LABEL_LAYER_ID);
        if (map.getLayer(LINE_LAYER_ID)) map.removeLayer(LINE_LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
        return;
      }
      if (map.getSource(SOURCE_ID)) return;
      // Try the static archive first; fall back to the inline list.
      void loadArchive().then((archive) => {
        if (map.getSource(SOURCE_ID)) return;
        const data = archive
          ? archiveFeatureCollection(archive)
          : inlineFeatureCollection();
        addLayers(data);
      });
      // Race: also add inline immediately so the layer appears in <1
      // frame even if the static archive is still in flight. The
      // archive resolver above guards against double-add via
      // map.getSource(SOURCE_ID) check.
      if (!deps.fetch || !deps.base) {
        addLayers(inlineFeatureCollection());
      }
    },
  };
}

/**
 * SMN per-state alert tint — Story 1.2.
 *
 * Renders a translucent fill over MX states that have active SMN
 * avisos, color-keyed by the highest severity:
 *   critical → red
 *   warn     → amber
 *   info     → blue (only when no higher severity in that state)
 *
 * Joins public/data/mx-states.geojson (32 polygons) with
 * public/data/smn-by-state.json at runtime. Both files are already
 * shipped for the SMN avisos widget; this overlay just consumes them.
 */
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import type maplibregl from 'maplibre-gl';

const SOURCE_ID = 'wx-smn-states-src';
const FILL_LAYER_ID = 'wx-smn-states-fill';

type Severity = 'critical' | 'warn' | 'info';

interface StateProps {
  slug: string;
  name?: string;
  /** Highest severity of any aviso tagged for this state, joined at
   *  runtime from smn-by-state.json. */
  severity?: Severity;
  /** Count of avisos tagged for this state (state + global combined). */
  avisoCount?: number;
}

interface SmnByStateDoc {
  byState?: Record<string, Array<{ severity?: Severity }>>;
  global?: Array<{ severity?: Severity }>;
}

export interface SmnStateTintOverlay {
  isEnabled: () => boolean;
  setEnabled: (on: boolean) => Promise<void>;
}

export interface SmnStateTintOverlayDeps {
  fetch: typeof fetch;
  base: string;
}

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 3,
  warn: 2,
  info: 1,
};

/** Pick the highest severity across a list of avisos. */
function maxSeverity(
  avisos: Array<{ severity?: Severity }> | undefined,
): Severity | null {
  if (!avisos || avisos.length === 0) return null;
  let best: Severity | null = null;
  let bestRank = 0;
  for (const a of avisos) {
    if (!a.severity) continue;
    const r = SEVERITY_RANK[a.severity];
    if (r > bestRank) {
      bestRank = r;
      best = a.severity;
    }
  }
  return best;
}

export function createSmnStateTintOverlay(
  map: maplibregl.Map,
  deps: SmnStateTintOverlayDeps,
): SmnStateTintOverlay {
  let cachedFc: FeatureCollection<
    Polygon | MultiPolygon,
    StateProps
  > | null = null;

  interface PolyProps {
    slug: string;
    name?: string;
  }

  async function buildFc(): Promise<FeatureCollection<
    Polygon | MultiPolygon,
    StateProps
  > | null> {
    if (cachedFc) return cachedFc;
    try {
      const [polyRes, smnRes] = await Promise.all([
        deps.fetch(`${deps.base}data/mx-states.geojson`),
        deps.fetch(`${deps.base}data/smn-by-state.json`),
      ]);
      if (!polyRes.ok || !smnRes.ok) return null;
      const poly = (await polyRes.json()) as FeatureCollection<
        Polygon | MultiPolygon,
        PolyProps
      >;
      const smn = (await smnRes.json()) as SmnByStateDoc;
      // Build the joined FC — keep ONLY states that have at least one
      // aviso (state-tagged or global). States with zero avisos are
      // dropped so the fill layer stays sparse.
      const hasGlobal = (smn.global ?? []).length > 0;
      const globalSev = maxSeverity(smn.global);
      const features: Array<typeof poly.features[number] & {
        properties: StateProps;
      }> = [];
      for (const f of poly.features) {
        const slug = f.properties?.slug;
        if (!slug) continue;
        const stateAvisos = smn.byState?.[slug] ?? [];
        if (stateAvisos.length === 0 && !hasGlobal) continue;
        const stateSev = maxSeverity(stateAvisos);
        // Combine state + global into the severity decision.
        let severity: Severity | null = null;
        if (stateSev && globalSev) {
          severity =
            SEVERITY_RANK[stateSev] >= SEVERITY_RANK[globalSev]
              ? stateSev
              : globalSev;
        } else {
          severity = stateSev ?? globalSev;
        }
        if (!severity) continue;
        features.push({
          ...f,
          properties: {
            slug,
            name: f.properties?.name,
            severity,
            avisoCount: stateAvisos.length + (smn.global?.length ?? 0),
          },
        });
      }
      cachedFc = { type: 'FeatureCollection', features };
      return cachedFc;
    } catch {
      return null;
    }
  }

  return {
    isEnabled: (): boolean => !!map.getLayer(FILL_LAYER_ID),
    setEnabled: async (on: boolean): Promise<void> => {
      if (!on) {
        if (map.getLayer(FILL_LAYER_ID)) map.removeLayer(FILL_LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
        return;
      }
      if (map.getSource(SOURCE_ID)) return;
      const fc = await buildFc();
      if (!fc || fc.features.length === 0) return;
      if (map.getSource(SOURCE_ID)) return; // raced with another toggle
      map.addSource(SOURCE_ID, { type: 'geojson', data: fc });
      map.addLayer({
        id: FILL_LAYER_ID,
        type: 'fill',
        source: SOURCE_ID,
        paint: {
          'fill-color': [
            'match',
            ['get', 'severity'],
            'critical',
            '#dc2626',
            'warn',
            '#f59e0b',
            'info',
            '#3b82f6',
            '#6b7280',
          ],
          'fill-opacity': 0.25,
          'fill-outline-color': [
            'match',
            ['get', 'severity'],
            'critical',
            '#991b1b',
            'warn',
            '#b45309',
            'info',
            '#1d4ed8',
            '#374151',
          ],
        },
      });
    },
  };
}

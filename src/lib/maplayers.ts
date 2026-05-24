// Pure, DOM-free weather-map layer registry + legend data.
// Single source of truth for valid layer ids (consumed by maphash.ts).

export type LayerId =
  | 'base' | 'radar' | 'satellite' | 'temperature' | 'humidity' | 'pressure' | 'wind' | 'sunlight';

export const LAYER_IDS = [
  'base', 'radar', 'satellite', 'temperature', 'humidity', 'pressure', 'wind', 'sunlight',
] as const;

export interface LayerDef {
  id: LayerId;
  /** Key into UiStrings for the rail button label. */
  labelKey: string;
  kind: 'base' | 'raster-tile' | 'field' | 'particles' | 'overlay';
  /** Initial layer opacity (0..1); 1 for the base map. */
  defaultOpacity: number;
  /** Emoji glyph shown in the layer rail next to the label — zoom.earth
   *  parity. Optional: rail renders text-only when absent. */
  icon?: string;
  /** Single uppercase letter that activates this layer via keyboard.
   *  Matches zoom.earth's shortcut convention. */
  shortcut?: string;
}

export const LAYERS: LayerDef[] = [
  { id: 'base', labelKey: 'map_layer_base', kind: 'base', defaultOpacity: 1, icon: '🗺️', shortcut: 'M' },
  { id: 'radar', labelKey: 'map_layer_radar', kind: 'raster-tile', defaultOpacity: 0.8, icon: '🌧️', shortcut: 'R' },
  { id: 'satellite', labelKey: 'map_layer_satellite', kind: 'raster-tile', defaultOpacity: 1, icon: '📡', shortcut: 'A' },
  { id: 'temperature', labelKey: 'map_layer_temperature', kind: 'field', defaultOpacity: 0.75, icon: '🌡️', shortcut: 'T' },
  { id: 'humidity', labelKey: 'map_layer_humidity', kind: 'field', defaultOpacity: 0.65, icon: '💧', shortcut: 'H' },
  { id: 'pressure', labelKey: 'map_layer_pressure', kind: 'field', defaultOpacity: 0.7, icon: '🧭', shortcut: 'P' },
  { id: 'wind', labelKey: 'map_layer_wind', kind: 'particles', defaultOpacity: 1, icon: '💨', shortcut: 'V' },
  { id: 'sunlight', labelKey: 'map_layer_sunlight', kind: 'overlay', defaultOpacity: 0.45, icon: '☀️', shortcut: 'L' },
];

export function getLayer(id: string): LayerDef | undefined {
  return LAYERS.find((l) => l.id === id);
}

export interface LegendStop {
  /** Key into UiStrings for the stop label. */
  labelKey: string;
  /** Representative hex color, illustrative of the RainViewer palette. */
  color: string;
}

export const RADAR_LEGEND: LegendStop[] = [
  { labelKey: 'legend_light', color: '#7ad151' },
  { labelKey: 'legend_moderate', color: '#f9d423' },
  { labelKey: 'legend_heavy', color: '#e8431f' },
  { labelKey: 'legend_snow', color: '#9fd9ff' },
];

export interface RadarFrame {
  time: number;
  path: string;
}

export interface RainviewerData {
  host: string;
  /** Radar/precipitation frames. */
  frames: RadarFrame[];
  /** Satellite-infrared (cloud) frames. */
  satelliteFrames: RadarFrame[];
}

function collectFrames(arr: unknown): RadarFrame[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(
      (f): f is RadarFrame =>
        !!f &&
        typeof (f as RadarFrame).time === 'number' &&
        typeof (f as RadarFrame).path === 'string',
    )
    .map((f) => ({ time: f.time, path: f.path }));
}

/** Validate + flatten a RainViewer weather-maps.json document. Null if unusable. */
export function parseRainviewerManifest(json: unknown): RainviewerData | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  const radar = o.radar as Record<string, unknown> | undefined;
  if (typeof o.host !== 'string' || !radar) return null;
  const frames = [...collectFrames(radar.past), ...collectFrames(radar.nowcast)].sort(
    (a, b) => a.time - b.time,
  );
  const satellite = o.satellite as Record<string, unknown> | undefined;
  const satelliteFrames = collectFrames(satellite?.infrared).sort((a, b) => a.time - b.time);
  if (frames.length === 0 && satelliteFrames.length === 0) return null;
  return { host: o.host, frames, satelliteFrames };
}

export interface TileOpts {
  size?: 256 | 512;
  color?: number;
  smooth?: boolean;
  snow?: boolean;
}

/** RainViewer raster tile template (keeps literal {z}/{x}/{y} for MapLibre). */
export function rainviewerTileUrl(host: string, frame: RadarFrame, opts: TileOpts = {}): string {
  const size = opts.size ?? 256;
  const color = opts.color ?? 4;
  const smooth = opts.smooth === false ? 0 : 1;
  const snow = opts.snow === false ? 0 : 1;
  return `${host}${frame.path}/${size}/{z}/{x}/{y}/${color}/${smooth}_${snow}.png`;
}

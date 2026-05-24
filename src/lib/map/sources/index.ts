/**
 * Barrel re-export for map subsystem data sources.
 *
 * Plugins should import from `../sources` rather than reaching into
 * individual files. Each source implements the canonical
 * {@link import('../core/types').DataSource} interface.
 */

export {
  openMeteoFieldSource,
  openMeteoWindSource,
  type OpenMeteoFieldParams,
  type OpenMeteoWindParams,
} from './open-meteo';

export {
  rainviewerManifestSource,
  rainviewerTileUrl,
  parseRainviewerManifest,
  type RainviewerData,
  type RadarFrame,
  type TileOpts,
} from './rainviewer';

export { nhcSource, parseNhcResponse, type NhcStorm } from './nhc';

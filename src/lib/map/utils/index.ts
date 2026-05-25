/**
 * Barrel re-export for map subsystem utilities.
 *
 * Plugins should import from `../utils` rather than reaching into
 * individual files. This keeps the public surface stable as utilities
 * are reorganized internally.
 */

export {
  FETCH_CACHE_TTL_MS,
  cachedFetch,
  __clearFetchCache,
  __cacheCounts,
} from './fetch';

export {
  formatLatDM,
  formatLngDM,
  formatLatLngDM,
  bearingToCardinal4,
  bearingToCardinal16,
  bearingToArrow,
} from './geo-format';

export {
  haversineKm,
  polylineLengthKm,
  sphericalAreaKm2,
  formatDistance,
  formatArea,
} from './measure';

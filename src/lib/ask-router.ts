/**
 * ask-router.ts — Local natural-language router for /pregunta/.
 *
 * Maps a user's free-text question to a route on the site. Pure
 * client-side, no LLM, no backend, no API keys. We extract a coarse
 * INTENT and a CITY/LOCATION, then build a URL pointing at the right
 * page on this site.
 *
 * Resolution happens in two passes:
 *  1. KNOWN_CITIES dictionary (instant, 0 network).
 *  2. Open-Meteo geocoding API (CORS-enabled, keyless) when the
 *     dictionary misses.
 */

export type Intent =
  | 'forecast'
  | 'rain'
  | 'temp'
  | 'wind'
  | 'map-radar'
  | 'map-satellite'
  | 'map-temp'
  | 'map-wind'
  | 'map'
  | 'quakes'
  | 'aqi'
  | 'beach'
  | 'unknown';

export interface City {
  name: string;
  lat: number;
  lng: number;
  admin?: string;
}

/** Stored slug-keyed; normalized for lookup. */
export const KNOWN_CITIES: Record<string, City> = {
  cdmx: { name: 'Ciudad de México', lat: 19.43, lng: -99.13, admin: 'CDMX' },
  'ciudad de mexico': {
    name: 'Ciudad de México',
    lat: 19.43,
    lng: -99.13,
    admin: 'CDMX',
  },
  mexico: { name: 'Ciudad de México', lat: 19.43, lng: -99.13 },
  guadalajara: { name: 'Guadalajara', lat: 20.66, lng: -103.35, admin: 'Jal.' },
  gdl: { name: 'Guadalajara', lat: 20.66, lng: -103.35 },
  monterrey: { name: 'Monterrey', lat: 25.67, lng: -100.31, admin: 'N.L.' },
  mty: { name: 'Monterrey', lat: 25.67, lng: -100.31 },
  puebla: { name: 'Puebla', lat: 19.04, lng: -98.2, admin: 'Pue.' },
  tijuana: { name: 'Tijuana', lat: 32.51, lng: -117.04, admin: 'B.C.' },
  leon: { name: 'León', lat: 21.13, lng: -101.67, admin: 'Gto.' },
  toluca: { name: 'Toluca', lat: 19.29, lng: -99.65 },
  merida: { name: 'Mérida', lat: 20.97, lng: -89.61, admin: 'Yuc.' },
  queretaro: { name: 'Querétaro', lat: 20.59, lng: -100.39 },
  chihuahua: { name: 'Chihuahua', lat: 28.63, lng: -106.07 },
  hermosillo: { name: 'Hermosillo', lat: 29.07, lng: -110.95 },
  veracruz: { name: 'Veracruz', lat: 19.18, lng: -96.13 },
  cancun: { name: 'Cancún', lat: 21.16, lng: -86.85 },
  acapulco: { name: 'Acapulco', lat: 16.85, lng: -99.82 },
  oaxaca: { name: 'Oaxaca', lat: 17.07, lng: -96.72 },
  morelia: { name: 'Morelia', lat: 19.7, lng: -101.18 },
  aguascalientes: { name: 'Aguascalientes', lat: 21.88, lng: -102.29 },
  saltillo: { name: 'Saltillo', lat: 25.42, lng: -101.0 },
  durango: { name: 'Durango', lat: 24.02, lng: -104.66 },
  zacatecas: { name: 'Zacatecas', lat: 22.77, lng: -102.58 },
  culiacan: { name: 'Culiacán', lat: 24.81, lng: -107.39 },
  mazatlan: { name: 'Mazatlán', lat: 23.22, lng: -106.42 },
  tampico: { name: 'Tampico', lat: 22.25, lng: -97.86 },
  villahermosa: { name: 'Villahermosa', lat: 17.99, lng: -92.95 },
  tuxtla: { name: 'Tuxtla Gutiérrez', lat: 16.75, lng: -93.12 },
};

const SPANISH_DIACRITICS_RE = /[̀-ͯ]/g;

/** Lowercase, strip diacritics, collapse spaces. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(SPANISH_DIACRITICS_RE, '')
    .replace(/[¿?¡!.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract the most likely intent from a normalized query. */
export function detectIntent(q: string): Intent {
  // Specific overlay intents take precedence over the generic "mapa"
  // intent so that "mapa de sismos" routes to the quakes overlay
  // rather than the bare map.
  if (/\b(sismo|sismos|terremoto|temblor)\b/.test(q)) return 'quakes';
  if (/\b(aire|aqi|pm2|pm10|calidad del aire|contaminacion)\b/.test(q))
    return 'aqi';
  if (/\b(playa|playas|oleaje|mar|costa|beach)\b/.test(q)) return 'beach';
  if (/\bradar\b/.test(q)) return 'map-radar';
  if (/\bsatel|satellite\b/.test(q)) return 'map-satellite';
  if (/\b(mapa|mapas)\b/.test(q)) return 'map';
  if (/\b(lluvia|llovera|llover|llovio|precipitacion|chubasco|tormenta)\b/.test(q))
    return 'rain';
  if (/\b(viento|rafaga|rafagas|huracan|tornado|ventisca)\b/.test(q))
    return 'wind';
  if (/\b(temperatura|temperaturas|calor|frio|grados|°c|caliente|fria)\b/.test(q))
    return 'temp';
  if (/\b(clima|tiempo|pronostico|forecast|nublado|sol|soleado)\b/.test(q))
    return 'forecast';
  return 'unknown';
}

/** Try to resolve the city portion of `q` against KNOWN_CITIES. */
export function lookupKnownCity(q: string): City | null {
  // Try longest-first match. Sort keys by length descending.
  const keys = Object.keys(KNOWN_CITIES).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (q.includes(k)) return KNOWN_CITIES[k];
  }
  return null;
}

/** Build the geocoding URL (used when KNOWN_CITIES misses). */
export function buildGeocodeUrl(q: string): string {
  const params = new URLSearchParams({
    name: q,
    count: '1',
    language: 'es',
    country: 'MX',
  });
  return `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`;
}

export interface RoutePlan {
  /** Path relative to siteBase, e.g. '/forecast/?lat=...&lng=...&name=...'. */
  path: string;
  /** Short human-readable description of where we're going (Spanish). */
  description: string;
  intent: Intent;
  city: City | null;
}

/** Decide the route given the parsed intent + (optional) city. */
export function planRoute(intent: Intent, city: City | null): RoutePlan {
  const buildForecast = (c: City): string => {
    const params = new URLSearchParams({
      lat: String(c.lat),
      lng: String(c.lng),
      name: c.name,
    });
    if (c.admin) params.set('admin', c.admin);
    return `forecast/?${params.toString()}`;
  };

  if (intent === 'map-radar') {
    return {
      path: 'mapa/#layer=radar',
      description: 'Abriendo el mapa con radar de lluvia.',
      intent,
      city,
    };
  }
  if (intent === 'map-satellite') {
    return {
      path: 'mapa/#layer=satellite',
      description: 'Abriendo el mapa con satélite.',
      intent,
      city,
    };
  }
  if (intent === 'map-temp') {
    return {
      path: 'mapa/#layer=temperature',
      description: 'Abriendo el mapa de temperatura.',
      intent,
      city,
    };
  }
  if (intent === 'map-wind') {
    return {
      path: 'mapa/#layer=wind',
      description: 'Abriendo el mapa de viento.',
      intent,
      city,
    };
  }
  if (intent === 'quakes' || intent === 'aqi' || intent === 'beach') {
    return {
      path: 'mapa/',
      description:
        intent === 'quakes'
          ? 'Abre el mapa y activa el overlay de Sismos (USGS).'
          : intent === 'aqi'
            ? 'Abre el mapa y activa el overlay de Calidad del aire.'
            : 'Abre el mapa y activa el overlay de Playas.',
      intent,
      city,
    };
  }
  if (city) {
    return {
      path: buildForecast(city),
      description: `Pronóstico para ${city.name}.`,
      intent,
      city,
    };
  }
  return {
    path: 'mapa/',
    description: 'No identifiqué la ciudad — te llevo al mapa para que la elijas.',
    intent,
    city,
  };
}

/** Convenience wrapper used by /pregunta/. Pure on the dictionary path; falls
 *  back to a geocoding fetch only when needed. */
export async function resolveQuestion(
  raw: string,
  fetchImpl: typeof fetch,
): Promise<RoutePlan> {
  const q = normalize(raw);
  if (!q) return planRoute('unknown', null);
  const intent = detectIntent(q);
  let city = lookupKnownCity(q);
  if (!city) {
    // Try Open-Meteo geocoder. Best-effort: ignore network errors.
    try {
      const r = await fetchImpl(buildGeocodeUrl(q));
      if (r.ok) {
        const data = (await r.json()) as {
          results?: { name: string; latitude: number; longitude: number; admin1?: string }[];
        };
        const hit = data.results?.[0];
        if (
          hit &&
          Number.isFinite(hit.latitude) &&
          Number.isFinite(hit.longitude)
        ) {
          city = {
            name: hit.name,
            lat: hit.latitude,
            lng: hit.longitude,
            admin: hit.admin1,
          };
        }
      }
    } catch {
      /* swallow — fall through to map fallback */
    }
  }
  return planRoute(intent, city);
}

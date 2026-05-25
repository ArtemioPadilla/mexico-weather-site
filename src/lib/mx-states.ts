/**
 * The 32 MX federal entities. Used to generate per-state landing
 * pages at /estado/<slug>/ with the state name + capital + a list of
 * featured cities pulled from TOP_CITIES.
 *
 * Each entry includes the capital city's slug when the capital is
 * present in TOP_CITIES — clicking through then lands on the
 * existing /clima/<slug>/ page. States whose capital isn't in
 * TOP_CITIES (none, currently — all 32 capitals are covered) fall
 * back to the generic /forecast/?lat=&lng= route using the
 * capitalLat/capitalLng coordinates.
 *
 * Slug convention: lowercase ASCII, hyphenated, no diacritics.
 */
export interface MxState {
  slug: string;
  name: string;
  capital: string;
  capitalSlug?: string;
  capitalLat: number;
  capitalLng: number;
}

export const MX_STATES: readonly MxState[] = [
  { slug: 'aguascalientes', name: 'Aguascalientes', capital: 'Aguascalientes', capitalSlug: 'aguascalientes', capitalLat: 21.88, capitalLng: -102.29 },
  { slug: 'baja-california', name: 'Baja California', capital: 'Mexicali', capitalLat: 32.62, capitalLng: -115.45 },
  { slug: 'baja-california-sur', name: 'Baja California Sur', capital: 'La Paz', capitalSlug: 'la-paz', capitalLat: 24.14, capitalLng: -110.31 },
  { slug: 'campeche', name: 'Campeche', capital: 'San Francisco de Campeche', capitalLat: 19.84, capitalLng: -90.53 },
  { slug: 'chiapas', name: 'Chiapas', capital: 'Tuxtla Gutiérrez', capitalSlug: 'tuxtla-gutierrez', capitalLat: 16.75, capitalLng: -93.12 },
  { slug: 'chihuahua', name: 'Chihuahua', capital: 'Chihuahua', capitalSlug: 'chihuahua', capitalLat: 28.63, capitalLng: -106.07 },
  { slug: 'cdmx', name: 'Ciudad de México', capital: 'Ciudad de México', capitalSlug: 'cdmx', capitalLat: 19.43, capitalLng: -99.13 },
  { slug: 'coahuila', name: 'Coahuila', capital: 'Saltillo', capitalSlug: 'saltillo', capitalLat: 25.42, capitalLng: -101.0 },
  { slug: 'colima', name: 'Colima', capital: 'Colima', capitalLat: 19.24, capitalLng: -103.73 },
  { slug: 'durango', name: 'Durango', capital: 'Durango', capitalSlug: 'durango', capitalLat: 24.02, capitalLng: -104.66 },
  { slug: 'estado-de-mexico', name: 'Estado de México', capital: 'Toluca', capitalSlug: 'toluca', capitalLat: 19.29, capitalLng: -99.65 },
  { slug: 'guanajuato', name: 'Guanajuato', capital: 'Guanajuato', capitalLat: 21.02, capitalLng: -101.26 },
  { slug: 'guerrero', name: 'Guerrero', capital: 'Chilpancingo', capitalLat: 17.55, capitalLng: -99.5 },
  { slug: 'hidalgo', name: 'Hidalgo', capital: 'Pachuca', capitalSlug: 'pachuca', capitalLat: 20.12, capitalLng: -98.74 },
  { slug: 'jalisco', name: 'Jalisco', capital: 'Guadalajara', capitalSlug: 'guadalajara', capitalLat: 20.66, capitalLng: -103.35 },
  { slug: 'michoacan', name: 'Michoacán', capital: 'Morelia', capitalSlug: 'morelia', capitalLat: 19.7, capitalLng: -101.18 },
  { slug: 'morelos', name: 'Morelos', capital: 'Cuernavaca', capitalSlug: 'cuernavaca', capitalLat: 18.92, capitalLng: -99.23 },
  { slug: 'nayarit', name: 'Nayarit', capital: 'Tepic', capitalLat: 21.51, capitalLng: -104.89 },
  { slug: 'nuevo-leon', name: 'Nuevo León', capital: 'Monterrey', capitalSlug: 'monterrey', capitalLat: 25.67, capitalLng: -100.31 },
  { slug: 'oaxaca', name: 'Oaxaca', capital: 'Oaxaca', capitalSlug: 'oaxaca', capitalLat: 17.07, capitalLng: -96.72 },
  { slug: 'puebla', name: 'Puebla', capital: 'Puebla', capitalSlug: 'puebla', capitalLat: 19.04, capitalLng: -98.2 },
  { slug: 'queretaro', name: 'Querétaro', capital: 'Querétaro', capitalSlug: 'queretaro', capitalLat: 20.59, capitalLng: -100.39 },
  { slug: 'quintana-roo', name: 'Quintana Roo', capital: 'Chetumal', capitalLat: 18.5, capitalLng: -88.3 },
  { slug: 'san-luis-potosi', name: 'San Luis Potosí', capital: 'San Luis Potosí', capitalSlug: 'san-luis-potosi', capitalLat: 22.16, capitalLng: -100.98 },
  { slug: 'sinaloa', name: 'Sinaloa', capital: 'Culiacán', capitalSlug: 'culiacan', capitalLat: 24.81, capitalLng: -107.39 },
  { slug: 'sonora', name: 'Sonora', capital: 'Hermosillo', capitalSlug: 'hermosillo', capitalLat: 29.07, capitalLng: -110.95 },
  { slug: 'tabasco', name: 'Tabasco', capital: 'Villahermosa', capitalSlug: 'villahermosa', capitalLat: 17.99, capitalLng: -92.95 },
  { slug: 'tamaulipas', name: 'Tamaulipas', capital: 'Ciudad Victoria', capitalLat: 23.74, capitalLng: -99.14 },
  { slug: 'tlaxcala', name: 'Tlaxcala', capital: 'Tlaxcala', capitalLat: 19.32, capitalLng: -98.24 },
  { slug: 'veracruz', name: 'Veracruz', capital: 'Xalapa', capitalLat: 19.54, capitalLng: -96.91 },
  { slug: 'yucatan', name: 'Yucatán', capital: 'Mérida', capitalSlug: 'merida', capitalLat: 20.97, capitalLng: -89.61 },
  { slug: 'zacatecas', name: 'Zacatecas', capital: 'Zacatecas', capitalSlug: 'zacatecas', capitalLat: 22.77, capitalLng: -102.58 },
];

export function findStateBySlug(slug: string): MxState | undefined {
  return MX_STATES.find((s) => s.slug === slug);
}

/**
 * Normalize a TOP_CITIES.admin label (which may use a common
 * abbreviation like 'CDMX' for UX) to the full state name used in
 * MX_STATES. Lets state-page rollups match by full name without
 * forcing TOP_CITIES to display the verbose form.
 */
const ADMIN_ALIASES: Record<string, string> = {
  CDMX: 'Ciudad de México',
};

export function resolveStateName(admin: string): string {
  return ADMIN_ALIASES[admin] ?? admin;
}

/**
 * The 14 MX beach destinations featured in the existing Playas
 * overlay (scripts/build-marine-snapshot.py MX_BEACHES). One entry
 * per route under /playa/<slug>/ — each landing page consumes the
 * shared public/data/marine-snapshot.json to show wave height + sea
 * surface temperature.
 *
 * Some slugs intentionally overlap with TOP_CITIES (cancun, acapulco,
 * mazatlan, veracruz, tampico, la-paz). The path prefix disambiguates
 * — /clima/cancun/ is general forecast, /playa/cancun/ is beach-
 * specific marine data. Both link out to the interactive /forecast/.
 *
 * Names match MX_BEACHES exactly so a name-based lookup against the
 * marine-snapshot GeoJSON works without a normalization map.
 */
export interface TopBeach {
  slug: string;
  name: string;
  admin: string;
  lat: number;
  lng: number;
}

export const TOP_BEACHES: readonly TopBeach[] = [
  { slug: 'cancun', name: 'Cancún', admin: 'Quintana Roo', lat: 21.16, lng: -86.85 },
  { slug: 'playa-del-carmen', name: 'Playa del Carmen', admin: 'Quintana Roo', lat: 20.63, lng: -87.07 },
  { slug: 'cozumel', name: 'Cozumel', admin: 'Quintana Roo', lat: 20.42, lng: -86.95 },
  { slug: 'veracruz', name: 'Veracruz', admin: 'Veracruz', lat: 19.18, lng: -96.13 },
  { slug: 'tampico', name: 'Tampico', admin: 'Tamaulipas', lat: 22.25, lng: -97.86 },
  { slug: 'acapulco', name: 'Acapulco', admin: 'Guerrero', lat: 16.85, lng: -99.82 },
  { slug: 'puerto-vallarta', name: 'Puerto Vallarta', admin: 'Jalisco', lat: 20.65, lng: -105.23 },
  { slug: 'mazatlan', name: 'Mazatlán', admin: 'Sinaloa', lat: 23.22, lng: -106.42 },
  { slug: 'los-cabos', name: 'Los Cabos', admin: 'Baja California Sur', lat: 22.89, lng: -109.7 },
  { slug: 'la-paz', name: 'La Paz', admin: 'Baja California Sur', lat: 24.14, lng: -110.31 },
  { slug: 'huatulco', name: 'Huatulco', admin: 'Oaxaca', lat: 15.77, lng: -96.13 },
  { slug: 'puerto-escondido', name: 'Puerto Escondido', admin: 'Oaxaca', lat: 15.86, lng: -97.07 },
  { slug: 'manzanillo', name: 'Manzanillo', admin: 'Colima', lat: 19.11, lng: -104.32 },
  { slug: 'ensenada', name: 'Ensenada', admin: 'Baja California', lat: 31.86, lng: -116.6 },
];

export function findBeachBySlug(slug: string): TopBeach | undefined {
  return TOP_BEACHES.find((b) => b.slug === slug);
}

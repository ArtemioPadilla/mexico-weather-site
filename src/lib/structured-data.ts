/**
 * schema.org JSON-LD payloads emitted into the <head> of the static
 * SEO landing pages. Google + Bing parse these to enrich result
 * cards (place name, breadcrumb trail, geo coordinates) — pure SEO
 * payload, no behavior change.
 *
 * Each builder returns a plain object that BaseLayout serializes
 * inside <script type="application/ld+json">. Keep these payloads
 * static (no live timestamps) so the build output is byte-stable.
 */

export interface CityLdInput {
  name: string;
  admin: string;
  lat: number;
  lng: number;
  canonical: string;
}

export interface BeachLdInput {
  name: string;
  admin: string;
  lat: number;
  lng: number;
  canonical: string;
}

export interface StateLdInput {
  name: string;
  capital: string;
  capitalLat: number;
  capitalLng: number;
  canonical: string;
}

export interface BreadcrumbItem {
  name: string;
  url: string;
}

/** Place + WeatherForecast wrapper for /clima/<slug>/. We don't ship
 *  the actual forecast values here (they change hourly) — the
 *  WeatherForecast just declares the page is a weather forecast
 *  resource for the named place. */
export function cityLd(input: CityLdInput): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `Clima en ${input.name}`,
    url: input.canonical,
    inLanguage: 'es-MX',
    about: {
      '@type': 'City',
      name: input.name,
      containedInPlace: {
        '@type': 'AdministrativeArea',
        name: input.admin,
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: input.lat,
        longitude: input.lng,
      },
    },
  };
}

/** Beach / TouristAttraction wrapper for /playa/<slug>/. */
export function beachLd(input: BeachLdInput): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `Clima y oleaje en ${input.name}`,
    url: input.canonical,
    inLanguage: 'es-MX',
    about: {
      '@type': 'Beach',
      name: input.name,
      containedInPlace: {
        '@type': 'AdministrativeArea',
        name: input.admin,
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: input.lat,
        longitude: input.lng,
      },
    },
  };
}

/** AdministrativeArea wrapper for /estado/<slug>/. */
export function stateLd(input: StateLdInput): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `Clima en ${input.name}`,
    url: input.canonical,
    inLanguage: 'es-MX',
    about: {
      '@type': 'AdministrativeArea',
      name: input.name,
      containsPlace: {
        '@type': 'City',
        name: input.capital,
        geo: {
          '@type': 'GeoCoordinates',
          latitude: input.capitalLat,
          longitude: input.capitalLng,
        },
      },
    },
  };
}

/** BreadcrumbList — emit alongside the page-specific entry so search
 *  results show the breadcrumb trail under the title. */
export function breadcrumbLd(items: readonly BreadcrumbItem[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

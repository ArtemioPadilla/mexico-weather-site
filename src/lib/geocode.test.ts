import { describe, it, expect, vi } from 'vitest';
import { buildGeocodeUrl, geocode } from './geocode';

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Response;
}

describe('buildGeocodeUrl', () => {
  it('builds the Open-Meteo geocoding URL with expected params', () => {
    const url = buildGeocodeUrl('Ciudad de México');
    expect(url).toContain(
      'https://geocoding-api.open-meteo.com/v1/search',
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.get('name')).toBe('Ciudad de México');
    expect(parsed.searchParams.get('count')).toBe('8');
    expect(parsed.searchParams.get('language')).toBe('es');
    expect(parsed.searchParams.get('format')).toBe('json');
  });

  it('encodes special characters and honors a custom language', () => {
    const url = buildGeocodeUrl('Querétaro & Co', 'en');
    expect(url).toContain('name=Quer%C3%A9taro+%26+Co');
    expect(url).toContain('language=en');
  });
});

describe('geocode', () => {
  it('maps API results into GeoResult[]', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        results: [
          {
            name: 'Monterrey',
            admin1: 'Nuevo León',
            country: 'México',
            latitude: 25.67,
            longitude: -100.31,
            timezone: 'America/Monterrey',
          },
        ],
      }),
    );

    const out = await geocode('Monterrey', {
      fetch: fetchMock as unknown as typeof fetch,
      sleep: async () => {},
    });

    expect(out).toEqual([
      {
        name: 'Monterrey',
        admin1: 'Nuevo León',
        country: 'México',
        lat: 25.67,
        lng: -100.31,
        tz: 'America/Monterrey',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns [] when the results array is omitted', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));

    const out = await geocode('Nowhere', {
      fetch: fetchMock as unknown as typeof fetch,
      sleep: async () => {},
    });

    expect(out).toEqual([]);
  });

  it('returns [] for a blank query without calling fetch', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ results: [] }));

    const out = await geocode('   ', {
      fetch: fetchMock as unknown as typeof fetch,
      sleep: async () => {},
    });

    expect(out).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

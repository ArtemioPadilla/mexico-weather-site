import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __clearFetchCache } from '../utils/fetch';
import {
  openMeteoFieldSource,
  openMeteoWindSource,
} from './open-meteo';
import { rainviewerManifestSource } from './rainviewer';

const BOUNDS = { south: 14, west: -118, north: 33, east: -86 };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('DataSource shape', () => {
  it('Open-Meteo field source exposes id/ttl/attribution', () => {
    expect(openMeteoFieldSource.id).toBe('open-meteo-field');
    expect(openMeteoFieldSource.ttl).toBeGreaterThan(0);
    expect(openMeteoFieldSource.attribution).toBe('Open-Meteo');
  });

  it('Open-Meteo wind source exposes id/ttl/attribution', () => {
    expect(openMeteoWindSource.id).toBe('open-meteo-wind');
    expect(openMeteoWindSource.attribution).toBe('Open-Meteo');
  });

  it('RainViewer manifest source exposes id/ttl/attribution', () => {
    expect(rainviewerManifestSource.id).toBe('rainviewer-manifest');
    expect(rainviewerManifestSource.attribution).toBe('© RainViewer');
  });
});

describe('openMeteoFieldSource.fetch', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    __clearFetchCache();
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
  });

  afterEach(() => __clearFetchCache());

  it('returns null on non-2xx', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('rate limited', { status: 429 }));
    const result = await openMeteoFieldSource.fetch({
      bounds: BOUNDS,
      hourlyVar: 'temperature_2m',
    });
    expect(result).toBeNull();
  });

  it('builds an Open-Meteo URL hitting the right host with the right variable', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse([]));
    await openMeteoFieldSource.fetch({
      bounds: BOUNDS,
      hourlyVar: 'temperature_2m',
      cols: 3,
      rows: 3,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = (fetchSpy.mock.calls[0]?.[0] ?? '') as string;
    expect(url).toContain('api.open-meteo.com');
    expect(url).toContain('temperature_2m');
  });

  it('parses a 4-point field response into a FieldGrid', async () => {
    // viewportGrid clamps cols/rows to a minimum of 2 → 2×2 = 4 points.
    const entry = (lat: number, lng: number, t: number) => ({
      latitude: lat,
      longitude: lng,
      hourly: { time: ['2026-05-24T00:00'], temperature_2m: [t] },
    });
    const payload = [
      entry(14, -118, 20),
      entry(14, -86, 25),
      entry(33, -118, 18),
      entry(33, -86, 22),
    ];
    fetchSpy.mockResolvedValueOnce(jsonResponse(payload));
    const grid = await openMeteoFieldSource.fetch({
      bounds: BOUNDS,
      hourlyVar: 'temperature_2m',
      cols: 2,
      rows: 2,
    });
    expect(grid).not.toBeNull();
    expect(grid?.points).toHaveLength(4);
    expect(grid?.points[0]?.values?.[0]).toBe(20);
    expect(grid?.points[3]?.values?.[0]).toBe(22);
  });
});

describe('rainviewerManifestSource.fetch', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    __clearFetchCache();
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
  });

  afterEach(() => __clearFetchCache());

  it('hits the public manifest URL', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        host: 'https://tilecache.rainviewer.com',
        radar: { past: [{ time: 1, path: '/v2/radar/x' }], nowcast: [] },
        satellite: { infrared: [] },
      }),
    );
    await rainviewerManifestSource.fetch();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = (fetchSpy.mock.calls[0]?.[0] ?? '') as string;
    expect(url).toBe('https://api.rainviewer.com/public/weather-maps.json');
  });

  it('returns parsed manifest data on success', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        host: 'https://tilecache.rainviewer.com',
        radar: {
          past: [{ time: 1779600000, path: '/v2/radar/a' }],
          nowcast: [{ time: 1779600600, path: '/v2/radar/b' }],
        },
        satellite: { infrared: [{ time: 1779600000, path: '/v2/satellite/c' }] },
      }),
    );
    const data = await rainviewerManifestSource.fetch();
    expect(data?.host).toBe('https://tilecache.rainviewer.com');
    expect(data?.frames.length).toBeGreaterThan(0);
  });

  it('returns null on non-2xx', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 500 }));
    expect(await rainviewerManifestSource.fetch()).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __clearFetchCache } from '../utils/fetch';
import { nhcSource, parseNhcResponse } from './nhc';

describe('parseNhcResponse', () => {
  it('returns empty array for empty payload', () => {
    expect(parseNhcResponse({ activeStorms: [] })).toEqual([]);
  });

  it('returns empty array for malformed payload', () => {
    expect(parseNhcResponse(null)).toEqual([]);
    expect(parseNhcResponse({})).toEqual([]);
    expect(parseNhcResponse({ activeStorms: 'not an array' })).toEqual([]);
  });

  it('parses a well-formed storm', () => {
    const storms = parseNhcResponse({
      activeStorms: [
        {
          id: 'al012025',
          name: 'ARTHUR',
          classification: 'TS',
          intensity: '65',
          pressure: '995',
          lat: 25.7,
          lon: -77.8,
          lastUpdate: '2025-06-12T15:00:00.000Z',
        },
      ],
    });
    expect(storms).toHaveLength(1);
    const s = storms[0]!;
    expect(s.id).toBe('al012025');
    expect(s.name).toBe('ARTHUR');
    expect(s.classification).toBe('TS');
    expect(s.intensityKt).toBe(65);
    expect(s.pressureHpa).toBe(995);
    expect(s.lat).toBe(25.7);
    expect(s.lng).toBe(-77.8);
    expect(s.advisoryTime).toBe('2025-06-12T15:00:00.000Z');
  });

  it('skips entries without lat/lng', () => {
    const storms = parseNhcResponse({
      activeStorms: [
        { id: 'x', name: 'NO_POS' },
        {
          id: 'y',
          name: 'OK',
          classification: 'HU',
          lat: 20,
          lon: -90,
        },
      ],
    });
    expect(storms).toHaveLength(1);
    expect(storms[0]?.name).toBe('OK');
  });

  it('coerces numeric strings to numbers', () => {
    const storms = parseNhcResponse({
      activeStorms: [
        {
          id: '1',
          name: 'X',
          classification: 'TS',
          intensity: '120',
          pressure: '940',
          lat: '20.5',
          lon: '-90.2',
        },
      ],
    });
    expect(storms[0]?.intensityKt).toBe(120);
    expect(storms[0]?.pressureHpa).toBe(940);
    expect(storms[0]?.lat).toBe(20.5);
    expect(storms[0]?.lng).toBe(-90.2);
  });
});

describe('nhcSource', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    __clearFetchCache();
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
  });

  afterEach(() => __clearFetchCache());

  it('exposes id/ttl/attribution', () => {
    expect(nhcSource.id).toBe('nhc-current');
    expect(nhcSource.attribution).toBe('© NOAA NHC');
    expect(nhcSource.ttl).toBeGreaterThan(0);
  });

  it('hits the canonical NHC URL', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ activeStorms: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await nhcSource.fetch();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = (fetchSpy.mock.calls[0]?.[0] ?? '') as string;
    expect(url).toBe('https://www.nhc.noaa.gov/CurrentStorms.json');
  });

  it('returns [] on non-2xx', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 500 }));
    expect(await nhcSource.fetch()).toEqual([]);
  });

  it('returns parsed storms on success', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          activeStorms: [
            {
              id: 'al012025',
              name: 'ARTHUR',
              classification: 'TS',
              intensity: 65,
              pressure: 995,
              lat: 25.7,
              lon: -77.8,
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const storms = await nhcSource.fetch();
    expect(storms).toHaveLength(1);
    expect(storms[0]?.name).toBe('ARTHUR');
  });
});

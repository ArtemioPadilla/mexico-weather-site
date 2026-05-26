import { afterEach, describe, expect, it } from 'vitest';
import { aqiLevel, findNearestAqi, resetAqiCache } from './aqi';

afterEach(() => {
  resetAqiCache();
});

const SAMPLE_DOC = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'CDMX', pm: 18.5 },
      geometry: { type: 'Point', coordinates: [-99.13, 19.43] },
    },
    {
      type: 'Feature',
      properties: { name: 'Guadalajara', pm: 8.2 },
      geometry: { type: 'Point', coordinates: [-103.35, 20.66] },
    },
    {
      type: 'Feature',
      properties: { name: 'Cancún', pm: 5.0 },
      geometry: { type: 'Point', coordinates: [-86.85, 21.16] },
    },
  ],
  metadata: { updated: '2026-05-25T12:00:00Z' },
};

function fetchOk(): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(SAMPLE_DOC), { status: 200 })) as typeof fetch;
}

describe('aqiLevel', () => {
  it('classifies clean air as good', () => {
    expect(aqiLevel(5).band).toBe('good');
    expect(aqiLevel(11.9).band).toBe('good');
  });

  it('classifies the boundary cases per EPA', () => {
    expect(aqiLevel(12).band).toBe('moderate');
    expect(aqiLevel(35).band).toBe('unhealthy-sensitive');
    expect(aqiLevel(55).band).toBe('unhealthy');
    expect(aqiLevel(150).band).toBe('very-unhealthy');
    expect(aqiLevel(250).band).toBe('hazardous');
  });

  it('returns Spanish labels + advice for every band', () => {
    for (const pm of [5, 20, 40, 80, 200, 300]) {
      const lvl = aqiLevel(pm);
      expect(lvl.label.length).toBeGreaterThan(0);
      expect(lvl.advice.length).toBeGreaterThan(0);
      expect(lvl.tw.length).toBeGreaterThan(0);
    }
  });
});

describe('findNearestAqi', () => {
  it('returns the closest station within 50 km', async () => {
    // Coords very close to CDMX
    const r = await findNearestAqi(19.43, -99.13, '/base/', fetchOk());
    expect(r?.name).toBe('CDMX');
    expect(r?.pm).toBe(18.5);
    expect(r?.distanceKm).toBeLessThan(1);
    expect(r?.level.band).toBe('moderate');
  });

  it('returns null when no station is within 50 km', async () => {
    // Tuxtla Gutiérrez area, no nearby AQI station in fixture
    const r = await findNearestAqi(16.75, -93.12, '/base/', fetchOk());
    expect(r).toBeNull();
  });

  it('returns the truly nearest, not first', async () => {
    // Coords closer to Guadalajara than CDMX
    const r = await findNearestAqi(20.5, -103.0, '/base/', fetchOk());
    expect(r?.name).toBe('Guadalajara');
  });

  it('returns null for non-finite coords', async () => {
    expect(await findNearestAqi(NaN, -99.13, '/base/', fetchOk())).toBeNull();
  });

  it('returns null on HTTP error', async () => {
    const fail = (async () => new Response('', { status: 404 })) as typeof fetch;
    expect(await findNearestAqi(19.43, -99.13, '/base/', fail)).toBeNull();
  });

  it('returns null on network error', async () => {
    const fail = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    expect(await findNearestAqi(19.43, -99.13, '/base/', fail)).toBeNull();
  });

  it('caches the doc across calls', async () => {
    let calls = 0;
    const counting: typeof fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify(SAMPLE_DOC), { status: 200 });
    }) as typeof fetch;
    await findNearestAqi(19.43, -99.13, '/base/', counting);
    await findNearestAqi(20.66, -103.35, '/base/', counting);
    await findNearestAqi(21.16, -86.85, '/base/', counting);
    expect(calls).toBe(1);
  });

  it('exposes the metadata.updated timestamp', async () => {
    const r = await findNearestAqi(19.43, -99.13, '/base/', fetchOk());
    expect(r?.updated).toBe('2026-05-25T12:00:00Z');
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import {
  findMarineByName,
  findNearestMarine,
  resetMarineCache,
  sstLabel,
  waveLabel,
} from './marine';

afterEach(() => {
  resetMarineCache();
});

const SAMPLE_DOC = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        name: 'Cancún',
        hs: 1.2,
        label: 'Cancún\n🌊 1.2 m\n🌡 28°',
      },
      geometry: { type: 'Point', coordinates: [-86.85, 21.16] },
    },
    {
      type: 'Feature',
      properties: {
        name: 'Acapulco',
        hs: 0.8,
        label: 'Acapulco\n🌊 0.8 m\n🌡 30°',
      },
      geometry: { type: 'Point', coordinates: [-99.82, 16.85] },
    },
  ],
  metadata: { updated: '2026-05-25T12:00:00Z' },
};

function fetchOk(): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(SAMPLE_DOC), { status: 200 })) as typeof fetch;
}

describe('waveLabel', () => {
  it('classifies wave heights into 5 bands', () => {
    expect(waveLabel(0.3)).toBe('Mar calmo');
    expect(waveLabel(0.7)).toBe('Olas pequeñas');
    expect(waveLabel(1.2)).toBe('Olas moderadas');
    expect(waveLabel(2.0)).toBe('Olas grandes');
    expect(waveLabel(3.5)).toBe('Olas peligrosas');
  });
});

describe('sstLabel', () => {
  it('classifies SST into 5 bands', () => {
    expect(sstLabel(15)).toBe('Frío');
    expect(sstLabel(20)).toBe('Fresco');
    expect(sstLabel(24)).toBe('Templado');
    expect(sstLabel(27)).toBe('Cálido');
    expect(sstLabel(30)).toBe('Muy cálido');
  });
});

describe('findMarineByName', () => {
  it('returns wave + SST parsed from the label', async () => {
    const r = await findMarineByName('Cancún', '/base/', fetchOk());
    expect(r?.beachName).toBe('Cancún');
    expect(r?.hs).toBe(1.2);
    expect(r?.sst).toBe(28);
  });

  it('returns null for unknown beach name', async () => {
    const r = await findMarineByName('Atlantis', '/base/', fetchOk());
    expect(r).toBeNull();
  });

  it('returns null on HTTP error', async () => {
    const fail = (async () => new Response('', { status: 404 })) as typeof fetch;
    expect(await findMarineByName('Cancún', '/base/', fail)).toBeNull();
  });
});

describe('findNearestMarine', () => {
  it('returns the nearest TOP_BEACHES match within 15 km', async () => {
    // Coords ~5 km north of Cancún
    const r = await findNearestMarine(21.21, -86.85, '/base/', fetchOk());
    expect(r?.beachName).toBe('Cancún');
    expect(r?.hs).toBe(1.2);
    expect(r?.distanceKm).toBeLessThan(15);
  });

  it('returns null when no beach within 15 km (inland)', async () => {
    // CDMX — inland
    const r = await findNearestMarine(19.43, -99.13, '/base/', fetchOk());
    expect(r).toBeNull();
  });

  it('returns null for non-finite coords', async () => {
    expect(await findNearestMarine(NaN, -99, '/base/', fetchOk())).toBeNull();
  });

  it('caches the doc across calls', async () => {
    let calls = 0;
    const counting: typeof fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify(SAMPLE_DOC), { status: 200 });
    }) as typeof fetch;
    await findMarineByName('Cancún', '/base/', counting);
    await findMarineByName('Acapulco', '/base/', counting);
    expect(calls).toBe(1);
  });
});

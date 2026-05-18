import { describe, it, expect } from 'vitest';
import { LAYERS, LAYER_IDS, getLayer, RADAR_LEGEND } from './maplayers';

describe('layer registry', () => {
  it('exposes base and radar layers with stable ids', () => {
    expect(LAYER_IDS).toEqual(['base', 'radar']);
    expect(LAYERS.map((l) => l.id)).toEqual(['base', 'radar']);
  });

  it('base is kind "base", radar is a raster-tile with <1 default opacity', () => {
    const base = getLayer('base');
    const radar = getLayer('radar');
    expect(base?.kind).toBe('base');
    expect(base?.defaultOpacity).toBe(1);
    expect(radar?.kind).toBe('raster-tile');
    expect(radar?.labelKey).toBe('map_layer_radar');
    expect(radar?.defaultOpacity).toBeGreaterThan(0);
    expect(radar?.defaultOpacity).toBeLessThanOrEqual(1);
  });

  it('getLayer returns undefined for an unknown id', () => {
    expect(getLayer('bogus')).toBeUndefined();
  });
});

describe('RADAR_LEGEND', () => {
  it('has light/moderate/heavy/snow stops with hex colors and i18n keys', () => {
    expect(RADAR_LEGEND.map((s) => s.labelKey)).toEqual([
      'legend_light',
      'legend_moderate',
      'legend_heavy',
      'legend_snow',
    ]);
    for (const stop of RADAR_LEGEND) {
      expect(stop.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

import { parseRainviewerManifest, latestFrame, rainviewerTileUrl } from './maplayers';

const sampleManifest = {
  version: '2.0',
  generated: 1779138033,
  host: 'https://tilecache.rainviewer.com',
  radar: {
    past: [
      { time: 1779130800, path: '/v2/radar/aaa' },
      { time: 1779131400, path: '/v2/radar/bbb' },
    ],
    nowcast: [{ time: 1779139000, path: '/v2/radar/ccc' }],
  },
  satellite: { infrared: [] },
};

describe('parseRainviewerManifest', () => {
  it('merges past + nowcast frames in time order', () => {
    const data = parseRainviewerManifest(sampleManifest);
    expect(data).not.toBeNull();
    expect(data!.host).toBe('https://tilecache.rainviewer.com');
    expect(data!.frames.map((f) => f.path)).toEqual([
      '/v2/radar/aaa',
      '/v2/radar/bbb',
      '/v2/radar/ccc',
    ]);
  });

  it('returns null for malformed / empty input', () => {
    expect(parseRainviewerManifest(null)).toBeNull();
    expect(parseRainviewerManifest({})).toBeNull();
    expect(parseRainviewerManifest({ host: 'x', radar: { past: [], nowcast: [] } })).toBeNull();
    expect(parseRainviewerManifest({ host: 5, radar: { past: [{ time: 1, path: 'p' }] } })).toBeNull();
  });

  it('skips entries missing time/path', () => {
    const data = parseRainviewerManifest({
      host: 'h',
      radar: { past: [{ time: 1, path: 'ok' }, { time: 2 }, { path: 'nope' }] },
    });
    expect(data!.frames).toEqual([{ time: 1, path: 'ok' }]);
  });
});

describe('latestFrame', () => {
  const frames = [
    { time: 100, path: 'a' },
    { time: 200, path: 'b' },
    { time: 300, path: 'c' },
  ];
  it('returns the newest frame at or before now', () => {
    expect(latestFrame(frames, 250)).toEqual({ time: 200, path: 'b' });
    expect(latestFrame(frames, 300)).toEqual({ time: 300, path: 'c' });
  });
  it('falls back to the first frame when all are in the future', () => {
    expect(latestFrame(frames, 50)).toEqual({ time: 100, path: 'a' });
  });
  it('returns null for an empty list', () => {
    expect(latestFrame([], 999)).toBeNull();
  });
});

describe('rainviewerTileUrl', () => {
  const frame = { time: 1, path: '/v2/radar/aaa' };
  it('builds a default tile template with literal z/x/y placeholders', () => {
    expect(rainviewerTileUrl('https://h.com', frame)).toBe(
      'https://h.com/v2/radar/aaa/256/{z}/{x}/{y}/4/1_1.png',
    );
  });
  it('honors size/color and disabling smooth/snow', () => {
    expect(
      rainviewerTileUrl('https://h.com', frame, { size: 512, color: 2, smooth: false, snow: false }),
    ).toBe('https://h.com/v2/radar/aaa/512/{z}/{x}/{y}/2/0_0.png');
  });
});

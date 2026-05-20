import { describe, it, expect } from 'vitest';
import { LAYERS, LAYER_IDS, getLayer, RADAR_LEGEND } from './maplayers';

describe('layer registry', () => {
  it('exposes base, radar, and satellite layers with stable ids', () => {
    expect(LAYER_IDS).toEqual(['base', 'radar', 'satellite', 'temperature', 'humidity', 'pressure', 'wind']);
    expect(LAYERS.map((l) => l.id)).toEqual(['base', 'radar', 'satellite', 'temperature', 'humidity', 'pressure', 'wind']);
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

  it('registers a satellite raster layer with full default opacity', () => {
    expect(LAYER_IDS).toEqual(['base', 'radar', 'satellite', 'temperature', 'humidity', 'pressure', 'wind']);
    const sat = getLayer('satellite');
    expect(sat?.kind).toBe('raster-tile');
    expect(sat?.labelKey).toBe('map_layer_satellite');
    expect(sat?.defaultOpacity).toBe(1);
  });

  it('registers a temperature field layer', () => {
    expect(LAYER_IDS).toEqual(['base', 'radar', 'satellite', 'temperature', 'humidity', 'pressure', 'wind']);
    const temp = getLayer('temperature');
    expect(temp?.kind).toBe('field');
    expect(temp?.labelKey).toBe('map_layer_temperature');
    expect(temp?.defaultOpacity).toBeGreaterThan(0);
    expect(temp?.defaultOpacity).toBeLessThanOrEqual(1);
  });

  it('registers humidity and pressure field layers', () => {
    expect(LAYER_IDS).toEqual(['base', 'radar', 'satellite', 'temperature', 'humidity', 'pressure', 'wind']);
    const hum = getLayer('humidity');
    const pre = getLayer('pressure');
    expect(hum?.kind).toBe('field');
    expect(hum?.labelKey).toBe('map_layer_humidity');
    expect(pre?.kind).toBe('field');
    expect(pre?.labelKey).toBe('map_layer_pressure');
    expect(hum?.defaultOpacity).toBeGreaterThan(0);
    expect(pre?.defaultOpacity).toBeGreaterThan(0);
  });

  it('registers a wind particles layer', () => {
    expect(LAYER_IDS).toEqual([
      'base', 'radar', 'satellite', 'temperature', 'humidity', 'pressure', 'wind',
    ]);
    const w = getLayer('wind');
    expect(w?.kind).toBe('particles');
    expect(w?.labelKey).toBe('map_layer_wind');
    expect(w?.defaultOpacity).toBeGreaterThan(0);
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

import { parseRainviewerManifest, rainviewerTileUrl } from './maplayers';

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

describe('satellite frames', () => {
  it('parseRainviewerManifest collects satellite.infrared into satelliteFrames', () => {
    const data = parseRainviewerManifest({
      host: 'https://tilecache.rainviewer.com',
      radar: { past: [{ time: 10, path: '/v2/radar/r1' }], nowcast: [] },
      satellite: {
        infrared: [
          { time: 30, path: '/v2/satellite/s2' },
          { time: 20, path: '/v2/satellite/s1' },
        ],
      },
    });
    expect(data).not.toBeNull();
    expect(data!.frames.map((f) => f.path)).toEqual(['/v2/radar/r1']);
    expect(data!.satelliteFrames.map((f) => f.path)).toEqual([
      '/v2/satellite/s1',
      '/v2/satellite/s2',
    ]);
  });

  it('returns null only when BOTH radar and satellite frames are empty', () => {
    expect(
      parseRainviewerManifest({
        host: 'h',
        radar: { past: [], nowcast: [] },
        satellite: { infrared: [] },
      }),
    ).toBeNull();
    const satOnly = parseRainviewerManifest({
      host: 'h',
      radar: { past: [], nowcast: [] },
      satellite: { infrared: [{ time: 1, path: '/v2/satellite/s' }] },
    });
    expect(satOnly).not.toBeNull();
    expect(satOnly!.frames).toEqual([]);
    expect(satOnly!.satelliteFrames).toEqual([{ time: 1, path: '/v2/satellite/s' }]);
  });

  it('defaults satelliteFrames to [] when satellite key is absent', () => {
    const data = parseRainviewerManifest({
      host: 'h',
      radar: { past: [{ time: 1, path: '/v2/radar/r' }], nowcast: [] },
    });
    expect(data!.satelliteFrames).toEqual([]);
  });
});

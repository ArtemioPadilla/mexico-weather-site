import { describe, it, expect } from 'vitest';
import {
  framesForLayer,
  defaultFrameIndex,
  clampIndex,
  frameOffsetMinutes,
  seekIndexForIso,
} from './maptimeline';
import type { RainviewerData } from './maplayers';

const rv: RainviewerData = {
  host: 'https://h',
  frames: [
    { time: 1000, path: '/r/a' },
    { time: 2000, path: '/r/b' },
    { time: 3000, path: '/r/c' },
  ],
  satelliteFrames: [{ time: 5000, path: '/s/a' }],
};

describe('framesForLayer', () => {
  it('returns radar frames for radar, satellite frames for satellite, [] otherwise', () => {
    expect(framesForLayer(rv, 'radar')).toBe(rv.frames);
    expect(framesForLayer(rv, 'satellite')).toBe(rv.satelliteFrames);
    expect(framesForLayer(rv, 'base')).toEqual([]);
    expect(framesForLayer(null, 'radar')).toEqual([]);
  });
});

describe('clampIndex', () => {
  it('clamps into range; -1 for empty', () => {
    expect(clampIndex(-3, 3)).toBe(0);
    expect(clampIndex(9, 3)).toBe(2);
    expect(clampIndex(1, 3)).toBe(1);
    expect(clampIndex(0, 0)).toBe(-1);
  });
});

describe('defaultFrameIndex', () => {
  it('is the newest frame at or before now', () => {
    expect(defaultFrameIndex(rv.frames, 2500)).toBe(1);
    expect(defaultFrameIndex(rv.frames, 3000)).toBe(2);
  });
  it('is the first frame when all are in the future', () => {
    expect(defaultFrameIndex(rv.frames, 500)).toBe(0);
  });
  it('is -1 for an empty list', () => {
    expect(defaultFrameIndex([], 999)).toBe(-1);
  });
});

describe('frameOffsetMinutes', () => {
  it('is signed rounded minutes from now (0 at now)', () => {
    expect(frameOffsetMinutes({ time: 2000, path: 'x' }, 2000)).toBe(0);
    expect(frameOffsetMinutes({ time: 1100, path: 'x' }, 2000)).toBe(-15);
    expect(frameOffsetMinutes({ time: 2600, path: 'x' }, 2000)).toBe(10);
  });
});

describe('seekIndexForIso', () => {
  it('finds the frame closest to the ISO time', () => {
    const iso = new Date(2100 * 1000).toISOString();
    expect(seekIndexForIso(rv.frames, iso, 9999)).toBe(1);
  });
  it('falls back to defaultFrameIndex for null/invalid ISO', () => {
    expect(seekIndexForIso(rv.frames, null, 2500)).toBe(1);
    expect(seekIndexForIso(rv.frames, 'not-a-date', 3000)).toBe(2);
  });
  it('is -1 for an empty list', () => {
    expect(seekIndexForIso([], '2020-01-01T00:00:00.000Z', 0)).toBe(-1);
  });
});

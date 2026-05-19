// Pure, DOM-free timeline frame-selection helpers for the /mapa scrubber.
import type { RadarFrame, RainviewerData } from './maplayers';

/** Frames backing the timeline for the active layer (empty for base/no data). */
export function framesForLayer(rv: RainviewerData | null, layerId: string): RadarFrame[] {
  if (!rv) return [];
  if (layerId === 'radar') return rv.frames;
  if (layerId === 'satellite') return rv.satelliteFrames;
  return [];
}

/** Clamp `i` into [0, len-1]; -1 when there are no frames. */
export function clampIndex(i: number, len: number): number {
  if (len <= 0) return -1;
  if (i < 0) return 0;
  if (i > len - 1) return len - 1;
  return i;
}

/** Index of the newest frame at or before `nowSeconds`; 0 if all future; -1 if empty. */
export function defaultFrameIndex(frames: RadarFrame[], nowSeconds: number): number {
  if (frames.length === 0) return -1;
  let best = -1;
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].time <= nowSeconds && (best === -1 || frames[i].time > frames[best].time)) {
      best = i;
    }
  }
  return best === -1 ? 0 : best;
}

/** Signed, rounded minutes between a frame and `nowSeconds` (0 == now). */
export function frameOffsetMinutes(frame: RadarFrame, nowSeconds: number): number {
  return Math.round((frame.time - nowSeconds) / 60);
}

/**
 * Index of the frame closest to `iso`. Falls back to `defaultFrameIndex`
 * when `iso` is null/empty/unparseable. -1 for an empty list.
 */
export function seekIndexForIso(
  frames: RadarFrame[],
  iso: string | null,
  nowSeconds: number,
): number {
  if (frames.length === 0) return -1;
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return defaultFrameIndex(frames, nowSeconds);
  const target = ms / 1000;
  let best = 0;
  let bestDelta = Math.abs(frames[0].time - target);
  for (let i = 1; i < frames.length; i++) {
    const d = Math.abs(frames[i].time - target);
    if (d < bestDelta) {
      best = i;
      bestDelta = d;
    }
  }
  return best;
}

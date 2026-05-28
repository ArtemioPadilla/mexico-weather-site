// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __clearRegistry,
  getBaseLayer,
  listBaseLayers,
} from '../../core/registry';
import type {
  EventBus,
  MapEvents,
  MapPluginContext,
  MapState,
  MapStore,
} from '../../core/types';

// Mock the imperative sun-layer factory so we can observe the
// lifecycle without booting MapLibre. The plugin should not know or
// care that this is a mock — it only calls .refresh / .startTicker /
// .remove.
const refresh = vi.fn();
const remove = vi.fn();
const startTicker = vi.fn().mockReturnValue(42);
vi.mock('../../layers/sun-layer', () => ({
  createSunLayer: vi.fn(() => ({ refresh, remove, startTicker })),
}));

function fakeStore(uiOpacity: 'translucent' | 'opaque' = 'opaque'): MapStore {
  const state: MapState = {
    baseLayerId: 'base',
    enabledOverlays: new Set(),
    view: { lng: 0, lat: 0, zoom: 1 },
    frame: null,
    theme: 'system',
    lang: 'es',
    settings: {
      tz: 'local',
      hourFormat: '24',
      timeControl: 'timeline',
      summaryGranularity: 'daily',
      uiOpacity,
      units: { temp: 'C', wind: 'km/h', pressure: 'hPa' },
    },
  };
  return {
    get: () => state,
    set: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
    setBaseLayer: vi.fn(),
    toggleOverlay: vi.fn(),
    enableOverlay: vi.fn(),
    disableOverlay: vi.fn(),
    setView: vi.fn(),
    setFrame: vi.fn(),
  };
}

function fakeEvents(): EventBus {
  return {
    on: vi.fn(() => () => undefined),
    emit: vi.fn(),
  };
}

function fakeCtx(): MapPluginContext {
  return {
    map: {} as MapPluginContext['map'],
    store: fakeStore(),
    events: fakeEvents() as EventBus & {
      on: <K extends keyof MapEvents>(
        e: K,
        f: (p: MapEvents[K]) => void,
      ) => () => void;
    },
    i18n: { es: {}, en: {} },
    source: vi.fn(),
  };
}

describe('sun BaseLayer plugin', () => {
  // The plugin self-registers on import. Capture window.clearInterval
  // so deactivate / unmount calls are observable.
  const clearIntervalSpy = vi
    .spyOn(window, 'clearInterval')
    .mockImplementation(() => undefined);

  beforeEach(() => {
    refresh.mockClear();
    remove.mockClear();
    startTicker.mockClear();
    clearIntervalSpy.mockClear();
  });

  afterEach(() => {
    __clearRegistry();
  });

  it('self-registers under the id "sun"', async () => {
    await import('./sun');
    const plugin = getBaseLayer('sun');
    expect(plugin).toBeDefined();
    expect(plugin?.kind).toBe('base');
    expect(plugin?.shortcut).toBe('O');
    expect(listBaseLayers().some((b) => b.id === 'sun')).toBe(true);
  });

  it('mount → activate refreshes and starts the ticker exactly once', async () => {
    const { sunBaseLayer } = await import('./sun');
    const ctx = fakeCtx();
    sunBaseLayer.mount(ctx);
    expect(refresh).not.toHaveBeenCalled();

    sunBaseLayer.activate(ctx, {});
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(startTicker).toHaveBeenCalledTimes(1);

    // Idempotent: a second activate must not stack tickers.
    sunBaseLayer.activate(ctx, {});
    expect(startTicker).toHaveBeenCalledTimes(1);
  });

  it('deactivate stops the ticker without removing layers', async () => {
    const { sunBaseLayer } = await import('./sun');
    const ctx = fakeCtx();
    sunBaseLayer.mount(ctx);
    sunBaseLayer.activate(ctx, {});
    sunBaseLayer.deactivate(ctx);
    expect(clearIntervalSpy).toHaveBeenCalledWith(42);
    // Layers stay around for cheap re-activation per the interface
    // contract.
    expect(remove).not.toHaveBeenCalled();
  });

  it('re-activate after deactivate starts a fresh ticker', async () => {
    const { sunBaseLayer } = await import('./sun');
    const ctx = fakeCtx();
    sunBaseLayer.mount(ctx);
    sunBaseLayer.activate(ctx, {});
    sunBaseLayer.deactivate(ctx);
    sunBaseLayer.activate(ctx, {});
    expect(startTicker).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('unmount tears down layer + ticker', async () => {
    const { sunBaseLayer } = await import('./sun');
    const ctx = fakeCtx();
    sunBaseLayer.mount(ctx);
    sunBaseLayer.activate(ctx, {});
    sunBaseLayer.unmount(ctx);
    expect(clearIntervalSpy).toHaveBeenCalledWith(42);
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

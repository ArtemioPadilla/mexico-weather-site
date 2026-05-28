/**
 * Sun / day-night terminator — first real BaseLayer plugin (issue #136, F4).
 *
 * Wraps the existing imperative `createSunLayer` factory in the
 * declarative {@link BaseLayer} interface. The legacy path in
 * `src/lib/interactive-map.ts` continues to own the live map by
 * default; this plugin exists so the registry has at least one
 * realistic plugin to validate the lifecycle contract end-to-end.
 *
 * Wiring it into the live map (so toggling the rail button drives
 * the registry rather than the legacy switch statement) is a
 * follow-up — see ARCHITECTURE.md's "Migration" section.
 *
 * What this PR proves
 *   - A BaseLayer plugin can take ownership of MapLibre layers via
 *     ctx.map without coupling to the legacy module.
 *   - mount / activate / deactivate / unmount fire in the documented
 *     order and clean up after themselves.
 *   - The registry's id-based lookup wires correctly.
 *
 * What this PR does NOT do
 *   - Replace the legacy sun-button handler. The button still calls
 *     into interactive-map.ts. A follow-up flips that wiring once
 *     the rest of the BaseLayers are in.
 */

import { createSunLayer, type SunLayer } from '../../layers/sun-layer';
import { registerBaseLayer } from '../../core/registry';
import type {
  BaseLayer,
  MapPluginContext,
} from '../../core/types';

/** Refresh interval — re-derive the terminator polygon every minute.
 *  Slower than 1 minute and the seam looks frozen; faster wastes work. */
const TICK_MS = 60_000;

/** Module-scoped factory handle. Recreated on each mount. Plain
 *  module-state is fine because the registry is a singleton and the
 *  same plugin instance is reused across the map's lifetime. */
let layer: SunLayer | null = null;
let tickerId: number | null = null;

export const sunBaseLayer: BaseLayer = {
  id: 'sun',
  kind: 'base',
  label: {
    es: 'Sol y luz solar',
    en: 'Sun & daylight',
  },
  icon: '☀️',
  shortcut: 'O',

  // No sub-options — the terminator is what it is.
  // No compatible overlays declared yet; '*' opens it up if/when needed.

  mount(ctx: MapPluginContext): void {
    if (layer) return; // idempotent: HMR or duplicate register
    // Opacity getter reads from store.settings.uiOpacity. The
    // 'translucent' / 'opaque' mapping mirrors the legacy slider's
    // baseline so visual parity is preserved when the wiring flips.
    layer = createSunLayer(ctx.map, () => {
      const ui = ctx.store.get().settings.uiOpacity;
      return ui === 'opaque' ? 1.0 : 0.6;
    });
  },

  activate(ctx: MapPluginContext): void {
    if (!layer) this.mount(ctx);
    layer!.refresh();
    if (tickerId === null) {
      tickerId = layer!.startTicker(TICK_MS);
    }
  },

  deactivate(_ctx: MapPluginContext): void {
    // Stop the ticker but keep the layers around — re-activation
    // should be cheap. The legacy code removed sources on deactivate;
    // the plugin keeps them for the cheap-re-activate contract
    // described in the BaseLayer interface jsdoc.
    if (tickerId !== null) {
      window.clearInterval(tickerId);
      tickerId = null;
    }
  },

  unmount(_ctx: MapPluginContext): void {
    if (tickerId !== null) {
      window.clearInterval(tickerId);
      tickerId = null;
    }
    if (layer) {
      layer.remove();
      layer = null;
    }
  },
};

// Side-effect: register on import. Consumers do `import './plugins/...'`
// in a barrel file at map init time; this matches the design's "one
// feature = one file, registers itself" principle.
registerBaseLayer(sunBaseLayer);

/**
 * Overlay registry chrome — builds the Superposiciones checkbox panel
 * and the global keyboard-shortcut handler.
 *
 * Pure DOM + event wiring. Caller passes the overlay definitions and
 * an optional layer-shortcut callback (so the same keyboard listener
 * can activate map layers as well as toggle overlays).
 */

export interface OverlayDef {
  /** Stable id (used for the DOM id `overlay-${id}`). */
  id: string;
  /** Visible label next to the checkbox. */
  label: string;
  /** Single uppercase letter shortcut. Lowercased input matches too. */
  shortcut: string;
  isEnabled: () => boolean;
  setEnabled: (on: boolean) => void;
}

export interface OverlayRegistry {
  /** Render the checkboxes inside the wrap element. Idempotent. */
  build: () => void;
  /** Re-sync each checkbox's `checked` property with `isEnabled()`. */
  refresh: () => void;
}

export interface LayerShortcut {
  shortcut: string;
  id: string;
}

export interface OverlayRegistryEls {
  /** The <div> that holds the overlay checkboxes. When null, build()
   *  is a no-op (e.g. embedded maps without the layer rail). */
  wrap: HTMLElement | null;
}

export interface OverlayRegistryDeps {
  /** Optional layer shortcut list. When set, the keyboard handler
   *  matches uppercase keys against this list FIRST and calls
   *  onLayerShortcut(id); falls through to overlay matches otherwise. */
  layers?: ReadonlyArray<LayerShortcut>;
  onLayerShortcut?: (id: string) => void;
}

export function createOverlayRegistry(
  els: OverlayRegistryEls,
  overlays: ReadonlyArray<OverlayDef>,
  deps: OverlayRegistryDeps = {},
): OverlayRegistry {
  function build(): void {
    if (!els.wrap) return;
    // Clear any pre-existing rows so build() is safely re-runnable.
    els.wrap.textContent = '';
    for (const def of overlays) {
      const id = `overlay-${def.id}`;
      const row = document.createElement('label');
      row.htmlFor = id;
      row.className =
        'flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 hover:bg-blue-500/10';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = id;
      cb.checked = def.isEnabled();
      cb.className = 'accent-blue-600';
      cb.addEventListener('change', () => def.setEnabled(cb.checked));
      const lbl = document.createElement('span');
      lbl.textContent = def.label;
      lbl.className = 'flex-1';
      const kbd = document.createElement('kbd');
      kbd.textContent = def.shortcut;
      kbd.className =
        'rounded border border-gray-500/40 px-1 text-[10px] font-mono text-gray-400';
      row.appendChild(cb);
      row.appendChild(lbl);
      row.appendChild(kbd);
      els.wrap.appendChild(row);
    }
  }

  function refresh(): void {
    for (const def of overlays) {
      const cb = document.getElementById(
        `overlay-${def.id}`,
      ) as HTMLInputElement | null;
      if (cb) cb.checked = def.isEnabled();
    }
  }

  // Global keydown — only attached when there's at least an overlay
  // or layer list, and when a window is available. Caller can wrap
  // this in a feature-gate (`features.layerRail`) by simply not
  // calling installShortcuts() — see the dedicated method below.
  function installShortcuts(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement | null;
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        (target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable))
      ) {
        return;
      }
      const key = e.key.toUpperCase();
      const layerMatch = deps.layers?.find((l) => l.shortcut === key);
      if (layerMatch && deps.onLayerShortcut) {
        e.preventDefault();
        deps.onLayerShortcut(layerMatch.id);
        return;
      }
      const overlay = overlays.find((o) => o.shortcut === key);
      if (overlay) {
        e.preventDefault();
        overlay.setEnabled(!overlay.isEnabled());
        refresh();
      }
    });
  }

  return {
    build,
    refresh,
    // Not in the type but exposed via cast — see usage in the
    // interactive-map.ts wiring.
    ...({ installShortcuts } as { installShortcuts: () => void }),
  } as OverlayRegistry & { installShortcuts: () => void };
}

/**
 * NWP model toggle pills (plan P1.1).
 *
 * Five pills (Auto / ICON / GFS / ECMWF / JMA) at the bottom-right of
 * the map let the user override Open-Meteo's default best_match
 * selector. Selection persists via URL hash (?model=icon_seamless),
 * driven by the supplied onChange callback.
 *
 * Factory just wires the DOM — the caller controls the source of
 * truth (`getActive()`) and what happens on change (`onChange`),
 * keeping this module decoupled from the field/wind machinery.
 */

export interface ModelToggleEls {
  /** The wrapper that contains the .mw-model-btn buttons.
   *  When null (e.g. layerRail feature off), the factory is a no-op. */
  wrap: HTMLElement | null;
}

export interface ModelToggle {
  /** Re-render aria-pressed state across all pills based on
   *  the current value. Call after the value changes by any path
   *  (e.g. URL hash listener). */
  refresh: () => void;
}

export function createModelToggle(
  els: ModelToggleEls,
  getActive: () => string,
  onChange: (next: string) => void,
): ModelToggle {
  const btns =
    els.wrap?.querySelectorAll<HTMLButtonElement>('button.mw-model-btn') ?? null;

  function refresh(): void {
    if (!btns) return;
    const cur = getActive();
    btns.forEach((b) => {
      b.setAttribute(
        'aria-pressed',
        String((b.dataset.model || 'best_match') === cur),
      );
    });
  }

  if (btns) {
    btns.forEach((b) => {
      b.addEventListener('click', () => {
        const next = b.dataset.model || 'best_match';
        if (next === getActive()) return;
        onChange(next);
        refresh();
      });
    });
  }

  refresh();
  return { refresh };
}

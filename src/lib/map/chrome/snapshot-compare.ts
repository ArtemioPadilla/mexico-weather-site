/**
 * Snapshot-compare tool (plan 3.3).
 *
 * Captures the current MapLibre WebGL canvas to a translucent <img>
 * overlay so the user can scrub the timeline / switch layers and see
 * the "before" state alongside the live map. No extra network fetches.
 *
 * Factory:
 *   createSnapshotCompare({ map, captureBtn, toggleBtn, clearBtn,
 *                          imgEl })
 *   → { refresh }
 *
 * Wires the three buttons' click handlers internally; consumer just
 * calls refresh() once to initialise visibility.
 */
import type maplibregl from 'maplibre-gl';

export interface SnapshotCompareEls {
  map: maplibregl.Map;
  captureBtn: HTMLElement | null;
  toggleBtn: HTMLElement | null;
  clearBtn: HTMLElement | null;
  imgEl: HTMLImageElement | null;
}

export interface SnapshotCompare {
  /** Re-sync button + overlay visibility with internal state. */
  refresh: () => void;
}

export function createSnapshotCompare(els: SnapshotCompareEls): SnapshotCompare {
  let visible = true;

  function refresh(): void {
    if (!els.imgEl) return;
    const has = !!els.imgEl.src;
    els.captureBtn?.classList.toggle('hidden', has);
    els.toggleBtn?.classList.toggle('hidden', !has);
    els.clearBtn?.classList.toggle('hidden', !has);
    els.imgEl.classList.toggle('hidden', !has || !visible);
    if (els.toggleBtn) {
      els.toggleBtn.textContent = visible
        ? '👁 Ocultar comparación'
        : '👁 Mostrar comparación';
      els.toggleBtn.setAttribute('aria-pressed', String(visible));
    }
  }

  els.captureBtn?.addEventListener('click', () => {
    try {
      // MapLibre needs preserveDrawingBuffer=true to read the canvas;
      // we trigger a synchronous render first so we grab the most
      // recent frame rather than an in-flight one.
      els.map.triggerRepaint();
      const url = els.map.getCanvas().toDataURL('image/png');
      if (els.imgEl) {
        els.imgEl.src = url;
        visible = true;
        refresh();
      }
    } catch {
      /* WebGL context lost / canvas tainted — degrade silently */
    }
  });
  els.toggleBtn?.addEventListener('click', () => {
    visible = !visible;
    refresh();
  });
  els.clearBtn?.addEventListener('click', () => {
    if (!els.imgEl) return;
    els.imgEl.removeAttribute('src');
    visible = true;
    refresh();
  });

  return { refresh };
}

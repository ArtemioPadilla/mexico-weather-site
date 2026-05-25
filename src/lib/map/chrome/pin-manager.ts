/**
 * Pin manager — owns the MapLibre markers + per-pin popups.
 *
 * Caller passes the pins (preset + user-added) and a popup HTML
 * builder. The manager handles:
 *   - Marker creation/teardown (preset = blue, user = red).
 *   - Popup wiring (when markerPopups is on).
 *   - a11y: role=button + aria-label on the marker root element.
 *   - setUserPin → withUserPin (idempotent merge) + flyTo to the new
 *     pin, respecting prefers-reduced-motion.
 */
import type maplibregl from 'maplibre-gl';
import { type MapPin, withUserPin } from '../../mappins';

export interface PinManager {
  /** Render the current pin list as markers. Idempotent — tears down
   *  the previous batch of markers before recreating. */
  render: () => void;
  /** Add (or move) the user pin and fly the camera there. */
  setUserPin: (pin: { name: string; lat: number; lng: number; kind: 'search' | 'geo' }) => void;
  /** Get the current pin list (read-only). */
  getPins: () => ReadonlyArray<MapPin>;
}

export interface PinManagerDeps {
  /** Library reference (passed in to keep this module dependency-light
   *  — interactive-map.ts loads maplibre-gl dynamically). */
  maplibre: typeof maplibregl;
  /** Returns the HTML body for a pin's popup. The pin manager calls
   *  this lazily on each render so the popup picks up the latest
   *  state (e.g. translations). */
  popupHtml: (p: MapPin) => string;
  /** Show a popup at all? When false the manager creates markers
   *  without popups (embedded maps). */
  enablePopups: boolean;
}

export function createPinManager(
  map: maplibregl.Map,
  initial: MapPin[],
  deps: PinManagerDeps,
): PinManager {
  let pins: MapPin[] = initial.slice();
  const markers: maplibregl.Marker[] = [];

  function clearMarkers(): void {
    while (markers.length) markers.pop()!.remove();
  }

  function render(): void {
    clearMarkers();
    for (const p of pins) {
      const marker = new deps.maplibre.Marker({
        color: p.kind === 'preset' ? '#2563eb' : '#dc2626',
      }).setLngLat([p.lng, p.lat]);
      if (deps.enablePopups) {
        const popup = new deps.maplibre.Popup({ offset: 24 }).setHTML(
          deps.popupHtml(p),
        );
        marker.setPopup(popup);
      }
      marker.addTo(map);
      // MapLibre adds aria-label="Map marker" on a role-less div which
      // axe-core flags as aria-prohibited-attr. Promote to role=button
      // + give it a meaningful name so screen readers announce
      // something useful.
      try {
        const el = marker.getElement();
        el.setAttribute('role', 'button');
        el.setAttribute(
          'aria-label',
          p.name ? `Marcador: ${p.name}` : 'Marcador en el mapa',
        );
      } catch {
        /* best-effort */
      }
      markers.push(marker);
    }
  }

  return {
    render,
    setUserPin: ({ name, lat, lng, kind }): void => {
      pins = withUserPin(pins, { name, lat, lng, kind });
      render();
      const reducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      map.flyTo({
        center: [lng, lat],
        zoom: Math.max(map.getZoom(), 9),
        animate: !reducedMotion,
      });
    },
    getPins: (): ReadonlyArray<MapPin> => pins,
  };
}

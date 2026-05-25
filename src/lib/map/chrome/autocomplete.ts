/**
 * Search autocomplete controller for /mapa.
 *
 * Manages the <ul> listbox + state (current results, keyboard active
 * index) attached to a search input. The factory takes the input + the
 * listbox + a `select` callback so the wiring layer can do its own
 * "fly to coords + drop pin" work.
 *
 * Pure DOM logic — no map dependency, no async fetching.
 */

export interface GeoItem {
  name: string;
  admin1?: string;
  country?: string;
  lat: number;
  lng: number;
  tz: string;
  population?: number;
  featureCode?: string;
}

export interface AutocompleteController {
  /** Replace the result list and render it. */
  setResults: (results: GeoItem[]) => void;
  /** Get the current result list (used by keyboard handlers). */
  getResults: () => GeoItem[];
  /** Get the index of the keyboard-active option (-1 if none). */
  getActiveIndex: () => number;
  /** Set the index of the keyboard-active option (clamped to result
   *  length). Triggers visual highlight + aria-activedescendant. */
  setActiveIndex: (i: number) => void;
  /** Hide the listbox and forget the current results. */
  close: () => void;
  /** Render the currently-set results (idempotent). */
  render: () => void;
}

export function createAutocompleteController(
  q: HTMLInputElement,
  acList: HTMLUListElement,
  select: (r: GeoItem) => void,
): AutocompleteController {
  let results: GeoItem[] = [];
  let active = -1;

  function close(): void {
    acList.classList.add('hidden');
    acList.textContent = '';
    q.setAttribute('aria-expanded', 'false');
    q.removeAttribute('aria-activedescendant');
    results = [];
    active = -1;
  }

  function highlight(): void {
    Array.from(acList.children).forEach((li, i) => {
      if (i === active) {
        li.classList.add('bg-gray-100', 'dark:bg-gray-800');
        li.setAttribute('aria-selected', 'true');
        q.setAttribute('aria-activedescendant', (li as HTMLElement).id);
      } else {
        li.classList.remove('bg-gray-100', 'dark:bg-gray-800');
        li.setAttribute('aria-selected', 'false');
      }
    });
    if (active < 0) q.removeAttribute('aria-activedescendant');
  }

  function render(): void {
    acList.textContent = '';
    results.forEach((r, i) => {
      const li = document.createElement('li');
      li.id = (acList.id || 'mapac') + '-' + i;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      li.className =
        'px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800';

      const primary = document.createElement('div');
      primary.className = 'flex items-center gap-2';

      const nameEl = document.createElement('span');
      nameEl.className = 'font-semibold text-gray-900 dark:text-gray-100';
      nameEl.textContent = r.name;
      primary.appendChild(nameEl);

      if (typeof r.population === 'number' && r.population >= 50000) {
        const badge = document.createElement('span');
        badge.className =
          'rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400';
        badge.textContent = 'ciudad';
        primary.appendChild(badge);
      }
      li.appendChild(primary);

      const sub = [r.admin1, r.country].filter(Boolean).join(' · ');
      if (sub) {
        const subEl = document.createElement('div');
        subEl.className = 'text-xs text-gray-500 dark:text-gray-400';
        subEl.textContent = sub;
        li.appendChild(subEl);
      }

      li.addEventListener('click', () => select(r));
      acList.appendChild(li);
    });
    acList.classList.remove('hidden');
    q.setAttribute('aria-expanded', 'true');
    active = -1;
  }

  return {
    setResults: (r: GeoItem[]): void => {
      results = r;
      render();
    },
    getResults: (): GeoItem[] => results,
    getActiveIndex: (): number => active,
    setActiveIndex: (i: number): void => {
      if (results.length === 0) {
        active = -1;
      } else {
        active = Math.max(-1, Math.min(results.length - 1, i));
      }
      highlight();
    },
    close,
    render,
  };
}

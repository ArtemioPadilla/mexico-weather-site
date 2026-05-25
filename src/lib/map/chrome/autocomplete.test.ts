// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  createAutocompleteController,
  type GeoItem,
} from './autocomplete';

function mkInput(): HTMLInputElement {
  const i = document.createElement('input');
  i.type = 'text';
  return i;
}

function mkList(): HTMLUListElement {
  const ul = document.createElement('ul');
  ul.id = 'mapac';
  return ul;
}

const cdmx: GeoItem = {
  name: 'Ciudad de México',
  admin1: 'CDMX',
  country: 'Mexico',
  lat: 19.43,
  lng: -99.13,
  tz: 'America/Mexico_City',
  population: 9_209_944,
};
const small: GeoItem = {
  name: 'Pueblito',
  admin1: 'Oax.',
  country: 'Mexico',
  lat: 17,
  lng: -97,
  tz: 'America/Mexico_City',
  population: 1200,
};

describe('autocomplete controller', () => {
  it('setResults renders <li> per item + sets aria-expanded=true', () => {
    const q = mkInput();
    const ul = mkList();
    const ctrl = createAutocompleteController(q, ul, () => undefined);
    ctrl.setResults([cdmx, small]);
    expect(ul.children).toHaveLength(2);
    expect(q.getAttribute('aria-expanded')).toBe('true');
  });

  it('"ciudad" badge appears for population ≥ 50k only', () => {
    const q = mkInput();
    const ul = mkList();
    const ctrl = createAutocompleteController(q, ul, () => undefined);
    ctrl.setResults([cdmx, small]);
    const firstLiText = (ul.children[0] as HTMLElement).textContent;
    const secondLiText = (ul.children[1] as HTMLElement).textContent;
    expect(firstLiText).toContain('ciudad');
    expect(secondLiText).not.toContain('ciudad');
  });

  it('setActiveIndex clamps to result range and highlights', () => {
    const q = mkInput();
    const ul = mkList();
    const ctrl = createAutocompleteController(q, ul, () => undefined);
    ctrl.setResults([cdmx, small]);
    ctrl.setActiveIndex(99);
    expect(ctrl.getActiveIndex()).toBe(1);
    expect(q.getAttribute('aria-activedescendant')).toBe('mapac-1');
    ctrl.setActiveIndex(-99);
    expect(ctrl.getActiveIndex()).toBe(-1);
    expect(q.getAttribute('aria-activedescendant')).toBeNull();
  });

  it('click on a result fires the select callback', () => {
    const q = mkInput();
    const ul = mkList();
    let picked: GeoItem | null = null;
    const ctrl = createAutocompleteController(q, ul, (r) => {
      picked = r;
    });
    ctrl.setResults([cdmx]);
    (ul.children[0] as HTMLElement).click();
    expect(picked).toBe(cdmx);
  });

  it('close hides the listbox and forgets state', () => {
    const q = mkInput();
    const ul = mkList();
    const ctrl = createAutocompleteController(q, ul, () => undefined);
    ctrl.setResults([cdmx, small]);
    ctrl.setActiveIndex(0);
    ctrl.close();
    expect(ul.classList.contains('hidden')).toBe(true);
    expect(ctrl.getResults()).toEqual([]);
    expect(ctrl.getActiveIndex()).toBe(-1);
    expect(q.getAttribute('aria-expanded')).toBe('false');
  });
});

import { describe, it, expect } from 'vitest';
import {
  FAVORITES_KEY,
  MAX_FAVORITES,
  keyOf,
  load,
  save,
  list,
  has,
  add,
  remove,
  toggle,
  type Favorite,
} from './favorites';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Minimal in-memory storage stand-in for the pure module tests. */
function memStore(initial?: string): Store {
  let value: string | null = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_k: string, v: string) => {
      value = v;
    },
    removeItem: () => {
      value = null;
    },
  };
}

function throwingStore(): Store {
  return {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
    removeItem: () => {
      throw new Error('blocked');
    },
  };
}

function fav(over: Partial<Favorite> = {}): Favorite {
  return {
    lat: 19.43,
    lng: -99.13,
    name: 'Ciudad de México',
    admin: 'CDMX',
    tz: 'America/Mexico_City',
    addedAt: 1000,
    ...over,
  };
}

describe('FAVORITES_KEY / MAX_FAVORITES', () => {
  it('uses the expected localStorage key', () => {
    expect(FAVORITES_KEY).toBe('secid-mwx-favorites');
  });

  it('caps favorites at 12', () => {
    expect(MAX_FAVORITES).toBe(12);
  });
});

describe('keyOf', () => {
  it('rounds lat/lng to 3 decimals joined by a comma', () => {
    expect(keyOf(19.432109, -99.133987)).toBe('19.432,-99.134');
  });

  it('is stable within 3 decimals (dedupe granularity)', () => {
    expect(keyOf(19.4321, -99.1339)).toBe(keyOf(19.4324, -99.1341));
  });
});

describe('load', () => {
  it('returns [] when storage is empty (null)', () => {
    expect(load(memStore())).toEqual([]);
  });

  it('returns [] when getItem throws', () => {
    expect(load(throwingStore())).toEqual([]);
  });

  it('returns [] for corrupt JSON', () => {
    expect(load(memStore('{not json'))).toEqual([]);
  });

  it('returns [] for non-array JSON', () => {
    expect(load(memStore('{"a":1}'))).toEqual([]);
  });

  it('filters out entries failing the type guard', () => {
    const raw = JSON.stringify([
      fav(),
      { lat: 'x', lng: 1, name: 'bad', addedAt: 1 },
      { lat: 1, lng: 2, name: 3, addedAt: 1 },
      { lat: 1, lng: 2, name: 'noAddedAt' },
      fav({ lat: 20.1, lng: -100.2, name: 'OK 2' }),
    ]);
    const out = load(memStore(raw));
    expect(out).toHaveLength(2);
    expect(out.map((f) => f.name)).toEqual(['Ciudad de México', 'OK 2']);
  });
});

describe('non-finite coordinates', () => {
  it('excludes NaN/Infinity entries on reload, valid entry survives', () => {
    const s = memStore();
    // add() does not guard non-finite coords, so these persist...
    add(s, fav({ lat: NaN, lng: 1, name: 'nan-lat' }));
    add(s, fav({ lat: 2, lng: Infinity, name: 'inf-lng' }));
    // ...but isFavorite filters them out on the next load.
    expect(list(s)).toHaveLength(0);

    const valid = fav({ lat: 25.5, lng: -103.5, name: 'Valid' });
    add(s, valid);
    const out = list(s);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Valid');
  });
});

describe('save / load round-trip', () => {
  it('persists and reloads favorites', () => {
    const s = memStore();
    const data = [fav(), fav({ lat: 21, lng: -101, name: 'Otro' })];
    save(s, data);
    expect(load(s)).toEqual(data);
  });

  it('swallows setItem errors (best-effort)', () => {
    expect(() => save(throwingStore(), [fav()])).not.toThrow();
  });
});

describe('list', () => {
  it('is an alias of load', () => {
    const s = memStore(JSON.stringify([fav()]));
    expect(list(s)).toEqual(load(s));
  });
});

describe('has', () => {
  it('matches by keyOf within 3 decimals', () => {
    const s = memStore(JSON.stringify([fav({ lat: 19.4321, lng: -99.1339 })]));
    expect(has(s, 19.4324, -99.1341)).toBe(true);
    expect(has(s, 20, -100)).toBe(false);
  });
});

describe('add', () => {
  it('adds a new favorite and persists it', () => {
    const s = memStore();
    expect(add(s, fav())).toBe(true);
    expect(list(s)).toHaveLength(1);
  });

  it('rejects a duplicate by 3dp key (keeps the first, no-op)', () => {
    const s = memStore();
    expect(add(s, fav({ name: 'First', lat: 19.4321, lng: -99.1339 }))).toBe(
      true,
    );
    expect(add(s, fav({ name: 'Second', lat: 19.4324, lng: -99.1341 }))).toBe(
      false,
    );
    const out = list(s);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('First');
  });

  it('rejects the 13th favorite (cap 12, no-op false)', () => {
    const s = memStore();
    for (let i = 0; i < MAX_FAVORITES; i++) {
      expect(add(s, fav({ lat: i, lng: i, name: 'C' + i }))).toBe(true);
    }
    expect(add(s, fav({ lat: 99, lng: 99, name: 'overflow' }))).toBe(false);
    expect(list(s)).toHaveLength(MAX_FAVORITES);
  });
});

describe('remove', () => {
  it('removes a present favorite and returns true', () => {
    const s = memStore();
    add(s, fav());
    expect(remove(s, 19.43, -99.13)).toBe(true);
    expect(list(s)).toHaveLength(0);
  });

  it('returns false when nothing was removed', () => {
    const s = memStore();
    expect(remove(s, 1, 2)).toBe(false);
  });
});

describe('toggle', () => {
  it('removes when present, returning the new state false', () => {
    const s = memStore();
    add(s, fav());
    expect(toggle(s, fav())).toBe(false);
    expect(has(s, 19.43, -99.13)).toBe(false);
  });

  it('adds when absent, returning the new state true', () => {
    const s = memStore();
    expect(toggle(s, fav())).toBe(true);
    expect(has(s, 19.43, -99.13)).toBe(true);
  });

  it('returns false when adding would exceed the cap', () => {
    const s = memStore();
    for (let i = 0; i < MAX_FAVORITES; i++) {
      add(s, fav({ lat: i, lng: i, name: 'C' + i }));
    }
    expect(toggle(s, fav({ lat: 99, lng: 99, name: 'overflow' }))).toBe(false);
    expect(list(s)).toHaveLength(MAX_FAVORITES);
  });
});

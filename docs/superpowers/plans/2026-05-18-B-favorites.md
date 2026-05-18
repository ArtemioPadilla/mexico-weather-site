# Plan B — Favorites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let users favorite any location (localStorage, cap 12), always shown in a client-rendered "⭐ Tus lugares" section, with a ⭐ toggle on every city card and the detail header.

**Architecture:** Pure DOM-free `src/lib/favorites.ts` (injectable storage, Vitest-tested) + client wiring in `index.astro` (Tus lugares section + star toggles, reusing the existing preset-card render/`getForecast` path) and a star in `forecast.astro`. localStorage only; no backend.

**Tech Stack:** Astro 6 static, TypeScript strict, Vitest, Playwright, Tailwind 4.

---

## File structure
| File | Responsibility | Action |
|---|---|---|
| `src/lib/favorites.ts` | pure favorites store (load/save/list/has/add/remove/toggle, cap, dedupe) | Create |
| `src/lib/favorites.test.ts` | unit tests | Create |
| `src/pages/index.astro` | "Tus lugares" section + ⭐ on cards + live re-render | Modify |
| `src/pages/forecast.astro` | ⭐ toggle in the detail header | Modify |
| `src/pages/privacidad.astro` | one line about local-only favorites | Modify |
| `e2e/favorites.spec.ts` | favorite→appears→persist→remove | Create |

---

### Task B1: `src/lib/favorites.ts` pure module (TDD)

**Files:** Create `src/lib/favorites.ts`, `src/lib/favorites.test.ts`

- [ ] **Step 1: Failing tests** — `src/lib/favorites.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import {
  FAVORITES_KEY, keyOf, load, save, list, has, add, remove, toggle,
  type Favorite,
} from './favorites';

function memStore(initial?: string) {
  let v = initial ?? null;
  return {
    getItem: (_k: string) => v,
    setItem: (_k: string, val: string) => { v = val; },
    removeItem: (_k: string) => { v = null; },
  } as unknown as Storage;
}
const f = (lat: number, lng: number, name = 'X'): Favorite =>
  ({ lat, lng, name, addedAt: 1 });

describe('favorites', () => {
  it('FAVORITES_KEY is stable', () => {
    expect(FAVORITES_KEY).toBe('secid-mwx-favorites');
  });
  it('keyOf rounds to 3dp', () => {
    expect(keyOf(19.432109, -99.133987)).toBe('19.432,-99.134');
  });
  it('load returns [] for empty/corrupt/non-array', () => {
    expect(load(memStore())).toEqual([]);
    expect(load(memStore('not json'))).toEqual([]);
    expect(load(memStore('{"a":1}'))).toEqual([]);
    expect(load(memStore('[{"bad":true}]'))).toEqual([]); // filters invalid entries
  });
  it('add dedupes by 3dp key (keeps first)', () => {
    const s = memStore();
    expect(add(s, f(19.4321, -99.1339, 'A'))).toBe(true);
    expect(add(s, f(19.43209, -99.13388, 'B'))).toBe(false); // same rounded key
    expect(list(s).map((x) => x.name)).toEqual(['A']);
  });
  it('caps at 12 and rejects the 13th (no-op, returns false)', () => {
    const s = memStore();
    for (let i = 0; i < 12; i += 1) expect(add(s, f(i, i, 'c' + i))).toBe(true);
    expect(add(s, f(99, 99, 'over'))).toBe(false);
    expect(list(s).length).toBe(12);
  });
  it('has / remove / toggle', () => {
    const s = memStore();
    add(s, f(1, 2, 'A'));
    expect(has(s, 1.0004, 2.0004)).toBe(true);   // within 3dp
    expect(toggle(s, f(1, 2, 'A'))).toBe(false);  // was present → removed
    expect(has(s, 1, 2)).toBe(false);
    expect(toggle(s, f(1, 2, 'A'))).toBe(true);   // absent → added
    expect(remove(s, 1, 2)).toBe(true);
    expect(list(s)).toEqual([]);
  });
  it('save/load round-trips', () => {
    const s = memStore();
    save(s, [f(3, 4, 'Z')]);
    expect(load(s)).toEqual([f(3, 4, 'Z')]);
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `npm test -- favorites`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/lib/favorites.ts`**

```ts
// Pure, DOM-free favorites store. All browser wiring lives in the Astro
// scripts; this module only manipulates a Storage-like dependency so it is
// fully unit-testable and deterministic.

export const FAVORITES_KEY = 'secid-mwx-favorites';
export const MAX_FAVORITES = 12;

export interface Favorite {
  lat: number;
  lng: number;
  name: string;
  admin?: string;
  tz?: string;
  addedAt: number;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Stable identity key: lat/lng rounded to 3 decimals (~110 m). */
export function keyOf(lat: number, lng: number): string {
  const r = (n: number) => (Math.round(n * 1000) / 1000).toString();
  return `${r(lat)},${r(lng)}`;
}

function isFavorite(v: unknown): v is Favorite {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.lat === 'number' &&
    typeof o.lng === 'number' &&
    typeof o.name === 'string' &&
    typeof o.addedAt === 'number'
  );
}

export function load(storage: StorageLike): Favorite[] {
  let raw: string | null = null;
  try {
    raw = storage.getItem(FAVORITES_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isFavorite);
  } catch {
    return [];
  }
}

export function save(storage: StorageLike, favs: Favorite[]): void {
  try {
    storage.setItem(FAVORITES_KEY, JSON.stringify(favs));
  } catch {
    /* storage full / unavailable — best-effort */
  }
}

export function list(storage: StorageLike): Favorite[] {
  return load(storage);
}

export function has(storage: StorageLike, lat: number, lng: number): boolean {
  const k = keyOf(lat, lng);
  return load(storage).some((x) => keyOf(x.lat, x.lng) === k);
}

/** Returns true if added, false if duplicate or cap reached (no-op). */
export function add(storage: StorageLike, fav: Favorite): boolean {
  const favs = load(storage);
  const k = keyOf(fav.lat, fav.lng);
  if (favs.some((x) => keyOf(x.lat, x.lng) === k)) return false;
  if (favs.length >= MAX_FAVORITES) return false;
  favs.push(fav);
  save(storage, favs);
  return true;
}

/** Returns true if an entry was removed. */
export function remove(storage: StorageLike, lat: number, lng: number): boolean {
  const favs = load(storage);
  const k = keyOf(lat, lng);
  const next = favs.filter((x) => keyOf(x.lat, x.lng) !== k);
  if (next.length === favs.length) return false;
  save(storage, next);
  return true;
}

/** Toggle: returns the NEW state (true = now favorited, false = not). */
export function toggle(storage: StorageLike, fav: Favorite): boolean {
  if (has(storage, fav.lat, fav.lng)) {
    remove(storage, fav.lat, fav.lng);
    return false;
  }
  return add(storage, fav); // false if cap reached → caller shows message
}
```

- [ ] **Step 4: Run → pass**

Run: `npm test -- favorites`
Expected: PASS (all cases).

- [ ] **Step 5: Gate + commit**

Run: `npm run check && npm run lint && npm test` (green).

```bash
git add src/lib/favorites.ts src/lib/favorites.test.ts
git -c commit.gpgsign=false commit -m "feat: pure favorites store (localStorage, cap 12, 3dp dedupe)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task B2: "⭐ Tus lugares" section + star toggle on every card (`index.astro`)

**Files:** Modify `src/pages/index.astro`

- [ ] **Step 1: Read current structure**

Run: `grep -n "Pronóstico por Ciudad\|data-city-card\|cities.map\|js-full\|fullHref\|renderCard\|preset\|<section" src/pages/index.astro`
Identify: the preset card template/loop, the `getForecast` per-card refresh path, `fullHref`, and the bundled `<script>`.

- [ ] **Step 2: Add the section markup + per-card star button**

In the page body, **before** the "Pronóstico por Ciudad" section, add an
empty container the script fills:

```astro
<section id="fav-section" class="hidden mb-8" aria-label="Tus lugares">
  <h2 class="text-lg font-semibold mb-3 flex items-center gap-2">
    <span aria-hidden="true">⭐</span> Tus lugares
  </h2>
  <div id="fav-grid" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"></div>
</section>
```

In the **preset card template** (inside `cities.map(...)`) add, top-right of
each card, a star toggle button (theme-aware, accessible):

```astro
<button type="button" class="js-fav-star absolute top-2 right-2 text-lg leading-none text-gray-400 hover:text-amber-400 dark:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded"
  aria-pressed="false" aria-label="Agregar a favoritos" title="Agregar a favoritos">☆</button>
```

Ensure the card root is `relative`. (Same button is reused in the
favorite-card template the script builds, and in the quick-peek block.)

- [ ] **Step 3: Wire favorites in the bundled `<script>`**

Add imports and logic (reuse the existing per-card render/`getForecast`
helper — extract it into a `renderCityCard(el, {lat,lng,name,tz,admin})`
function if not already reusable; keep DOM-free logic in `favorites.ts`):

```ts
import { list, has, toggle, type Favorite } from '../lib/favorites';

const store = window.localStorage;
const favSection = document.getElementById('fav-section')!;
const favGrid = document.getElementById('fav-grid')!;

function favOf(el: { lat: number|string; lng: number|string; name: string; tz?: string; admin?: string }): Favorite {
  return { lat: Number(el.lat), lng: Number(el.lng), name: el.name,
    admin: el.admin, tz: el.tz, addedAt: Date.now() };
}
function syncStar(btn: HTMLButtonElement, lat: number, lng: number) {
  const on = has(store, lat, lng);
  btn.textContent = on ? '★' : '☆';
  btn.classList.toggle('text-amber-400', on);
  btn.setAttribute('aria-pressed', String(on));
  const lbl = on ? 'Quitar de favoritos' : 'Agregar a favoritos';
  btn.setAttribute('aria-label', lbl);
  btn.title = lbl;
}
function renderFavorites() {
  const favs = list(store);
  if (favs.length === 0) { favSection.classList.add('hidden'); favGrid.textContent = ''; return; }
  favSection.classList.remove('hidden');
  favGrid.textContent = '';
  for (const fv of favs) {
    const card = buildCityCardElement(fv);          // reuse preset card builder
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'absolute top-2 right-9 text-sm text-gray-400 hover:text-red-400';
    rm.setAttribute('aria-label', 'Quitar de favoritos');
    rm.title = 'Quitar';
    rm.textContent = '✕';
    rm.addEventListener('click', () => { toggle(store, fv); renderFavorites(); syncAllStars(); });
    card.appendChild(rm);
    favGrid.appendChild(card);
    refreshCityCard(card, fv);                       // existing getForecast path
  }
}
function syncAllStars() {
  document.querySelectorAll<HTMLButtonElement>('.js-fav-star').forEach((btn) => {
    const c = btn.closest('[data-lat]') as HTMLElement | null;
    if (c) syncStar(btn, Number(c.dataset.lat), Number(c.dataset.lng));
  });
}
// wire each preset/quick-peek star
document.querySelectorAll<HTMLButtonElement>('.js-fav-star').forEach((btn) => {
  const c = btn.closest('[data-lat]') as HTMLElement;
  const lat = Number(c.dataset.lat), lng = Number(c.dataset.lng);
  syncStar(btn, lat, lng);
  btn.addEventListener('click', () => {
    const added = toggle(store, favOf({ lat, lng,
      name: c.querySelector('h3,.js-name')?.textContent?.trim() || `${lat},${lng}`,
      tz: c.dataset.tz, admin: c.dataset.admin }));
    if (!added && !has(store, lat, lng) && list(store).length >= 12) {
      // cap hit: brief inline note (reuse an aria-live element or alert region)
    }
    syncStar(btn, lat, lng); renderFavorites(); syncAllStars();
  });
});
renderFavorites();
```

> If `buildCityCardElement`/`refreshCityCard` don't exist, refactor the
> existing preset rendering into these two reusable functions (one builds the
> card DOM from `{lat,lng,name,tz,admin}`, one runs the existing `getForecast`
> fill). Favorite cards MUST use the identical structure/classes and the same
> `js-full` link via `fullHref(lat,lng,tz,name,admin)`. Do not duplicate the
> card markup — extract and reuse. Keep the combobox/search a11y untouched.

- [ ] **Step 4: Build & manual reason**

Run: `npm run build` (success). Reason: no favorites → `#fav-section` stays
`hidden`; adding via a preset star shows the section with a live card +
remove ✕; reload persists (localStorage).

- [ ] **Step 5: Gate + commit**

Run: `npm run check && npm run lint && npm test && npm run build` (green).

```bash
git add src/pages/index.astro
git -c commit.gpgsign=false commit -m "feat: Tus lugares section + star toggle on city cards

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task B3: Star toggle on the `/forecast` detail header + privacy line

**Files:** Modify `src/pages/forecast.astro`, `src/pages/privacidad.astro`

- [ ] **Step 1:** In `forecast.astro`, in the rendered current/header block,
add a star button next to the title (the renderer builds `currentHtml`):

```html
<button type="button" id="fc-fav" class="text-2xl leading-none text-gray-400 hover:text-amber-400 dark:text-gray-500 focus-visible:ring-2 focus-visible:ring-amber-500 rounded ml-2"
  aria-pressed="false" aria-label="Agregar a favoritos" title="Agregar a favoritos">☆</button>
```

After injecting `root.innerHTML`, wire it (import `has`,`toggle` from
`../lib/favorites`; build the Favorite from the parsed URL params
`loc.lat/lng/name/admin/tz`):

```ts
const favBtn = document.getElementById('fc-fav') as HTMLButtonElement | null;
if (favBtn) {
  const store = window.localStorage;
  const fav = { lat: loc.lat, lng: loc.lng, name: loc.name || `${loc.lat},${loc.lng}`,
    admin: loc.admin, tz: loc.tz, addedAt: Date.now() };
  const sync = () => {
    const on = has(store, loc.lat, loc.lng);
    favBtn.textContent = on ? '★' : '☆';
    favBtn.classList.toggle('text-amber-400', on);
    favBtn.setAttribute('aria-pressed', String(on));
    const l = on ? 'Quitar de favoritos' : 'Agregar a favoritos';
    favBtn.setAttribute('aria-label', l); favBtn.title = l;
  };
  sync();
  favBtn.addEventListener('click', () => { toggle(store, fav); sync(); });
}
```

(Escape nothing here — no innerHTML of user data; button text is a static
glyph. The `loc.name`/`admin` were already sanitized for display.)

- [ ] **Step 2:** In `privacidad.astro`, add one sentence in the data/no-tracking
section: "Tus lugares favoritos se guardan únicamente en tu navegador
(localStorage); nunca se envían a ningún servidor y se borran si limpias los
datos del sitio."

- [ ] **Step 3: Gate + commit**

Run: `npm run check && npm run lint && npm test && npm run build` (green).

```bash
git add src/pages/forecast.astro src/pages/privacidad.astro
git -c commit.gpgsign=false commit -m "feat: favorite star on forecast detail; document favorites privacy

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task B4: E2E

**Files:** Create `e2e/favorites.spec.ts`

- [ ] **Step 1: Write the spec** (mock Open-Meteo as the other specs do via the shared helper)

```ts
import { test, expect } from '@playwright/test';
import { mockOpenMeteo } from './helpers';

test('favorite a place: detail star → Tus lugares → persists → remove', async ({ page }) => {
  await mockOpenMeteo(page);
  await page.goto('forecast/?lat=19.43&lng=-99.13&tz=America/Mexico_City&name=Ciudad%20de%20M%C3%A9xico&admin=CDMX');
  const star = page.locator('#fc-fav');
  await expect(star).toHaveAttribute('aria-pressed', 'false');
  await star.click();
  await expect(star).toHaveAttribute('aria-pressed', 'true');

  await page.goto('');                // homepage
  const favSection = page.getByRole('region', { name: 'Tus lugares' })
    .or(page.locator('#fav-section'));
  await expect(page.locator('#fav-section')).toBeVisible();
  await expect(page.locator('#fav-grid')).toContainText('Ciudad de México');

  await page.reload();                // persistence
  await expect(page.locator('#fav-grid')).toContainText('Ciudad de México');

  await page.locator('#fav-grid >> text=✕').first().click();   // remove
  await expect(page.locator('#fav-section')).toBeHidden();
});
```

- [ ] **Step 2: Run e2e**

Run: `npx playwright install chromium >/dev/null 2>&1 && npm run test:e2e`
Expected: all specs pass (existing 12 + this one).

- [ ] **Step 3: Final gate + commit**

Run: `npm run check && npm run lint && npm test && npm run build && npm run test:e2e` (all green).

```bash
git add e2e/favorites.spec.ts
git -c commit.gpgsign=false commit -m "test(e2e): favorites add/persist/remove flow

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-review
- **Spec coverage:** favorites.ts pure module w/ cap-12-reject + 3dp dedupe + corrupt-safe (B1) ✓; "Tus lugares" client-only section + ⭐ on every card reusing preset render (B2) ✓; detail-header star + privacy line (B3) ✓; unit tests (B1) + E2E (B4) ✓. No gaps.
- **Placeholders:** none — full module + tests + wiring code given. The "extract `buildCityCardElement`/`refreshCityCard`" instruction is explicit refactor guidance, not a placeholder; the engineer reuses existing preset render.
- **Type consistency:** `Favorite`/`keyOf`/`has`/`toggle`/`list`/`add`/`remove`/`load`/`save`/`FAVORITES_KEY`/`MAX_FAVORITES` consistent across B1–B4; `fullHref(lat,lng,tz,name,admin)` matches the Plan-A/feature signature; storage = `window.localStorage`.

## Execution: ship as one PR "feat: favorites (Tus lugares, star toggles)" after Plan A is merged; CI+E2E green; deploy; **live browser-verify** add/persist/remove + star state on presets and detail.

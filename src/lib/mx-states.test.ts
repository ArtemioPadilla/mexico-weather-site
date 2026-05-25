import { describe, expect, it } from 'vitest';
import { MX_STATES, findStateBySlug, resolveStateName } from './mx-states';
import { TOP_CITIES } from './top-cities';

describe('MX_STATES', () => {
  it('has exactly 32 federal entities', () => {
    expect(MX_STATES.length).toBe(32);
  });

  it('every slug is unique', () => {
    const slugs = MX_STATES.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('every slug is URL-safe', () => {
    for (const s of MX_STATES) {
      expect(s.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('every state has a capital with valid MX coords', () => {
    for (const s of MX_STATES) {
      expect(s.capital.length).toBeGreaterThan(0);
      expect(s.capitalLat).toBeGreaterThan(14);
      expect(s.capitalLat).toBeLessThan(33);
      expect(s.capitalLng).toBeGreaterThan(-118);
      expect(s.capitalLng).toBeLessThan(-86);
    }
  });

  it('capitalSlug, when present, references a real TOP_CITIES slug', () => {
    const knownSlugs = new Set(TOP_CITIES.map((c) => c.slug));
    for (const s of MX_STATES) {
      if (s.capitalSlug) {
        expect(knownSlugs.has(s.capitalSlug), `state ${s.slug}`).toBe(true);
      }
    }
  });

  it('every TOP_CITIES admin maps to a MX_STATES name via resolveStateName', () => {
    // TOP_CITIES.admin is a *display* label and may use the common
    // abbreviation ('CDMX') instead of the full state name ('Ciudad
    // de México'). State-page rollups use resolveStateName() to
    // bridge the gap — any mismatch here would mean cities in that
    // state silently disappear from /estado/<slug>/.
    const stateNames = new Set(MX_STATES.map((s) => s.name));
    for (const c of TOP_CITIES) {
      const resolved = resolveStateName(c.admin);
      expect(stateNames.has(resolved), `city ${c.slug} admin=${c.admin}`).toBe(
        true,
      );
    }
  });

  it('findStateBySlug returns the matching state', () => {
    expect(findStateBySlug('jalisco')?.capital).toBe('Guadalajara');
  });

  it('findStateBySlug returns undefined for unknown slugs', () => {
    expect(findStateBySlug('not-a-state')).toBeUndefined();
  });
});

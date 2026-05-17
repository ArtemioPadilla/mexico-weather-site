import { describe, it, expect } from 'vitest';
import {
  resolveTheme,
  normalizePreference,
  nextPreference,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from './theme';

describe('THEME_STORAGE_KEY', () => {
  it('is the expected localStorage key', () => {
    expect(THEME_STORAGE_KEY).toBe('theme');
  });
});

describe('normalizePreference', () => {
  it('passes through the three valid preferences', () => {
    expect(normalizePreference('light')).toBe('light');
    expect(normalizePreference('dark')).toBe('dark');
    expect(normalizePreference('system')).toBe('system');
  });

  it('treats null/undefined/empty as system', () => {
    expect(normalizePreference(null)).toBe('system');
    expect(normalizePreference(undefined)).toBe('system');
    expect(normalizePreference('')).toBe('system');
  });

  it('treats garbage and wrong-case values as system', () => {
    expect(normalizePreference('garbage')).toBe('system');
    expect(normalizePreference('LIGHT')).toBe('system');
    expect(normalizePreference('Dark')).toBe('system');
    expect(normalizePreference(' light ')).toBe('system');
  });
});

describe('resolveTheme', () => {
  it("returns 'light' when preference is 'light' regardless of system", () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('light', false)).toBe('light');
  });

  it("returns 'dark' when preference is 'dark' regardless of system", () => {
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it("follows the OS when preference is 'system'", () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('treats null/undefined/unknown preference like system', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
    expect(resolveTheme(undefined, true)).toBe('dark');
    expect(resolveTheme(undefined, false)).toBe('light');
    // An unexpected value also falls through to the OS preference.
    expect(resolveTheme('weird' as unknown as ThemePreference, true)).toBe(
      'dark',
    );
    expect(resolveTheme('weird' as unknown as ThemePreference, false)).toBe(
      'light',
    );
  });
});

describe('nextPreference', () => {
  it('cycles system → light → dark → system', () => {
    expect(nextPreference('system')).toBe('light');
    expect(nextPreference('light')).toBe('dark');
    expect(nextPreference('dark')).toBe('system');
  });

  it('completes a full cycle back to the start', () => {
    let p: ThemePreference = 'system';
    p = nextPreference(p);
    p = nextPreference(p);
    p = nextPreference(p);
    expect(p).toBe('system');
  });

  it('is total: any input yields a valid preference', () => {
    const valid: ThemePreference[] = ['light', 'dark', 'system'];
    for (const input of ['system', 'light', 'dark', 'weird', '']) {
      expect(valid).toContain(
        nextPreference(input as unknown as ThemePreference),
      );
    }
  });
});

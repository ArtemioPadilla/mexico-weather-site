/**
 * theme.ts — Lógica pura para resolver el tema efectivo.
 *
 * El sitio soporta tres preferencias de tema:
 *   - 'light'   → siempre claro
 *   - 'dark'    → siempre oscuro
 *   - 'system'  → sigue la preferencia del sistema operativo
 *
 * `resolveTheme` traduce la preferencia almacenada (o `null`, que se trata
 * como 'system') al tema efectivo ('light' | 'dark') que debe aplicarse al
 * documento. Se mantiene libre de efectos secundarios para poder probarse.
 */

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/** Clave usada en localStorage para persistir la preferencia. */
export const THEME_STORAGE_KEY = 'theme';

/**
 * Resuelve el tema efectivo a partir de la preferencia del usuario.
 *
 * @param preference  Preferencia almacenada; `null`/desconocida → 'system'.
 * @param prefersDark Resultado de `matchMedia('(prefers-color-scheme: dark)')`.
 */
export function resolveTheme(
  preference: ThemePreference | null | undefined,
  prefersDark: boolean,
): ResolvedTheme {
  if (preference === 'light') return 'light';
  if (preference === 'dark') return 'dark';
  // 'system', null, undefined o cualquier valor inesperado → seguir al SO.
  return prefersDark ? 'dark' : 'light';
}

/**
 * Normaliza un valor crudo de localStorage a una `ThemePreference`.
 * Cualquier valor inválido se trata como 'system'.
 */
export function normalizePreference(
  raw: string | null | undefined,
): ThemePreference {
  return raw === 'light' || raw === 'dark' || raw === 'system'
    ? raw
    : 'system';
}

/**
 * Devuelve la siguiente preferencia en el ciclo
 * Sistema → Claro → Oscuro → Sistema.
 */
export function nextPreference(current: ThemePreference): ThemePreference {
  switch (current) {
    case 'system':
      return 'light';
    case 'light':
      return 'dark';
    case 'dark':
    default:
      return 'system';
  }
}

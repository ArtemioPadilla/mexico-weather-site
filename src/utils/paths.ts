/** import.meta.env.BASE_URL normalized to always end with a single trailing slash. */
export function siteBase(): string {
  const b = import.meta.env.BASE_URL;
  return b.endsWith('/') ? b : `${b}/`;
}

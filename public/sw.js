/*
 * Isolation service worker for Clima México.
 *
 * Purpose: this site is a project page deployed under
 * https://artemiop.com/mexico-weather-site/ on the same origin as the parent
 * user site (ArtemioPadilla.github.io), whose PWA service worker
 * (https://artemiop.com/sw.js) has scope "/" and therefore would otherwise
 * control these weather pages. A stale parent SW broke the client-side
 * Open-Meteo fetches on first load. The browser always gives control of a
 * client to the most specifically-scoped registration, so by registering THIS
 * worker at https://artemiop.com/mexico-weather-site/sw.js (default scope
 * /mexico-weather-site/) the parent root SW can never control or intercept
 * weather pages again.
 *
 * Caching: INTENTIONALLY NONE. This site does its own client-side weather
 * fetching/refresh plus a build-time RSS; any SW caching here could reintroduce
 * the exact stale-data class of bug this change fixes. This worker exists ONLY
 * to claim the scope and act as a pure network pass-through. There is
 * deliberately NO `fetch` listener: a worker with no fetch handler still
 * "controls" its clients (so the parent SW does not), but every request goes
 * straight to the network exactly as if no SW were installed. This is the
 * simplest correct option.
 */

self.addEventListener('install', () => {
  // Activate this worker immediately instead of waiting for old clients to
  // close, so a stale parent SW is displaced as fast as possible.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Take control of any in-scope clients (already-open weather pages) right
  // away so the parent root SW stops controlling them this session.
  event.waitUntil(self.clients.claim());
});

// No `fetch` listener by design — see the header comment. The mere existence
// of this registration (more specific scope than the parent "/") wins control
// of /mexico-weather-site/ clients while leaving all network traffic untouched.

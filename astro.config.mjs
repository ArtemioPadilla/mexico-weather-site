import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://artemiop.com',
  base: '/mexico-weather',
  output: 'static',
  vite: {
    plugins: [tailwindcss()],
    build: {
      // MapLibre GL is ~750 kB minified, lazy-loaded onto /mapa only (no other
      // route ships it — documented exception in the spec). Raise the warning
      // threshold so this expected chunk is silent but a genuinely new large
      // dependency would still trip it.
      chunkSizeWarningLimit: 1100,
    },
  },
});

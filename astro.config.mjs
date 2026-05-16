import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://ArtemioPadilla.github.io',
  base: '/mexico-weather-site',
  integrations: [tailwind()],
  output: 'static',
});

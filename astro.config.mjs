import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://artemiop.com',
  base: '/mexico-weather-site',
  output: 'static',
  vite: {
    plugins: [tailwindcss()],
  },
});

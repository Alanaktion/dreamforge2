import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';

// In development the FastAPI server runs separately (npm run dev:api); Vite forwards API
// calls to it so the browser only ever talks to one origin, as in production.
const apiTarget = process.env.API_URL ?? 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    proxy: {
      '/api': { target: apiTarget, xfwd: true },
      '/healthz': { target: apiTarget }
    }
  },
  preview: {
    proxy: {
      '/api': { target: apiTarget, xfwd: true }
    }
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: true
  }
});

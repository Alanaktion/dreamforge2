import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // A single-page app: every route falls back to index.html, which the FastAPI server
    // (backend/) serves for any path that is not /api or a built asset.
    adapter: adapter({ pages: 'build', assets: 'build', fallback: 'index.html', strict: true }),
    alias: {
      '@/*': './src/*'
    }
  }
};

export default config;

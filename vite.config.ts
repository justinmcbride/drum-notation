import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works on GitHub Pages under /<repo>/ and anywhere else.
  base: './',
  build: { target: 'es2022' },
});

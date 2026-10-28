import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// base './' so the bundle works from any path the platform serves it under.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false },
  test: { environment: 'jsdom', globals: false, setupFiles: [] },
});

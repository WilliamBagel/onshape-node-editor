import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

// Minimal, isolated from vite.config.ts: vite.config.ts scopes `root` to
// src/app and rewrites the HTML for the Onshape iframe, neither of which the
// unit tests want. Do not import it here -- build behaviour must stay as it is.
// The Vue plugin lets the jsdom component tests (documentation panel) mount
// SFCs inside this otherwise node-first suite; it only transforms .vue files.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/app', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    // UI harness tests (issue #75) need jsdom + Vue SFCs; they run under
    // vitest.ui.config.ts only, so the node suite stays at 561 tests.
    exclude: ['**/node_modules/**', 'src/app/test-utils/**'],
    reporters: ['default'],
  },
});

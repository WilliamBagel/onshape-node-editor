import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Minimal, isolated from vite.config.ts: vite.config.ts scopes `root` to
// src/app and rewrites the HTML for the Onshape iframe, neither of which the
// unit tests want. Do not import it here -- build behaviour must stay as it is.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/app', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    reporters: ['default'],
  },
});

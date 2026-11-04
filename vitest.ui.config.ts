import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

/**
 * UI-test config (issue #75). Deliberately separate from vitest.config.ts:
 * the main suite is node-env only; this one mounts Vue SFCs in jsdom.
 * The default `pnpm test` never picks these files up.
 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/app', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/app/test-utils/__tests__/**/*.test.ts'],
    reporters: ['default'],
  },
});

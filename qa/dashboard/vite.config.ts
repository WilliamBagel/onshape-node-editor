import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root,
  base: './',
  build: { outDir: path.resolve(root, '../../dist/qa-dashboard'), emptyOutDir: true },
});

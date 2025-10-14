import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

const repoRoot = path.resolve(__dirname)
const appRoot = path.resolve(repoRoot, 'src', 'app')
const distApp = path.resolve(repoRoot, 'dist', 'app')

// Vite's build.outDir is interpreted relative to the `root` option when it's a relative path.
// Use a path relative to the app root so output ends up at repoRoot/dist/app.
const outDirRelativeToRoot = path.relative(appRoot, distApp)

export default defineConfig({
  root: appRoot,
  publicDir: path.resolve(repoRoot, 'public'),
  plugins: [
    vue(),
    vueDevTools(),
  ],
  build: {
    outDir: outDirRelativeToRoot, // will resolve to ../../dist/app when root=src/app
    emptyOutDir: true,
    // base: '/onshape-node-editor/' // uncomment and set if deploying to GitHub Pages subpath
  },
  resolve: {
    alias: {
      // keep the @ alias for your app source
      '@': fileURLToPath(new URL('./src/app', import.meta.url))
    },
  },
  base: '/onshape-node-editor/'
})
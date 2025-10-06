# onshape-node-editor

This template should help get you started developing with Vue 3 in Vite.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd) 
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```

### Build and deploy the client app (GitHub Pages)

This builds only the web app into `dist/app`. You can publish that folder to GitHub Pages.

```
npm run build:app
npm run deploy:app
```

Set `GH_PAGES_BRANCH` or configure `gh-pages` as needed. You can also manually publish `dist/app`.

### Build and deploy the server (Azure Functions)

Builds the server TypeScript into `dist/server`, producing a function app layout. Then publish using the Azure Functions Core Tools.

```
npm run build:server
set AZURE_FUNCTIONAPP_NAME=your-functionapp-name
npm run deploy:server
```

The `deploy:server` script calls `func azure functionapp publish` — make sure the Azure Functions Core Tools (`func`) are installed and you are logged in.


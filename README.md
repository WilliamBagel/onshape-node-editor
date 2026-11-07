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

This builds only the web app into `dist/app`.

Publishing to `https://williambagel.github.io/onshape-node-editor/` is done by the
`deploy-production.yml` workflow, from a GitHub Actions artifact. There is no
`gh-pages` branch in that path: this repository's Pages settings use
`build_type=workflow`, so pushing build output to a branch would not change the
live site (verified — the live `index.html` references assets the `gh-pages`
branch does not contain, and the branch's asset 404s on the site).

```
pnpm run build:app   # build locally into dist/app
pnpm run deploy:app  # dispatch the deploy workflow for the current branch
```

`deploy:app` refuses unless the tree is clean and your HEAD is already on
`origin/<branch>`, because the workflow is dispatched against a ref that must
exist on GitHub; publishing from an unpushed branch would either fail or publish
an older commit than the one you tested. Pushing `master` publishes on its own
through the workflow's push trigger. To follow it:
`gh run list --workflow deploy-production.yml`.

The deployed URL is part of the Onshape extension registration, so it must stay
in step with `myclient` (`src/app/app.ts:51`), `public/redirect.html:17` and the
portal — see `docs/extension-setup.md` §7.

### UI QA dashboard (CI/CD product)

Every `master` deployment also publishes the exploratory UI QA dashboard at:

```
https://williambagel.github.io/onshape-node-editor/qa/
```

The deploy workflow builds the app, starts the Vite dev entrypoint (the
production entrypoint requires Onshape OAuth and cannot boot outside the
Onshape host), runs `qa/harness/explorer.mjs` against the sample graph,
annotates findings, builds the QA dashboard app (`qa/dashboard/`, Vite ->
`dist/qa-dashboard`), and copies the build plus `data/report.json` and
screenshots into `dist/app/qa` before the Pages artifact is uploaded. The
dashboard is a real app loading report JSON, not a generated HTML file; see
`qa/README.md`. Findings are advisory for the deploy (known product
gaps must not block the app), but a harness crash still fails the job. Pull
requests run the same explorer and attach `ui-qa-report-<run>` as a workflow
artifact.

Run it locally with:

```sh
pnpm run dev
pnpm run explore:ui -- --out tmp/qa-runs/<id> --task make-filleted-cylinder
pnpm run build:qa-dashboard
pnpm run smoke:qa-dashboard
pnpm run qa:review -- --report tmp/qa-runs/<id>/report.json
```

Publishing from a branch other than `master`, without pushing `master`:

```
git checkout -b deploy/pages-$(git rev-parse --short HEAD)
git push -u origin deploy/pages-<sha>
pnpm run deploy:app
```

The `github-pages` environment carries a deployment branch policy that allows
`master`, `gh-pages` and `deploy/*`. `deploy-production.yml` declares that
environment, so a job on any other ref is rejected before the first step with
*"Branch ... is not allowed to deploy to github-pages due to environment
protection rules"*. Add a policy for a new pattern before dispatching from it:

```
gh api -X POST repos/<owner>/<repo>/environments/github-pages/deployment-branch-policies -f name='deploy/*'
```

### Build and deploy the server (Azure Functions)

Builds the server TypeScript into `dist/server`, producing a function app layout. Then publish using the Azure Functions Core Tools.

```
npm run build:server
set AZURE_FUNCTIONAPP_NAME=your-functionapp-name
npm run deploy:server
```

The `deploy:server` script calls `func azure functionapp publish` — make sure the Azure Functions Core Tools (`func`) are installed and you are logged in.


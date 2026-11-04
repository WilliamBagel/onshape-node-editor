# UI test harness (issue #75)

Run headless UI tests without a live Onshape tab:

```bash
pnpm run test:ui   # vitest.ui.config.ts (jsdom + Vue SFC mount)
pnpm test          # existing node suite — untouched, must stay green
```

Open the interactive harness in a browser (no Onshape needed):

```bash
pnpm dev    # then visit /dev/harness.html
```

## What's in `src/app/test-utils/`

| File | Simulates |
|---|---|
| `fake-onshape-api.ts` | Document/element API seam used by `App` code (`documentApi.getElementsInDocument`, `featureStudioApi`, `partStudioApi`). All calls recorded; no HTTP. |
| `fake-messaging.ts` | `FakeMessagingChannel` request/response bus + `installFakeWindowMessaging()` which stubs the `window.parent.postMessage` / `message` listener `ClientMessaging` uses. |
| `fixtures.ts` | (a) document with one Part Studio, (b) `CustomFeatureNode` with a nested `definition` map input, (c) `MathExpressionNode` with typed sockets. |
| `ui-helpers.ts` | `mountNode` (stubs rete `Ref`/`TranslateLock`/`ResizeHandle`), nested-map toggle, control typing via `value-change`, title rename via the real rename input, command dispatch, `assertSent`. |
| `__tests__/harness.test.ts` | Example tests: nested map expand, title rename, command dispatch, message assertion, dialog service, single-Part-Studio resolve, math sockets. |

A report-only harness script is at `scripts/harness-report.mjs`
(`node scripts/harness-report.mjs`): it lists harness files, counts tests,
and prints the `test:ui` command.

## What IS simulated

- Component rendering/state for `OnshapeNode.vue` / `OnshapeInputMap.vue` /
  `OnshapeInput.vue` in jsdom.
- Title rename input, nested-map expand/collapse, map value changes.
- Dialog queue (`DialogService`) via a fake host listener.
- The Onshape injection seams above (document/element/feature-studio/part-studio
  slices and the client-messaging postMessage channel).

## What is NOT simulated (out of scope)

- Real Onshape REST API, the Onshape iframe, OAuth/token refresh, CAD `postMessage`
  to the parent Onshape window (the harness fakes the message shape only).
- The full rete canvas (`editorbase.ts` / `devEditor.ts`): sockets, area plugin,
  connections, and Onshape CSS/icon assets. `mountNode` stubs rete render plumbing.
- Real control components (`QuantityControl`, `EnumControl`, ...) need Onshape
  CSS/SVG assets missing in jsdom, so control helpers drive the component's event
  surface instead of the inner input. Duck-typed DOM (title input, map header)
  is tested for real.
- Live FeatureStudio builds, evaluation, and geometry results.

## Adding a test

```ts
import { makeCustomFeatureNodeWithMap } from '../fixtures';
import { mountNode, toggleNestedMap } from '../ui-helpers';

const node = makeCustomFeatureNodeWithMap();
const { wrapper } = await mountNode(node);
expect(await toggleNestedMap(wrapper)).toBe(true);
```

Put new tests in `src/app/test-utils/__tests__/` — they are picked up only by
`vitest.ui.config.ts`, never by the default `pnpm test`.

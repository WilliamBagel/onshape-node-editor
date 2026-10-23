# Design rules

Conventions for this repo that exist because violating them has already cost
time or would produce silently wrong geometry. Each rule has an id; reference it
in code comments, reviews and issues.

Status: DR-001 is enforced socially today and should be enforced in code
(issue #18). The rest are conventions.

## DR-001 — Interactive selection via client messaging is debug-only

`ClientMessaging.requestSelection()` posts a `requestSelection` message to the
parent Onshape page and receives `SELECTION` events back. It exists so nodes can
be authored by clicking geometry in the viewport, and that is its only
legitimate use.

It must never become a product dependency, because:

1. **Selections do not survive.** A `TransientSelection` carries a
   `workspaceMicroversionId` and a `selectionId` that are invalidated by the
   next document edit. Saving one in a graph means the graph silently breaks.
2. **It only works embedded.** Opened standalone (dev server, direct URL) there
   is no parent frame and the message channel is dead.
3. **It bypasses parameter rules.** Filters (`filter`, `additionalBoxSelectFilter`),
   visibility conditions and pick limits are enforced by Onshape's own parameter
   UI; a raw selection request skips all of it and accepts geometry the feature
   would never allow.
4. **It freezes authorship-time state into generated code.** A feature should
   carry a query it can re-evaluate, not a captured selection.

Allowed: developer/debug mode, while designing a node; behind an explicit debug
marker on the node or control.
Not allowed: production node behavior, anything persisted in a saved graph as a
live selection, anything in generated FeatureScript that is not a reconstructible
query.

Preferred production alternatives: explicit `Query` inputs, `qTransient` on a
selection the node owns and re-validates, or `makeRobustQuery` when the query
must survive topology changes.

Enforcement (tracked in issue #18): warn visibly when `requestSelection` is used
outside developer mode; mark debug-only nodes in the UI; flag saved graphs that
contain live-selection dependencies on load; require justification in review.

**Review checklist:** Every PR must confirm: no new `requestSelection` calls
outside developer mode; any debug-only controls carry the DEBUG marker; graph
load (when implemented) flags selection-dependent nodes.

## DR-002 — Generated FeatureScript is generated

The Feature Studio contents produced by the app are overwritten on every
publish. No manual fixes in that file; fix the generator or the node. The
generated header already states this — keep it.

## DR-003 — API names are verified, not remembered

`onshape-typescript-fetch` names differ from intuition (`updateFeatureStudioContents`,
`addPartStudioFeature`, `evalFeatureScript`). Before using a method in code or
naming it in an issue, confirm it in the upstream generated client or Onshape's
API Explorer. A plausible-looking name costs a debugging session.

## DR-004 — One package manager

pnpm is canonical (CI pins 11.5.2, `pnpm-lock.yaml` is the lockfile). Do not
commit `package-lock.json`, do not mix installs. Node is pinned in
`package.json` engines.

## DR-005 — LF line endings

The repo has no `.gitattributes` today, which is why the working tree showed 118
modified files that were byte-identical except for CRLF. Add and keep
`* text=auto eol=lf`; do not let an editor or a GUI Git client reintroduce CRLF.

## DR-006 — Rendered math is derived; the source string is the only stored form

Math nodes display typeset output, but the expression text is the artifact.
Never serialize rendered HTML, MathML or SVG, and never read user edits back out
of rendered nodes. Store `{ source, variables }`; regenerate the typeset view from
the AST on load. Anything else makes graphs unreadable by other tools, unmergeable
in git, and unable to outlive a renderer change.

Corollary: the LaTeX/MathML emitted for display is a view concern, not a codegen
concern. FeatureScript generation reads the AST, never the rendered output.

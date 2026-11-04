# AGENTS.md — onshape-node-editor

Repo: `/home/willi/Documents/Stuff/Random Code/OnshapeNodeEditor/Repository/onshape-node-editor`
Hermes project `onshape-node-editor` (`p_351a00c1`); kanban board `default`.

This file is loaded automatically when a session runs anywhere in this repository,
including its subdirectories. A git worktree (`.worktrees/<task>`) is its own git root,
so the file must be present *there* to load — new worktrees get it with the branch.

## Hard constraints

- Never push to `master` and never rewrite the default branch. Work on `wt/<task>`
  branches; merging is the maintainer's call.
- One issue per card or task. No "while I am here" refactors.
- `tmp/` is untracked scratch: never commit anything under it, and never edit
  `tmp/HANDOFF.md` or `tmp/AGENT-TASKS.md` unless asked.
- Never run `git stash apply` or `git stash pop`.
- `docs/design-rules.md` is binding: DR-001 (client-messaging selection is debug-only),
  DR-002 (generated FeatureScript is owned by the generator), DR-003 (verify API names,
  never trust memory), DR-004 (pnpm is canonical), DR-005 (LF endings).
- Never print, commit, or write an API key or credential value into a repo file.

## Gates — run these in the tree you changed and paste the real output

```
pnpm test                      # 172 tests / 15 files expected green
pnpm run type-check:gate       # "0/0/0" = pass
pnpm run build:app && pnpm run build:server
```

A claim that "tests pass" without the pasted run is not evidence.

## Where the context lives — read by line range, never whole files

These files total ~24,000 tokens, and anything loaded early rides along in **every
later API call** of the session. Read the range you need; cite ranges in cards and
reports instead of pasting content.

- `AIREADME.md` — `:19-65` state of truth, `:66-135` commands and the type-check gate,
  `:136-197` file map / live-dead-absent / data sources, `:198-244` traps
- `docs/design-rules.md` — whole file (the design rules above are the short form)
- `tmp/HANDOFF.md` — `:347-469` the live part (what is true now, gotchas, definition of
  done); `:12-346` is the dated session log, open it only for wave history
- `tmp/AGENT-TASKS.md` — `:22-36` the verification ladder, then **only** your issue's
  section; the line index is in `tmp/HANDOFF-ORCHESTRATOR.md` under "Read order"
- `tmp/ROADMAP.md` — whole file (phase order and dependencies)

## Orchestration

`tmp/HANDOFF-ORCHESTRATOR.md` is the orchestrator's file: card shape, the verification
protocol, and `## Spawn economics` — measured token cost per spawn, the `-t <toolsets>`
rule for subprocesses, and the child-return contract. Read it before creating a card.

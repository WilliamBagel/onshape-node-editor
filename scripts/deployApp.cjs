#!/usr/bin/env node
/*
 * deployApp.cjs - publish the client app by dispatching the Pages workflow.
 *
 * Why this exists instead of `gh-pages -d dist/app`:
 *
 *   This repository's Pages site is published from a GitHub Actions ARTIFACT
 *   (the Pages settings show build_type=workflow), not from a branch. Pushing
 *   build output to a `gh-pages` branch therefore changes nothing on the live
 *   site - those files are never served. The old `deploy:app` script looked
 *   like a deploy and was a no-op.
 *
 * Why it refuses instead of always dispatching:
 *
 *   `gh workflow run --ref <branch>` resolves the ref on GitHub, not locally.
 *   So dispatching from a branch whose commits are not pushed either fails or
 *   publishes an OLDER commit than the one you are looking at - which silently
 *   regresses the live extension URL, the worst of the two outcomes. This
 *   script therefore requires HEAD == origin/<branch> before it dispatches,
 *   and says exactly what to do when it is not.
 *
 * Usage:
 *   pnpm run deploy:app
 *
 * Exit codes: 0 published (dispatched), 1 refused before dispatching.
 */

const { execFileSync } = require('node:child_process')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const WORKFLOW = 'deploy-production.yml'
const SITE = 'https://williambagel.github.io/onshape-node-editor/'

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', ...opts }).trim()
}

function tryRun(cmd, args) {
  try {
    return { ok: true, out: run(cmd, args) }
  } catch (err) {
    const out = [err.stdout, err.stderr].filter(Boolean).join('').trim()
    return { ok: false, out: out || String(err.message || err) }
  }
}

function refuse(why, fix) {
  console.error(`\nrefusing to publish: ${why}`)
  if (fix) console.error(`\n${fix}`)
  console.error('')
  process.exit(1)
}

// --- 1. Clean tree ---------------------------------------------------------
const dirty = run('git', ['status', '--porcelain'])
if (dirty) {
  refuse(
    'the working tree is dirty, so what you would publish is not what you tested.',
    `Commit or stash first. Uncommitted paths:\n${dirty}`
  )
}

// --- 2. On a branch, not a detached HEAD -----------------------------------
const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
if (branch === 'HEAD') {
  refuse('HEAD is detached; the workflow needs a branch ref.', 'Check out a branch first.')
}

// --- 3. HEAD must already be on the remote for this branch ------------------
const head = run('git', ['rev-parse', 'HEAD'])
tryRun('git', ['fetch', 'origin', branch]) // best effort; offline is fine
const remote = tryRun('git', ['rev-parse', `origin/${branch}`])

if (!remote.ok) {
  refuse(
    `branch '${branch}' does not exist on origin, and the workflow can only be dispatched against a ref that is on GitHub.`,
    `Push it, then re-run:\n  git push -u origin ${branch}\n\n` +
      'Publishing from master is the normal path: push master and the workflow runs on its own.'
  )
}

if (remote.out !== head) {
  const ahead = tryRun('git', ['rev-list', '--count', `origin/${branch}..HEAD`]).out || '?'
  const behind = tryRun('git', ['rev-list', '--count', `HEAD..origin/${branch}`]).out || '?'
  refuse(
    `origin/${branch} is at ${remote.out.slice(0, 7)} but your HEAD is ${head.slice(0, 7)} ` +
      `(${ahead} unpushed, ${behind} not pulled).`,
    'Pushing now would publish the local commit and the live site would flip to code ' +
      'nobody has reviewed; pushing nothing would publish the older remote commit. ' +
      `Pick one explicitly:\n  git push origin ${branch}      # publish ${head.slice(0, 7)}\n` +
      `  gh workflow run ${WORKFLOW} --ref ${branch}   # publish ${remote.out.slice(0, 7)}`
  )
}

// --- 4. gh must be able to see the workflow ---------------------------------
const wf = tryRun('gh', ['workflow', 'view', WORKFLOW])
if (!wf.ok) {
  refuse(
    `gh cannot read workflow ${WORKFLOW} (is gh installed and authenticated?).`,
    `Details: ${wf.out}`
  )
}

// --- 5. Dispatch, then report the run it created ----------------------------
console.log(`dispatching ${WORKFLOW} on ${branch} @ ${head.slice(0, 7)} ...`)
const dispatched = tryRun('gh', ['workflow', 'run', WORKFLOW, '--ref', branch])
if (!dispatched.ok) {
  refuse('the dispatch call failed.', dispatched.out)
}

const runUrl = tryRun('gh', [
  'run', 'list', '--workflow', WORKFLOW, '--limit', '1',
  '--json', 'url,status,headSha,createdAt',
  '--template', '{{range .}}{{.url}} {{.status}} {{.headSha}}{{end}}'
])
if (runUrl.ok && runUrl.out) {
  const [url, status, sha] = runUrl.out.split(/\s+/)
  console.log(`run:   ${url}  (${status})`)
  if (sha && sha !== head) {
    console.log(`note:  that run is on ${sha.slice(0, 7)}, not ${head.slice(0, 7)}`)
  }
} else {
  console.log('run:   dispatched; check `gh run list --workflow ' + WORKFLOW + '`')
}

console.log(`site:  ${SITE}`)
console.log('       the site URL can take a minute to serve the new artifacts;')
console.log('       the run must be green for anything to be replaced.')

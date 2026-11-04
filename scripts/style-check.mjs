// scripts/style-check.mjs — STYLE_GUIDE.md gate (issue #33).
//
// Fails (exit 1) on, in src/ UI source (.vue/.css/.scss/.ts, tests excluded):
//   1. banned hex      #1f2937 / #6b7280 / #3b82f6 (case-insensitive) — anywhere
//   2. gradients       linear-/radial-/conic-gradient() and SVG <linearGradient>/<radialGradient>
//   3. blur/glass      backdrop-filter, filter: blur(...), backdrop-blur (not JS .blur())
//   4. literal hex     #rgb/#rrggbb/#rrggbbaa outside src/app/common.css (the one palette file)
//
// Explicit allowlists (see docs/style-audit.md):
//   - vendored CSS: src/app/onshape/**, src/app/OnshapeHTMLCSSReference/** (Onshape/Bootstrap bundles)
//   - deferred (owned by concurrent cards #9/#26, do not edit here):
//       src/app/onshape-utils/featurescripttypes.ts, src/app/onshape-utils/bttypetools.ts,
//       src/app/rete/onshapesockets.ts, src/app/rete/inputoutput/**,
//       src/app/customization/controls/**, src/app/customization/OnshapeControl.vue
//   - per-rule exceptions: background.css gradients (canvas grid lines, per guide "Palette")
//
// Comments are stripped before scanning so prose mentioning a colour is not a hit.
// Hex in SVG icon references (#svg-icon-*) is not a colour and never matches.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const SRC = join(ROOT, 'src')

const BANNED_HEX = ['#1f2937', '#6b7280', '#3b82f6']
const HEX_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g
const GRADIENT_RE = /(?:linear-gradient|radial-gradient|conic-gradient)\s*\(|<linearGradient\b|<radialGradient\b/gi
const BLUR_RE = /(?:backdrop-filter\s*:|filter\s*:[^;{}]*\bblur\s*\(|backdrop-blur\b)/gi

const VENDORED = [/^src\/app\/onshape\//, /^src\/app\/OnshapeHTMLCSSReference\//]
const DEFERRED = [
  'src/app/onshape-utils/featurescripttypes.ts',
  'src/app/onshape-utils/bttypetools.ts',
  'src/app/rete/onshapesockets.ts',
  'src/app/customization/OnshapeControl.vue',
]
const DEFERRED_PREFIX = ['src/app/rete/inputoutput/', 'src/app/customization/controls/']
// file+rule exceptions: { file, rule, reason }
const EXCEPTIONS = [
  {
    file: 'src/app/customization/background.css',
    rule: 'gradient',
    reason: 'linear-gradient is the canvas grid technique named in STYLE_GUIDE.md (faint #e6e6e3 grid on #f7f7f5); not a decorative colour gradient',
  },
]

const isVendored = (f) => VENDORED.some((re) => re.test(f))
const isDeferred = (f) => DEFERRED.includes(f) || DEFERRED_PREFIX.some((p) => f.startsWith(p))
const isException = (f, rule) => EXCEPTIONS.some((e) => e.file === f && e.rule === rule)

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else if (/\.(vue|css|scss|ts)$/.test(name) && !/__tests__|\.test\.ts$/.test(name)) yield p
  }
}

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const reportOnly = process.argv.includes('--report')
let violations = []

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).replaceAll('\\', '/')
  if (isVendored(rel)) continue
  const raw = readFileSync(file, 'utf8')
  const lines = stripComments(raw).split('\n')
  const deferred = isDeferred(rel)
  lines.forEach((line, i) => {
    const where = `${rel}:${i + 1}`
    const check = (rule, hits) => {
      for (const h of hits) {
        if (isException(rel, rule)) continue
        violations.push({ rule, where, text: line.trim().slice(0, 140), deferred })
      }
    }
    const lower = line.toLowerCase()
    check('banned-hex', BANNED_HEX.filter((h) => new RegExp(h + '\\b', 'i').test(line)))
    check('gradient', [...line.matchAll(GRADIENT_RE)].map((m) => m[0]))
    check('blur', [...line.matchAll(BLUR_RE)].map((m) => m[0]))
    // Literal hex anywhere except the single palette file. Banned hex also
    // counts here, but is reported once (above) to keep counts readable.
    if (rel !== 'src/app/common.css') {
      const hexes = [...line.matchAll(HEX_RE)].map((m) => m[0]).filter((h) => !BANNED_HEX.includes(h.toLowerCase()))
      check('literal-hex', hexes)
      void lower
    }
  })
}

// Deferred files are owned by #9/#26: report them, but they do not fail the gate.
const blocking = violations.filter((v) => !v.deferred)
const deferredHits = violations.filter((v) => v.deferred)

console.log(`style-check: ${violations.length} violation(s) total, ${blocking.length} blocking, ${deferredHits.length} in deferred (#9/#26) files`)
for (const v of violations) {
  console.log(`${v.deferred ? 'DEFERRED' : 'FAIL'} [${v.rule}] ${v.where}: ${v.text}`)
}
for (const e of EXCEPTIONS) console.log(`EXCEPTION [${e.rule}] ${e.file}: ${e.reason}`)
if (reportOnly) process.exit(0)
process.exit(blocking.length ? 1 : 0)

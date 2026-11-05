#!/usr/bin/env node
/**
 * Visual-review packet generator for FREE local subagents (stealth/crouton-alpha, high).
 * Usage: node qa/review/review-packet.mjs --report <run>/report.json [--out qa/runs/<id>/review-packet.md]
 * Writes a markdown packet (outside tmp/ by default: qa/runs/<id>/) listing
 * screenshot paths, per-issue questions (alignment, clipping, typography,
 * socket/collapse geometry, z-order) and the full prompt/checklist.
 * No HTML is written. Screenshot files themselves stay in the run dir.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const argv = process.argv.slice(2);
let reportPath = null, outPath = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--report') reportPath = argv[++i];
  else if (argv[i] === '--out') outPath = argv[++i];
  else if (argv[i] === '--help' || argv[i] === '-h') { console.error('Usage: node qa/review/review-packet.mjs --report <run>/report.json [--out <packet.md>]'); process.exit(0); }
}
if (!reportPath) { console.error('Usage: node qa/review/review-packet.mjs --report <run>/report.json [--out <packet.md>]'); process.exit(2); }
let report;
try { report = JSON.parse(readFileSync(reportPath, 'utf8')); } catch (e) { console.error(`review-packet: cannot read/parse ${reportPath}: ${e.message}`); process.exit(2); }
const arr = (v) => (Array.isArray(v) ? v : []);
const runDir = path.dirname(path.resolve(reportPath));
const runId = path.basename(runDir);
if (!outPath) outPath = path.resolve(process.cwd(), 'qa', 'runs', runId, 'review-packet.md');
mkdirSync(path.dirname(outPath), { recursive: true });
const abs = (rel) => (rel ? path.join(runDir, rel) : '—');
const issues = arr(report.issues);
const perIssue = issues.map((i, k) => {
  const shot = i.annotated ?? i.screenshot;
  const exists = shot && existsSync(abs(shot)) ? 'exists' : 'MISSING';
  return [
    `### ${k + 1}. [${i.severity ?? '?'}] ${i.title ?? '(untitled)'} (${i.area ?? '?'}/${i.category ?? '?'})`,
    ``,
    `- Description: ${i.description ?? '—'}`,
    `- Expected: ${i.expected ?? '—'}`,
    `- Actual: ${i.actual ?? '—'}`,
    `- Screenshot: \`${shot ?? '—'}\` (${exists}) — absolute: \`${abs(shot)}\``,
    `- BBox: ${i.bbox ? `x=${i.bbox.x} y=${i.bbox.y} w=${i.bbox.width} h=${i.bbox.height}` : '—'}`,
    `- Questions:`,
    `  1. Alignment: is the flagged element aligned with neighbouring chrome (toolbar/node header/socket row) or offset/clipped?`,
    `  2. Clipping/overflow: is any text or socket cut off at the node, panel, or viewport edge?`,
    `  3. Typography: does the label use the expected size/weight and remain legible at this zoom?`,
    `  4. Socket/collapse geometry: are sockets centred on the node edge, and does the collapse chevron sit inside the header without overlapping the title?`,
    `  5. Z-order: does anything overlap that should stack behind (menus, tooltips, connection lines, selection highlight)?`,
    `  6. Palette: does it match STYLE_GUIDE.md (#f7f7f5 / #1a1a1a / #2f5f8f / #b4443c, hairline, radius <= 6px)?`,
    ...(arr(i.console).length ? [`- Console: ${arr(i.console).map((c) => String(c?.message ?? c)).join(' | ')}`] : []),
    ``,
  ].join('\n');
}).join('\n');
let prompt = '';
try { prompt = readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'visual-review-prompt.md'), 'utf8'); } catch {}
const packet = `# Visual review packet — run ${runId}\n\n- Report: \`${path.resolve(reportPath)}\`\n- URL: ${report.url ?? '—'}\n- Generated: ${report.generatedAt ?? '—'}\n- Issues: ${issues.length}\n- Screenshots: \`${path.join(runDir, 'screenshots')}\` and \`${path.join(runDir, 'annotated')}\`\n\n## Issues\n\n${perIssue || 'No issues in this run.'}\n\n## Prompt for free local subagent (stealth/crouton-alpha, high)\n\nRun this packet with a free subagent (vision-capable, high effort), e.g.:\n\n\`\`\`sh\n# list screenshots\nd ls ${runDir}/screenshots/issues ${runDir}/annotated\n# hand the subagent this packet + the PNG paths above; ask it to answer\n# every numbered question per issue and return a verdict per issue:\n#   confirmed / not-reproduced / unclear, with pixel-level evidence.\n\`\`\`\n\n${prompt}\n`;
writeFileSync(outPath, packet);
console.log(`review-packet: wrote ${outPath} (${issues.length} issue(s), screenshots in ${runDir})`);

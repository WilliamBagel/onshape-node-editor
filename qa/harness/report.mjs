#!/usr/bin/env node
/**
 * Markdown reporter for a UI-explorer report (schemaVersion 1).
 * Usage: node qa/harness/report.mjs --report <run>/report.json --out <dir>
 * Writes <out>/report.md only. No HTML is generated (tmp/ holds no HTML);
 * the visual dashboard is the Vite app in qa/dashboard loading report.json.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const argv = process.argv.slice(2);
let reportPath = null, outDir = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--report') reportPath = argv[++i];
  else if (argv[i] === '--out') outDir = argv[++i];
  else if (argv[i] === '--help' || argv[i] === '-h') { console.error('Usage: node qa/harness/report.mjs --report <run>/report.json --out <dir>'); process.exit(0); }
}
if (!reportPath || !outDir) { console.error('Usage: node qa/harness/report.mjs --report <run>/report.json --out <dir>'); process.exit(2); }
let report;
try { report = JSON.parse(readFileSync(reportPath, 'utf8')); } catch (e) { console.error(`report: cannot read/parse ${reportPath}: ${e.message}`); process.exit(2); }
if (!report || typeof report !== 'object') { console.error('report: not a JSON object'); process.exit(2); }
if (report.schemaVersion !== undefined && report.schemaVersion !== 1) console.warn(`report: warning: schemaVersion ${report.schemaVersion} !== 1; rendering best-effort`);
mkdirSync(outDir, { recursive: true });
const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const SEVS = ['critical', 'high', 'medium', 'low'];
const issues = [...arr(report.issues)].sort((a, b) => (SEV_RANK[a.severity] ?? 4) - (SEV_RANK[b.severity] ?? 4) || String(a.area ?? '').localeCompare(String(b.area ?? '')) || String(a.title ?? '').localeCompare(String(b.title ?? '')));
const summary = report.summary && typeof report.summary === 'object' ? report.summary : {};
const counts = {}; for (const s of SEVS) counts[s] = summary[s] !== undefined ? num(summary[s]) : issues.filter((i) => i.severity === s).length;
const totalIssues = summary.issues !== undefined ? num(summary.issues) : issues.length;
const task = report.task && typeof report.task === 'object' ? report.task : null;
const dur = report.durationMs ? `${(num(report.durationMs) / 1000).toFixed(1)}s` : '—';
const mdIssues = issues.map((i, k) => [
  `## ${k + 1}. [${i.severity ?? '?'}] ${i.title ?? '(untitled)'} (${i.area ?? '?'}/${i.category ?? '?'})`, '',
  i.description ?? '',
  `- Expected: ${i.expected ?? '—'}`, `- Actual: ${i.actual ?? '—'}`,
  `- Screenshot: ${i.screenshot ?? '—'}${i.annotated ? ` (annotated: ${i.annotated})` : ''}`,
  ...(i.bbox ? [`- BBox: x=${i.bbox.x} y=${i.bbox.y} w=${i.bbox.width} h=${i.bbox.height}`] : []),
  ...(arr(i.steps).length ? ['', 'Reproduction:', ...arr(i.steps).map((s, j) => `${j + 1}. ${s}`)] : []),
  ...(arr(i.console).length ? ['', 'Console:', '```', ...arr(i.console).map((c) => String(c?.message ?? c)), '```'] : []),
  ...(i.suggestion ? ['', `**Suggested fix:** ${i.suggestion}`] : []),
].join('\n')).join('\n\n');
const md = `# UI explorer report\n\n- URL: ${report.url ?? '—'}\n- Generated: ${report.generatedAt ?? '—'}\n- Duration: ${dur}\n- Issues: ${totalIssues} (critical ${counts.critical}, high ${counts.high}, medium ${counts.medium}, low ${counts.low})\n- Actions: ${num(summary.actions, arr(report.actions).length)}\n- Task: ${task ? `${task.name ?? task.id ?? ''} — ${task.status ?? ''}${task.error ? ` (${task.error})` : ''}` : 'none'}\n${task ? `\nTask steps:\n${arr(task.steps).map((s) => `- [${s.status ?? 'skipped'}] ${s.label ?? ''}${s.detail ? ` — ${s.detail}` : ''}`).join('\n') || '- (none)'}` : ''}\n\n${mdIssues || 'No issues found.'}\n`;
writeFileSync(path.join(outDir, 'report.md'), md);
console.log(`report: wrote ${path.join(outDir, 'report.md')} (${issues.length} issue(s))`);

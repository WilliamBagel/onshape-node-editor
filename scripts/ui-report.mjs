#!/usr/bin/env node
/**
 * Static UI-explorer dashboard + Markdown reporter.
 *
 * Usage:
 *   node scripts/ui-report.mjs --report <out>/report.json --out <out>
 *
 * Reads a schemaVersion 1 report (see docs/ui-explorer.md) and writes
 * <out>/dashboard.html (single self-contained file, works from file://)
 * and <out>/report.md. No dependencies, no template library; every
 * report string is HTML-escaped before interpolation (XSS-safe).
 *
 * Edge cases tolerated: missing/optional fields (task, summary, console,
 * bbox, screenshots) are rendered as placeholders; unknown severities
 * sort after known ones; a missing schemaVersion is still rendered.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const SEVS = ['critical', 'high', 'medium', 'low'];

/* ---------- CLI ---------- */
function usage() {
  console.error('Usage: node scripts/ui-report.mjs --report <out>/report.json --out <out>');
}
const argv = process.argv.slice(2);
let reportPath = null, outDir = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--report') reportPath = argv[++i];
  else if (argv[i] === '--out') outDir = argv[++i];
  else if (argv[i] === '--help' || argv[i] === '-h') { usage(); process.exit(0); }
}
if (!reportPath || !outDir) { usage(); process.exit(2); }

let report;
try {
  report = JSON.parse(readFileSync(reportPath, 'utf8'));
} catch (e) {
  console.error(`ui-report: cannot read/parse report ${reportPath}: ${e.message}`);
  process.exit(2);
}
if (!report || typeof report !== 'object') {
  console.error('ui-report: report is not a JSON object');
  process.exit(2);
}
if (report.schemaVersion !== undefined && report.schemaVersion !== 1) {
  console.warn(`ui-report: warning: schemaVersion ${report.schemaVersion} !== 1; rendering best-effort`);
}
mkdirSync(outDir, { recursive: true });
const reportDir = path.dirname(path.resolve(reportPath));

/* ---------- helpers ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const existsRel = (rel) => { try { return !!rel && existsSync(path.join(reportDir, rel)); } catch { return false; } };
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
function dataUri(rel) {
  try {
    const abs = path.join(reportDir, rel);
    const mime = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
    return `data:${mime};base64,${readFileSync(abs).toString('base64')}`;
  } catch {
    return null;
  }
}
const sevRank = (s) => (s in SEV_RANK ? SEV_RANK[s] : 4);
const sortedIssues = () => [...arr(report.issues)].sort((a, b) =>
  sevRank(a.severity) - sevRank(b.severity) ||
  String(a.area ?? '').localeCompare(String(b.area ?? '')) ||
  String(a.title ?? '').localeCompare(String(b.title ?? '')));

const issues = sortedIssues();
const summary = report.summary && typeof report.summary === 'object' ? report.summary : {};
const counts = {};
for (const s of SEVS) counts[s] = summary[s] !== undefined ? num(summary[s]) : issues.filter((i) => i.severity === s).length;
const totalIssues = summary.issues !== undefined ? num(summary.issues) : issues.length;
const cats = [...new Set(issues.map((i) => i.category).filter(Boolean))].sort();
const task = report.task && typeof report.task === 'object' ? report.task : null;

/* ---------- dashboard.html ---------- */
function imgTag(issue) {
  const annotated = existsRel(issue.annotated) ? issue.annotated : null;
  const shot = existsRel(issue.screenshot) ? issue.screenshot : null;
  const src = annotated ?? shot;
  const alt = annotated ? `Annotated screenshot for ${issue.title ?? 'issue'}` : `Screenshot for ${issue.title ?? 'issue'}`;
  if (!src) return `<div class="img-placeholder" aria-label="Screenshot not available">Screenshot not available</div>`;
  const embedded = dataUri(src);
  if (!embedded) return `<div class="img-placeholder" aria-label="Screenshot not available">Screenshot not available</div>`;
  const label = annotated ? 'Annotated' : 'Screenshot';
  return `<figure class="shot"><img decoding="async" src="${embedded}" alt="${esc(alt)}"><figcaption>${esc(label)}</figcaption></figure>`;
}
function consoleBlock(issue) {
  const lines = arr(issue.console).map((c) => (typeof c === 'string' ? c : c?.message ?? c?.text ?? JSON.stringify(c))).filter(Boolean);
  if (!lines.length) return '';
  return `<details class="console"><summary>Console output (${lines.length})</summary><pre>${esc(lines.join('\n'))}</pre></details>`;
}
function searchText(issue) {
  const consoleLines = arr(issue.console).map((c) => (typeof c === 'string' ? c : c?.message ?? c?.text ?? JSON.stringify(c))).filter(Boolean);
  return [issue.title, issue.description, issue.area, issue.category, issue.expected, issue.actual, issue.suggestion, ...consoleLines].filter(Boolean).join(' ');
}
function issueCard(issue) {
  const steps = arr(issue.steps).map((s, k) => `<li>${esc(s)}</li>`).join('');
  const badges = [issue.severity, issue.category, issue.area].filter(Boolean)
    .map((b) => `<span class="badge sev-${esc(b)}">${esc(b)}</span>`).join('');
  return `<article class="card" data-severity="${esc(issue.severity ?? '')}" data-category="${esc(issue.category ?? '')}" data-search="${esc(searchText(issue).toLowerCase())}">
    ${imgTag(issue)}
    <div class="card-body">
      <h3>${esc(issue.title ?? '(untitled issue)')}</h3>
      <div class="badges">${badges}<span class="badge">${esc(issue.id ?? '')}</span></div>
      ${issue.description ? `<p class="desc">${esc(issue.description)}</p>` : ''}
      <dl class="ea">
        <div><dt>Expected</dt><dd>${esc(issue.expected || '—')}</dd></div>
        <div><dt>Actual</dt><dd>${esc(issue.actual || '—')}</dd></div>
      </dl>
      ${steps ? `<h4>Reproduction steps</h4><ol>${steps}</ol>` : ''}
      ${consoleBlock(issue)}
      ${issue.suggestion ? `<p class="suggestion"><strong>Suggested fix:</strong> ${esc(issue.suggestion)}</p>` : ''}
    </div>
  </article>`;
}

function taskSection() {
  if (!task) return `<section class="task"><h2>Task</h2><p class="muted">No task was requested for this run.</p></section>`;
  const rows = arr(task.steps).map((s) =>
    `<tr><td>${esc(s.label ?? '')}</td><td><span class="status status-${esc(s.status ?? 'skipped')}">${esc(s.status ?? 'skipped')}</span></td><td>${esc(s.detail ?? '')}</td></tr>`).join('');
  return `<section class="task">
    <h2>Task: ${esc(task.name ?? task.id ?? 'Task')} <span class="status status-${esc(task.status ?? 'skipped')}">${esc(task.status ?? 'skipped')}</span></h2>
    ${task.error ? `<p class="error">${esc(task.error)}</p>` : ''}
    ${rows ? `<table><thead><tr><th>Step</th><th>Status</th><th>Detail</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted">No steps recorded.</p>'}
  </section>`;
}

function chipGroup(name, values, active) {
  return values.map((v) => `<button type="button" class="chip${v === active ? ' on' : ''}" data-filter-group="${name}" data-filter-value="${esc(v)}" aria-pressed="${v === active}">${v === 'all' ? 'All' : esc(v)}</button>`).join('');
}

const filtersHtml = `<div class="filters">
  <div class="group"><span>Severity</span>${chipGroup('severity', ['all', ...SEVS], 'all')}</div>
  ${cats.length ? `<div class="group"><span>Category</span>${chipGroup('category', ['all', ...cats], 'all')}</div>` : ''}
  <label class="search">Search <span class="search-wrap"><input id="q" type="search" placeholder="Filter issues…" autocomplete="off" aria-label="Search issues"><button type="button" id="clear-q" class="clear-q" aria-label="Clear search" hidden>×</button></span></label>
  <span id="result-count" class="result-count" aria-live="polite">Showing ${issues.length} of ${issues.length} issues</span>
  <button type="button" class="chip" id="clear-all">Clear all</button>
</div>`;
const dur = report.durationMs ? `${(num(report.durationMs) / 1000).toFixed(1)}s` : '—';
const dashboard = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>UI explorer report — ${esc(report.url ?? '')}</title><style>
:root{--bg:#f7f7f5;--paper:#fbfbf9;--card:#ffffff;--ink:#1a1a1a;--ink2:#5a5a55;--line:#d9d9d4;--accent:#2f5f8f;--err:#b4443c;--teal:#2a8f82}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:13px/1.35 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1180px;margin:0 auto;padding:20px 16px 40px}
h1{font-size:20px;line-height:1.2;margin:0 0 4px}h2{font-size:14px;margin:28px 0 8px}h3{font-size:14px;line-height:1.2;margin:0 0 6px}h4{font-size:12px;margin:12px 0 4px}
.meta{color:var(--ink2);font-size:12px;word-break:break-all}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:16px 0}
.card-stat{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:10px 12px}
.card-stat b{display:block;font-size:22px;line-height:1.1}.card-stat span{font-size:11px;color:var(--ink2)}
.legend,.filters{background:var(--paper);border:1px solid var(--line);border-radius:6px;padding:10px 12px;margin:12px 0}
.legend{font-size:12px}.legend b{font-size:12px}
.filters{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center}
.filters .group{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.filters .group>span{font-size:11px;color:var(--ink2)}
.chip{font:inherit;font-size:12px;background:var(--card);border:1px solid var(--line);border-radius:6px;padding:6px 10px;cursor:pointer;min-height:28px}
.chip.on{background:var(--accent);border-color:var(--accent);color:#fff}
.chip:focus-visible,.search input:focus-visible,.clear-q:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.search{margin-left:auto;font-size:12px;display:flex;gap:6px;align-items:center}
.search-wrap{position:relative;display:inline-flex;align-items:center}
.search input{font:inherit;font-size:13px;padding:6px 32px 6px 8px;border:1px solid var(--line);border-radius:6px;background:#fff;min-width:200px;min-height:28px}
.clear-q{position:absolute;right:2px;top:50%;transform:translateY(-50%);min-height:28px;min-width:28px;line-height:1;font-size:16px;background:transparent;border:none;color:var(--ink2);cursor:pointer;border-radius:4px}
.result-count{font-size:12px;color:var(--ink2);min-width:140px}
.issue-list{display:grid;gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:6px;display:grid;grid-template-columns:minmax(240px,340px) 1fr;gap:16px;padding:14px}
.shot{margin:0}.shot img{width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:4px}
.shot figcaption{font-size:11px;color:var(--ink2);margin-top:4px;word-break:break-all}
.img-placeholder{border:1px dashed var(--line);border-radius:4px;color:var(--ink2);font-size:12px;padding:28px 12px;text-align:center}
.badges{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.badge{font-size:11px;border:1px solid var(--line);border-radius:4px;padding:1px 7px;background:var(--paper)}
.sev-critical,.sev-high{color:var(--err);border-color:var(--err);font-weight:600}
.sev-medium{color:#8a5a13}.sev-low{color:var(--ink2)}
.desc{margin:0 0 8px}.ea{margin:0}.ea div{display:grid;grid-template-columns:80px 1fr;gap:8px;margin:4px 0}
.ea dt{font-size:12px;font-weight:600}.ea dd{margin:0}
ol{margin:4px 0;padding-left:22px}ol li{margin:2px 0}
.console{margin-top:10px}.console pre{font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;word-break:break-word;background:var(--paper);border:1px solid var(--line);border-radius:4px;padding:8px;max-height:240px;overflow:auto}
.suggestion{border-left:3px solid var(--accent);background:var(--paper);padding:8px 10px;border-radius:0 4px 4px 0;margin:12px 0 0}
.error{color:var(--err);font-weight:600}
.muted{color:var(--ink2)}
table{width:100%;border-collapse:collapse;background:var(--card)}th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}th{font-size:12px}
.status{font-size:11px;border:1px solid var(--line);border-radius:4px;padding:1px 7px}
.status-passed{color:var(--teal);border-color:var(--teal)}.status-failed{color:var(--err);border-color:var(--err);font-weight:600}
.empty{border:1px dashed var(--line);border-radius:6px;padding:28px;text-align:center;color:var(--ink2);background:var(--card)}
.empty p{margin:0 0 12px}
@media (max-width:1000px){.card{grid-template-columns:1fr}.search{margin-left:0;width:100%}}
@media print{body{background:#fff}main{max-width:none}.chip{display:none}.clear-q{display:none}.card{break-inside:avoid}}
</style></head><body><main>
<header><h1>UI explorer report</h1>
<p class="meta">URL: ${esc(report.url ?? '—')}<br>Generated: ${esc(report.generatedAt ?? '—')} &middot; Duration: ${esc(dur)}</p></header>
<section class="cards" aria-label="Summary">
<div class="card-stat"><b>${totalIssues}</b><span>Total issues</span></div>
${SEVS.map((s) => `<div class="card-stat"><b>${counts[s]}</b><span>${s[0].toUpperCase() + s.slice(1)}</span></div>`).join('')}
<div class="card-stat"><b>${num(summary.actions, arr(report.actions).length)}</b><span>Actions</span></div>
<div class="card-stat"><b>${esc(task?.status ?? 'none')}</b><span>Task status</span></div>
</section>
<section class="legend"><b>How to read this:</b> issues are sorted critical → low, then area and title. “Annotated” means the red-box screenshot from <code>annotate-ui-shots.py</code>; otherwise the raw screenshot is shown. “Suggested fix” is written for users, not developers. Use the filters/search above to narrow the list.</section>
${filtersHtml}
${issues.length ? `<section class="issue-list" id="issues">${issues.map(issueCard).join('')}</section><div class="empty" id="no-match" hidden><p>No issues match the current filters.</p><button type="button" class="chip" id="clear-filters">Clear filters</button></div>` : `<p class="empty">No issues found in this run. 🎉</p>`}
${taskSection()}
</main><script>
const cards=[...document.querySelectorAll('.card[data-severity]')];
const total=cards.length;
const state={severity:'all',category:'all',q:''};
const qEl=document.getElementById('q');
const clearQ=document.getElementById('clear-q');
const resultCount=document.getElementById('result-count');
function syncChips(){document.querySelectorAll('[data-filter-group]').forEach(function(b){var on=state[b.dataset.filterGroup]===b.dataset.filterValue;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));});}
function apply(){var shown=0;for(var i=0;i<cards.length;i++){var c=cards[i];var ok=(state.severity==='all'||c.dataset.severity===state.severity)&&(state.category==='all'||c.dataset.category===state.category)&&(!state.q||(c.dataset.search||'').indexOf(state.q)!==-1);c.hidden=!ok;if(ok)shown++;}if(resultCount)resultCount.textContent='Showing '+shown+' of '+total+' issues';var nm=document.getElementById('no-match');if(nm)nm.hidden=shown>0;syncChips();if(clearQ)clearQ.hidden=!qEl.value;}
function clearAll(){state.severity='all';state.category='all';state.q='';qEl.value='';apply();}
document.querySelectorAll('[data-filter-group]').forEach(function(b){b.addEventListener('click',function(){var g=b.dataset.filterGroup;var v=b.dataset.filterValue;state[g]=(state[g]===v&&v!=='all')?'all':v;apply();});});
qEl.addEventListener('input',function(){state.q=qEl.value.trim().toLowerCase();apply();});
qEl.addEventListener('keydown',function(e){if(e.key==='Escape'){qEl.value='';state.q='';apply();qEl.focus();}});
if(clearQ)clearQ.addEventListener('click',function(){qEl.value='';state.q='';apply();qEl.focus();});
var clearAllEl=document.getElementById('clear-all');if(clearAllEl)clearAllEl.addEventListener('click',clearAll);
var clearFiltersEl=document.getElementById('clear-filters');if(clearFiltersEl)clearFiltersEl.addEventListener('click',clearAll);
apply();
</script></body></html>\n`;
writeFileSync(path.join(outDir, 'dashboard.html'), dashboard);

/* ---------- report.md ---------- */
const mdIssues = issues.map((i, k) => [
  `## ${k + 1}. [${i.severity ?? '?'}] ${i.title ?? '(untitled)'} (${i.area ?? '?'}/${i.category ?? '?'})`,
  ``,
  i.description ?? '',
  `- Expected: ${i.expected ?? '—'}`,
  `- Actual: ${i.actual ?? '—'}`,
  `- Screenshot: ${i.screenshot ?? '—'}${i.annotated ? ` (annotated: ${i.annotated})` : ''}`,
  ...(i.bbox ? [`- BBox: x=${i.bbox.x} y=${i.bbox.y} w=${i.bbox.width} h=${i.bbox.height}`] : []),
  ...(arr(i.steps).length ? ['', 'Reproduction:', ...arr(i.steps).map((s, j) => `${j + 1}. ${s}`)] : []),
  ...(arr(i.console).length ? ['', 'Console:', '```', ...arr(i.console).map((c) => String(c?.message ?? c)), '```'] : []),
  ...(i.suggestion ? ['', `**Suggested fix:** ${i.suggestion}`] : []),
].join('\n')).join('\n\n');
const md = `# UI explorer report

- URL: ${report.url ?? '—'}
- Generated: ${report.generatedAt ?? '—'}
- Duration: ${dur}
- Issues: ${totalIssues} (critical ${counts.critical}, high ${counts.high}, medium ${counts.medium}, low ${counts.low})
- Actions: ${num(summary.actions, arr(report.actions).length)}
- Task: ${task ? `${task.name ?? task.id ?? ''} — ${task.status ?? ''}${task.error ? ` (${task.error})` : ''}` : 'none'}
${task ? `\nTask steps:\n${arr(task.steps).map((s) => `- [${s.status ?? 'skipped'}] ${s.label ?? ''}${s.detail ? ` — ${s.detail}` : ''}`).join('\n') || '- (none)'}` : ''}

${mdIssues || 'No issues found.'}
`;
writeFileSync(path.join(outDir, 'report.md'), md);
console.log(`ui-report: wrote ${path.join(outDir, 'dashboard.html')} and ${path.join(outDir, 'report.md')} (${issues.length} issue(s))`);

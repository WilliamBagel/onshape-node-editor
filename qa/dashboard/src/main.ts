import './styles.css';

type Issue = Record<string, any>;
type Report = Record<string, any>;

const SEVS = ['critical', 'high', 'medium', 'low'];
const SEV_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const arr = (v: any): any[] => (Array.isArray(v) ? v : []);
const num = (v: any, d = 0): number => (Number.isFinite(Number(v)) ? Number(v) : d);
const esc = (s: any): string => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

function reportUrls(): string[] {
  const q = new URLSearchParams(location.search);
  const urls: string[] = [];
  const explicit = q.get('report') || q.get('data');
  if (explicit) urls.push(explicit);
  urls.push('data/report.json', './data/report.json', '/onshape-node-editor/qa/data/report.json', 'report.json');
  return [...new Set(urls)];
}
function resolveRel(reportUrl: string, rel: string): string {
  try { return new URL(rel, reportUrl).href; } catch { return rel; }
}

async function loadReport(): Promise<{ report: Report; url: string }> {
  let lastErr: unknown = null;
  for (const u of reportUrls()) {
    try {
      const r = await fetch(u, { cache: 'no-store' });
      if (!r.ok) { lastErr = new Error(`${u} -> ${r.status}`); continue; }
      const report = (await r.json()) as Report;
      if (report && typeof report === 'object') return { report, url: new URL(u, location.href).href };
    } catch (e) { lastErr = e; }
  }
  throw lastErr instanceof Error ? lastErr : new Error('no report found');
}

function searchText(issue: Issue): string {
  const lines = arr(issue.console).map((c: any) => (typeof c === 'string' ? c : c?.message ?? c?.text ?? JSON.stringify(c))).filter(Boolean);
  return [issue.title, issue.description, issue.area, issue.category, issue.expected, issue.actual, issue.suggestion, ...lines].filter(Boolean).join(' ');
}

function main(): void {
  const app = document.getElementById('app')!;
  loadReport().then(({ report, url: reportUrl }) => {
    if (report.schemaVersion !== undefined && report.schemaVersion !== 1) console.warn(`schemaVersion ${report.schemaVersion} !== 1; rendering best-effort`);
    const issues: Issue[] = [...arr(report.issues)].sort((a, b) =>
      (SEV_RANK[a.severity] ?? 4) - (SEV_RANK[b.severity] ?? 4) ||
      String(a.area ?? '').localeCompare(String(b.area ?? '')) ||
      String(a.title ?? '').localeCompare(String(b.title ?? '')));
    const summary = report.summary && typeof report.summary === 'object' ? report.summary : {};
    const counts: Record<string, number> = {};
    for (const s of SEVS) counts[s] = summary[s] !== undefined ? num(summary[s]) : issues.filter((i) => i.severity === s).length;
    const totalIssues = summary.issues !== undefined ? num(summary.issues) : issues.length;
    const cats: string[] = [...new Set(issues.map((i) => i.category).filter(Boolean))].sort();
    const task = report.task && typeof report.task === 'object' ? report.task : null;
    const dur = report.durationMs ? `${(num(report.durationMs) / 1000).toFixed(1)}s` : '—';

    const imgTag = (issue: Issue): string => {
      const src = issue.annotated ?? issue.screenshot;
      if (!src) return `<div class="img-placeholder" aria-label="Screenshot not available">Screenshot not available</div>`;
      const label = issue.annotated ? 'Annotated' : 'Screenshot';
      return `<figure class="shot"><img decoding="async" src="${esc(resolveRel(reportUrl, src))}" alt="${esc(`${label} for ${issue.title ?? 'issue'}`)}"><figcaption>${esc(label)}</figcaption></figure>`;
    };
    const consoleBlock = (issue: Issue): string => {
      const lines = arr(issue.console).map((c: any) => (typeof c === 'string' ? c : c?.message ?? c?.text ?? JSON.stringify(c))).filter(Boolean);
      return lines.length ? `<details class="console"><summary>Console output (${lines.length})</summary><pre>${esc(lines.join('\n'))}</pre></details>` : '';
    };
    const issueCard = (issue: Issue): string => {
      const steps = arr(issue.steps).map((s: any) => `<li>${esc(s)}</li>`).join('');
      const badges = [issue.severity, issue.category, issue.area].filter(Boolean).map((b: any) => `<span class="badge sev-${esc(b)}">${esc(b)}</span>`).join('');
      return `<article class="card" data-severity="${esc(issue.severity ?? '')}" data-category="${esc(issue.category ?? '')}" data-search="${esc(searchText(issue).toLowerCase())}">
        ${imgTag(issue)}<div class="card-body"><h3>${esc(issue.title ?? '(untitled issue)')}</h3>
        <div class="badges">${badges}<span class="badge">${esc(issue.id ?? '')}</span></div>
        ${issue.description ? `<p class="desc">${esc(issue.description)}</p>` : ''}
        <dl class="ea"><div><dt>Expected</dt><dd>${esc(issue.expected || '—')}</dd></div><div><dt>Actual</dt><dd>${esc(issue.actual || '—')}</dd></div></dl>
        ${steps ? `<h4>Reproduction steps</h4><ol>${steps}</ol>` : ''}${consoleBlock(issue)}
        ${issue.suggestion ? `<p class="suggestion"><strong>Suggested fix:</strong> ${esc(issue.suggestion)}</p>` : ''}</div></article>`;
    };
    const taskSection = (): string => {
      if (!task) return `<section class="task"><h2>Task</h2><p class="muted">No task was requested for this run.</p></section>`;
      const rows = arr(task.steps).map((s: any) => `<tr><td>${esc(s.label ?? '')}</td><td><span class="status status-${esc(s.status ?? 'skipped')}">${esc(s.status ?? 'skipped')}</span></td><td>${esc(s.detail ?? '')}</td></tr>`).join('');
      return `<section class="task"><h2>Task: ${esc(task.name ?? task.id ?? 'Task')} <span class="status status-${esc(task.status ?? 'skipped')}">${esc(task.status ?? 'skipped')}</span></h2>${task.error ? `<p class="error">${esc(task.error)}</p>` : ''}${rows ? `<table><thead><tr><th>Step</th><th>Status</th><th>Detail</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted">No steps recorded.</p>'}</section>`;
    };
    // Activity / agent timeline: what the explorer did, in order. Thumbnail is
    // the action screenshot; broken images degrade to a placeholder.
    const timelineSection = (): string => {
      const items = arr(report.actions);
      if (!items.length) return `<section class="timeline"><h2>Activity timeline</h2><p class="muted">No actions were recorded for this run.</p></section>`;
      const rows = items.map((a: any) => {
        const src = a.screenshot;
        const thumb = src
          ? `<figure class="tl-shot"><img decoding="async" loading="lazy" src="${esc(resolveRel(reportUrl, src))}" alt="Screenshot for ${esc(a.id ?? 'action')}"><figcaption>${esc(src)}</figcaption></figure>`
          : `<div class="img-placeholder" aria-label="Screenshot not available">Screenshot not available</div>`;
        return `<article class="tl-row" data-search="${esc([a.id, a.name, a.area, a.status].filter(Boolean).join(' ').toLowerCase())}">
          ${thumb}
          <div class="tl-body"><div class="badges"><span class="badge">${esc(a.id ?? '')}</span><span class="badge">${esc(a.area ?? '')}</span><span class="badge status-${esc(a.status ?? 'skipped')}">${esc(a.status ?? '')}</span></div>
          <h3>${esc(a.name ?? '(action)')}</h3>
          <p class="meta">Duration: ${a.durationMs != null ? `${(num(a.durationMs) / 1000).toFixed(1)}s` : '—'} &middot; Changed: ${a.changed ? 'yes' : 'no'}</p>
          ${a.error ? `<p class="error">${esc(a.error)}</p>` : ''}
          </div></article>`;
      }).join('');
      return `<section class="timeline"><h2>Activity timeline — what the agent did (${items.length} action${items.length === 1 ? '' : 's'}, in order)</h2><div class="timeline-list">${rows}</div></section>`;
    };
    const chipGroup = (name: string, values: string[]): string =>
      values.map((v) => `<button type="button" class="chip${v === 'all' ? ' on' : ''}" data-filter-group="${name}" data-filter-value="${esc(v)}" aria-pressed="${v === 'all'}">${v === 'all' ? 'All' : esc(v)}</button>`).join('');

    app.innerHTML = `<header><h1>UI explorer report</h1><p class="meta">URL: ${esc(report.url ?? '—')}<br>Generated: ${esc(report.generatedAt ?? '—')} &middot; Duration: ${esc(dur)} &middot; Report: ${esc(reportUrl)}</p></header>
    <section class="cards" aria-label="Summary"><div class="card-stat"><b>${totalIssues}</b><span>Total issues</span></div>${SEVS.map((s) => `<div class="card-stat"><b>${counts[s]}</b><span>${s[0].toUpperCase() + s.slice(1)}</span></div>`).join('')}<div class="card-stat"><b>${num(summary.actions, arr(report.actions).length)}</b><span>Actions</span></div><div class="card-stat"><b>${esc(task?.status ?? 'none')}</b><span>Task status</span></div></section>
    <section class="legend"><b>How to read this:</b> issues are sorted critical → low, then area and title. “Annotated” means the red-box screenshot; otherwise the raw screenshot is shown. Use the filters/search above to narrow the list. Report loaded from <code>${esc(reportUrl)}</code> (override with <code>?report=&lt;url&gt;</code>).</section>
    <div class="filters"><div class="group"><span>Severity</span>${chipGroup('severity', ['all', ...SEVS])}</div>${cats.length ? `<div class="group"><span>Category</span>${chipGroup('category', ['all', ...cats])}</div>` : ''}<label class="search">Search <span class="search-wrap"><input id="q" type="search" placeholder="Filter issues…" autocomplete="off" aria-label="Search issues"><button type="button" id="clear-q" class="clear-q" aria-label="Clear search" hidden>×</button></span></label><span id="result-count" class="result-count" aria-live="polite">Showing ${issues.length} of ${issues.length} issues</span><button type="button" class="chip" id="clear-all">Clear all</button></div>
    ${issues.length ? `<section class="issue-list" id="issues">${issues.map(issueCard).join('')}</section><div class="empty" id="no-match" hidden><p>No issues match the current filters.</p><button type="button" class="chip" id="clear-filters">Clear filters</button></div>` : `<p class="empty">No issues found in this run. 🎉</p>`}
    ${timelineSection()}
    ${taskSection()}`;

    // Broken images degrade to the placeholder (no broken-image icon).
    app.querySelectorAll('.card img, .tl-shot img').forEach((img) => {
      img.addEventListener('error', () => {
        const ph = document.createElement('div');
        ph.className = 'img-placeholder'; ph.setAttribute('aria-label', 'Screenshot not available'); ph.textContent = 'Screenshot not available';
        img.replaceWith(ph);
      });
    });

    const cards = [...app.querySelectorAll<HTMLElement>('.card[data-severity]')];
    const total = cards.length;
    const state = { severity: 'all', category: 'all', q: '' };
    const qEl = app.querySelector<HTMLInputElement>('#q')!;
    const clearQ = app.querySelector<HTMLButtonElement>('#clear-q')!;
    const resultCount = app.querySelector<HTMLElement>('#result-count')!;
    const syncChips = () => app.querySelectorAll('[data-filter-group]').forEach((b) => {
      const el = b as HTMLElement; const on = (state as any)[el.dataset.filterGroup!] === el.dataset.filterValue;
      el.classList.toggle('on', on); el.setAttribute('aria-pressed', String(on));
    });
    const apply = () => {
      let shown = 0;
      for (const c of cards) {
        const ok = (state.severity === 'all' || c.dataset.severity === state.severity) &&
          (state.category === 'all' || c.dataset.category === state.category) &&
          (!state.q || (c.dataset.search || '').includes(state.q));
        c.hidden = !ok; if (ok) shown++;
      }
      resultCount.textContent = `Showing ${shown} of ${total} issues`;
      const nm = app.querySelector<HTMLElement>('#no-match'); if (nm) nm.hidden = shown > 0;
      syncChips(); if (clearQ) clearQ.hidden = !qEl.value;
    };
    const clearAll = () => { state.severity = 'all'; state.category = 'all'; state.q = ''; qEl.value = ''; apply(); };
    app.querySelectorAll('[data-filter-group]').forEach((b) => b.addEventListener('click', () => {
      const el = b as HTMLElement; const g = el.dataset.filterGroup!; const v = el.dataset.filterValue!;
      (state as any)[g] = ((state as any)[g] === v && v !== 'all') ? 'all' : v; apply();
    }));
    qEl.addEventListener('input', () => { state.q = qEl.value.trim().toLowerCase(); apply(); });
    qEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') { qEl.value = ''; state.q = ''; apply(); qEl.focus(); } });
    clearQ?.addEventListener('click', () => { qEl.value = ''; state.q = ''; apply(); qEl.focus(); });
    app.querySelector('#clear-all')?.addEventListener('click', clearAll);
    app.querySelector('#clear-filters')?.addEventListener('click', clearAll);
    apply();
  }).catch((e) => {
    app.innerHTML = `<p class="empty">Could not load report. ${esc(e?.message ?? e)}<br>Pass the report URL as <code>?report=&lt;url&gt;</code> or place it at <code>data/report.json</code> next to this app.</p>`;
  });
}
main();

/**
 * Documentation search.
 *
 * A topic matches when every whitespace-separated token appears in its
 * title, category, summary, keywords or body. Ranking prefers title hits,
 * then category, then prose, so typing "fillet" puts the Fillet node above
 * topics that merely mention fillets. Case-insensitive; no fuzzy matching, so
 * a typo returns nothing rather than a confident wrong answer.
 */
import type { DocBlock, DocMatchField, DocSearchResult, DocSection, DocTopic } from './types';

/** Flatten one block to searchable text. Keeps table cells, not formatting. */
export function blockText(block: DocBlock): string {
  switch (block.kind) {
    case 'paragraph':
    case 'note':
      return block.text;
    case 'bullets':
    case 'steps':
      return block.items.join(' ');
    case 'table':
      return `${block.headers.join(' ')} ${block.rows.map(row => row.join(' ')).join(' ')}`;
    default:
      return '';
  }
}

/** Every searchable string of a topic, one entry per field. */
export function topicText(topic: DocTopic): string {
  return [
    topic.title,
    topic.category ?? '',
    topic.summary,
    ...(topic.keywords ?? []),
    ...topic.body.map(blockText),
  ]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function allTopics(sections: readonly DocSection[]): DocTopic[] {
  return sections.flatMap(section => section.topics);
}

function tokenize(term: string): string[] {
  return term
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(token => token !== '');
}

function excerpt(text: string, tokens: string[], max = 150): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean === '') return '';
  const lower = clean.toLowerCase();
  let at = -1;
  for (const token of tokens) {
    const idx = lower.indexOf(token);
    if (idx >= 0 && (at < 0 || idx < at)) at = idx;
  }
  if (at < 0) return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
  const start = Math.max(0, at - Math.floor(max / 3));
  const slice = clean.slice(start, start + max).trim();
  return `${start > 0 ? '…' : ''}${slice}${start + max < clean.length ? '…' : ''}`;
}

/**
 * Ranked search across every section. An empty (or whitespace) term returns
 * no results — the panel shows the browse tree instead of an arbitrary list.
 */
export function searchDocumentation(sections: readonly DocSection[], term: string, limit = 80): DocSearchResult[] {
  const tokens = tokenize(term);
  if (tokens.length === 0) return [];

  const results: DocSearchResult[] = [];
  for (const topic of allTopics(sections)) {
    const title = topic.title.toLowerCase();
    const category = (topic.category ?? '').toLowerCase();
    const summary = topic.summary.toLowerCase();
    const keywords = (topic.keywords ?? []).join(' ').toLowerCase();
    const bodyRaw = topic.body.map(blockText).join(' ');
    const body = bodyRaw.toLowerCase();

    let score = 0;
    const matchedIn = new Set<DocMatchField>();
    let matched = true;
    for (const token of tokens) {
      let tokenScore = 0;
      if (title.startsWith(token)) {
        tokenScore += 60;
        matchedIn.add('title');
      } else if (title.includes(token)) {
        tokenScore += 40;
        matchedIn.add('title');
      }
      if (category.includes(token)) {
        tokenScore += 22;
        matchedIn.add('category');
      }
      if (keywords.includes(token)) {
        tokenScore += 18;
        matchedIn.add('summary');
      }
      if (summary.includes(token)) {
        tokenScore += 12;
        matchedIn.add('summary');
      }
      if (body.includes(token)) {
        tokenScore += 8;
        matchedIn.add('body');
      }
      if (tokenScore === 0) {
        matched = false;
        break;
      }
      score += tokenScore;
    }
    if (!matched) continue;

    results.push({
      topic,
      score,
      matchedIn: [...matchedIn],
      snippet: excerpt(matchedIn.has('body') ? bodyRaw : topic.summary, tokens),
    });
  }

  return results
    .sort((a, b) => b.score - a.score || a.topic.title.localeCompare(b.topic.title))
    .slice(0, limit);
}

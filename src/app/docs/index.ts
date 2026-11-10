/**
 * Public entry point for the in-app documentation model.
 *
 * Integration code should import from here rather than from the individual
 * modules: the panel, the search and the node lookup are one small API.
 */
import { DOC_SECTIONS } from './content';
import { allTopics } from './search';
import type { DocSection, DocSectionId, DocTarget, DocTopic } from './types';

export * from './types';
export { DOC_SECTIONS, SECTION_ORDER, buildDocumentation } from './content';
export { allTopics, blockText, searchDocumentation, topicText } from './search';
export { buildNodeTopics } from './node-docs';

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function findSection(id: string, sections: readonly DocSection[] = DOC_SECTIONS): DocSection | undefined {
  return sections.find(section => section.id === id);
}

/** Node topics of one documentation tree, in section order. */
export function nodeTopics(sections: readonly DocSection[] = DOC_SECTIONS): DocTopic[] {
  return sections.find(section => section.id === 'nodes')?.topics ?? [];
}

/**
 * Find a node topic by palette/catalog key (`opExtrude::`) or display title
 * (`OpExtrude`, `Extrude`). Case-insensitive; punctuation and spaces are
 * ignored for the fallback comparison, so `op extrude` also resolves. Returns
 * undefined for anything that is not a node topic — callers decide how to
 * fall back.
 */
export function findNodeTopic(keyOrTitle: string, sections: readonly DocSection[] = DOC_SECTIONS): DocTopic | undefined {
  const query = keyOrTitle.trim();
  if (query === '') return undefined;
  const lower = query.toLowerCase();
  const normalized = normalize(query);
  const topics = nodeTopics(sections);
  return (
    topics.find(topic => topic.catalogKey != null && topic.catalogKey.toLowerCase() === lower) ??
    topics.find(topic => topic.title.toLowerCase() === lower) ??
    topics.find(topic => topic.catalogKey != null && normalize(topic.catalogKey) === normalized) ??
    topics.find(topic => normalize(topic.title) === normalized)
  );
}

function topicById(sections: readonly DocSection[], id: string): DocTopic | undefined {
  return allTopics(sections).find(topic => topic.id === id);
}

/**
 * Resolve `initialSection` / `initialTopic` props to a real topic.
 *
 * Accepted topic forms: a topic id, a node catalog key, a title, or the same
 * with different casing/spacing. Anything unknown falls back to the first
 * topic of the requested section (or the first topic overall) and reports
 * `fallback: true` instead of throwing — an integration bug must not blank
 * the panel.
 */
export function resolveDocTarget(
  sections: readonly DocSection[] = DOC_SECTIONS,
  requestedSection?: DocSectionId | string,
  requestedTopic?: string,
): DocTarget {
  if (sections.length === 0) throw new Error('Documentation has no sections');
  const requested = requestedSection != null ? findSection(requestedSection, sections) : undefined;
  const section = requested ?? sections[0];
  const query = requestedTopic?.trim() ?? '';

  if (query !== '') {
    const exact =
      section.topics.find(topic => topic.id === query) ??
      topicById(sections, query) ??
      findNodeTopic(query, sections) ??
      section.topics.find(topic => normalize(topic.title) === normalize(query)) ??
      allTopics(sections).find(topic => normalize(topic.title) === normalize(query));
    if (exact != null) {
      const owner = sections.find(candidate => candidate.topics.includes(exact)) ?? section;
      return { section: owner, topic: exact, fallback: false };
    }
  }

  const first = section.topics[0] ?? sections[0].topics[0];
  if (first == null) throw new Error('Documentation has no topics');
  const owner = sections.find(candidate => candidate.topics.includes(first)) ?? section;
  return { section: owner, topic: first, fallback: query !== '' };
}

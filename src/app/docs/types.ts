/**
 * In-app documentation model.
 *
 * The documentation is plain data, not markup: every topic is authored as
 * blocks so the panel controls typography (STYLE_GUIDE.md) and search can
 * index the rendered text without parsing HTML. Node topics are derived from
 * the live `PaletteInsertable` catalog, so a node cannot ship undocumented.
 */

/** The three top-level documentation sections, in display order. */
export type DocSectionId = 'general' | 'design-practice' | 'nodes';

/** One authored block of a topic body. */
export type DocBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'steps'; items: string[] }
  | { kind: 'note'; text: string }
  | { kind: 'table'; headers: string[]; rows: string[][] };

export interface DocTopic {
  /** Stable id, unique across every section (e.g. `node:opExtrude::`). */
  id: string;
  section: DocSectionId;
  title: string;
  /** Node category for node topics; undefined for prose topics. */
  category?: string;
  /** Palette/catalog key this topic documents, when it documents a node. */
  catalogKey?: string;
  /** One-sentence answer shown in lists and used by search ranking. */
  summary: string;
  body: DocBlock[];
  /** Extra search terms that are not literally present in the body. */
  keywords?: string[];
  /** Related topic ids, rendered as "See also" links. */
  related?: string[];
}

export interface DocSection {
  id: DocSectionId;
  title: string;
  blurb: string;
  topics: DocTopic[];
}

/** Where a search hit matched, strongest first. */
export type DocMatchField = 'title' | 'category' | 'summary' | 'body';

export interface DocSearchResult {
  topic: DocTopic;
  score: number;
  matchedIn: DocMatchField[];
  /** Short body excerpt around the first match, for the result row. */
  snippet: string;
}

/** A resolved location in the documentation (used for initial props). */
export interface DocTarget {
  section: DocSection;
  topic: DocTopic;
  /** True when the requested section/topic could not be found and the first
   * topic of the requested (or first) section was substituted. */
  fallback: boolean;
}

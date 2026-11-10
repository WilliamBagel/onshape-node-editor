/**
 * "Open the documentation for this" requests.
 *
 * `OnshapeNode.vue` is rendered by rete deep inside the canvas and has no
 * props path to `App.vue`; a `window` global would be untyped and would leak
 * across mounts. This module-level bus keeps the request decoupled: the node
 * publishes a topic, App subscribes while it is mounted and opens its in-app
 * DocumentationPanel. Requests are dropped when nobody is listening, which is
 * exactly right for a bare component mount.
 */
import type { DocSectionId } from './types';

export interface DocHelpRequest {
  /** Topic title, catalog key, or topic id. Resolved by the panel. */
  topic?: string;
  /** Preferred section; defaults to the section that owns the topic. */
  section?: DocSectionId;
}

type DocHelpListener = (request: DocHelpRequest) => void;

const listeners = new Set<DocHelpListener>();

/** Ask the host application to open documentation. Never throws. */
export function requestDocHelp(request: DocHelpRequest = {}): void {
  for (const listener of [...listeners]) listener({ ...request });
}

/** Subscribe to help requests; returns the unsubscribe function. */
export function onDocHelp(listener: DocHelpListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

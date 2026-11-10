<!--
  DocumentationPanel.vue — in-app, searchable documentation.

  A non-modal right-docked panel: no backdrop focus trap, so Tab keeps its
  normal meaning and Escape is the explicit dismissal everywhere inside.
  Search filters General, Design practice and every generated node topic;
  Up/Down move the list highlight, Enter opens the highlighted topic.

  Public API (foundation card): props `open`, `initialSection`, `initialTopic`;
  event `close`. Topic lookup lives in `src/app/docs` — this component never
  owns content. Styled per STYLE_GUIDE.md: white panel, hairline, warm ink,
  14/13/12/11 scale, one steel-blue accent.
-->
<template>
  <div v-if="open" class="docs-layer" @keydown="onLayerKeydown">
    <div class="docs-scrim" aria-hidden="true" @click="close" />
    <section class="docs-panel" role="dialog" aria-labelledby="docs-panel-title">
      <header class="docs-head">
        <div class="docs-head-text">
          <h2 id="docs-panel-title" class="docs-title">Documentation</h2>
          <p class="docs-subtitle">{{ activeSection.title }}</p>
        </div>
        <span class="docs-keycap">Esc</span>
        <button type="button" class="docs-close" aria-label="Close documentation" @click="close">
          <SvgIcon href="#svg-icon-close-x" :size="16" />
        </button>
      </header>

      <!-- Section tabs: General / Design practice / Nodes stay one click away
           regardless of where the article currently is. -->
      <nav class="docs-sections" aria-label="Documentation sections">
        <button
          v-for="section in sections"
          :key="section.id"
          type="button"
          class="docs-section-tab"
          :class="{ 'docs-section-tab--active': section.id === activeSection.id }"
          :data-section="section.id"
          :aria-pressed="section.id === activeSection.id"
          @click="selectSection(section)"
        >
          {{ section.title }}
        </button>
      </nav>

      <div class="docs-search-row">
        <input
          ref="searchInput"
          v-model="term"
          class="docs-search"
          type="text"
          role="combobox"
          aria-label="Search documentation"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls="docs-topic-list"
          :aria-activedescendant="activeDescendant"
          placeholder="Search topics and nodes…"
          autocomplete="off"
          spellcheck="false"
        />
      </div>
      <div class="docs-body">
        <nav
          id="docs-topic-list"
          class="docs-nav"
          role="listbox"
          aria-label="Documentation topics"
        >
          <template v-for="group in navGroups" :key="group.id">
            <div class="docs-nav-heading" role="presentation">{{ group.title }}</div>
            <button
              v-for="topic in group.topics"
              :id="optionId(topic)"
              :key="topic.id"
              :ref="el => registerOption(topic.id, el)"
              type="button"
              class="docs-nav-item"
              :class="{ 'docs-nav-item--active': topic.id === activeOptionId }"
              role="option"
              :aria-selected="topic.id === activeOptionId"
              @click="selectTopic(topic)"
              @mouseenter="activeOptionId = topic.id"
            >
              <span class="docs-nav-name">{{ topic.title }}</span>
              <span v-if="isSearching && !topic.id.startsWith('category:')" class="docs-nav-meta">{{ topic.category ?? sectionTitle(topic.section) }}</span>
            </button>
          </template>
          <p v-if="visibleTopics.length === 0" class="docs-empty">
            No topic matches “{{ term.trim() }}”. Try a feature name such as <em>fillet</em>, or a category such as <em>Math</em>.
          </p>
        </nav>

        <article ref="articleEl" class="docs-article" aria-live="polite">
          <p class="docs-crumb">
            {{ activeSection.title }}<template v-if="activeTopic.category"> / {{ activeTopic.category }}</template>
          </p>
          <h3 class="docs-article-title">{{ activeTopic.title }}</h3>
          <p class="docs-summary">{{ activeTopic.summary }}</p>

          <template v-for="(block, index) in articleBlocks" :key="index">
            <p v-if="block.kind === 'paragraph'" class="docs-p">{{ block.text }}</p>
            <ul v-else-if="block.kind === 'bullets'" class="docs-list">
              <li v-for="(item, i) in block.items" :key="i">{{ item }}</li>
            </ul>
            <ol v-else-if="block.kind === 'steps'" class="docs-list docs-steps">
              <li v-for="(item, i) in block.items" :key="i">{{ item }}</li>
            </ol>
            <p v-else-if="block.kind === 'note'" class="docs-note">{{ block.text }}</p>
            <div v-else-if="block.kind === 'table'" class="docs-table-wrap">
              <table class="docs-table">
                <thead>
                  <tr>
                    <th v-for="(header, i) in block.headers" :key="i" scope="col">{{ header }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, i) in block.rows" :key="i">
                    <td v-for="(cell, j) in row" :key="j">{{ cell }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>

          <div v-if="relatedTopics.length > 0" class="docs-related">
            <h4 class="docs-related-title">See also</h4>
            <div class="docs-related-list">
              <button
                v-for="topic in relatedTopics"
                :key="topic.id"
                type="button"
                class="docs-related-link"
                @click="selectTopic(topic)"
              >
                {{ topic.title }}
              </button>
            </div>
          </div>
        </article>
      </div>

      <footer class="docs-foot">
        <span>{{ totalTopics }} topics across {{ sections.length }} sections</span>
        <span class="docs-foot-keys">
          <kbd>↑</kbd><kbd>↓</kbd> move <span class="docs-foot-sep">·</span> <kbd>Enter</kbd> open
          <span class="docs-foot-sep">·</span> <kbd>Esc</kbd> close
        </span>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import SvgIcon from './SvgIcon.vue'
import { DOC_SECTIONS, resolveDocTarget, searchDocumentation } from '../docs'
import type { DocSection, DocSectionId, DocTopic } from '../docs/types'

const props = defineProps<{
  open: boolean
  initialSection?: DocSectionId
  initialTopic?: string
}>()
const emit = defineEmits<{ (e: 'close'): void }>()

const sections = DOC_SECTIONS
const term = ref('')
const selectedTopicId = ref<string>(sections[0].topics[0].id)
const activeOptionId = ref<string>(sections[0].topics[0].id)
const searchInput = ref<HTMLInputElement | null>(null)
const articleEl = ref<HTMLElement | null>(null)
const optionRefs = new Map<string, HTMLElement>()

let returnFocus: HTMLElement | null = null

const results = computed(() => searchDocumentation(sections, term.value))
const isSearching = computed(() => term.value.trim() !== '')

interface NavGroup { id: string; title: string; topics: DocTopic[] }

/** Browse mode groups sections (Nodes split by category); search mode is one flat result group. */
const navGroups = computed<NavGroup[]>(() => {
  if (isSearching.value) {
    if (results.value.length === 0) return []
    return [{ id: 'results', title: `${results.value.length} match${results.value.length === 1 ? '' : 'es'}`, topics: results.value.map(result => result.topic) }]
  }
  const groups: NavGroup[] = []
  for (const section of sections) {
    if (section.id !== 'nodes') {
      groups.push({ id: section.id, title: section.title, topics: section.topics })
      continue
    }
    for (const topic of section.topics) {
      const category = topic.category ?? 'Other'
      const last = groups[groups.length - 1]
      if (last == null || last.id !== `nodes:${category}`) {
        groups.push({ id: `nodes:${category}`, title: category, topics: [] })
      }
      groups[groups.length - 1].topics.push(topic)
    }
  }
  return groups
})

const visibleTopics = computed(() => navGroups.value.flatMap(group => group.topics))
const totalTopics = computed(() => sections.reduce((sum, section) => sum + section.topics.length, 0))
const activeTopic = computed<DocTopic>(() => {
  const found = sections.flatMap(section => section.topics).find(topic => topic.id === selectedTopicId.value)
  return found ?? sections[0].topics[0]
})
const activeSection = computed(() => sections.find(section => section.id === activeTopic.value.section) ?? sections[0])
/** The summary is already shown under the title; do not repeat it as the
 * first body paragraph (node topics use the same authored sentence there). */
const articleBlocks = computed(() => {
  const blocks = activeTopic.value.body
  const first = blocks[0]
  if (first?.kind === 'paragraph' && first.text.trim() === activeTopic.value.summary.trim()) return blocks.slice(1)
  return blocks
})
const relatedTopics = computed<DocTopic[]>(() => {
  const ids = activeTopic.value.related ?? []
  const all = sections.flatMap(section => section.topics)
  return ids.map(id => all.find(topic => topic.id === id)).filter((topic): topic is DocTopic => topic != null)
})
const activeDescendant = computed(() =>
  visibleTopics.value.some(topic => topic.id === activeOptionId.value) ? optionIdFor(activeOptionId.value) : undefined,
)

function optionIdFor(id: string): string {
  return `docs-option-${id.replace(/[^a-zA-Z0-9_-]+/g, '-')}`
}
function optionId(topic: DocTopic): string {
  return optionIdFor(topic.id)
}
function registerOption(id: string, el: unknown) {
  if (el instanceof HTMLElement) optionRefs.set(id, el)
  else optionRefs.delete(id)
}
function sectionTitle(id: DocSectionId): string {
  return sections.find(section => section.id === id)?.title ?? ''
}

function selectTopic(topic: DocTopic) {
  selectedTopicId.value = topic.id
  activeOptionId.value = topic.id
  if (articleEl.value != null) articleEl.value.scrollTop = 0
}

/** Section tab: leave search mode and show the section's first topic. */
function selectSection(section: DocSection) {
  term.value = ''
  const first = section.topics[0]
  if (first != null) selectTopic(first)
}

/** Keep the active row inside the list by adjusting the list scroll only. */
function scrollActiveIntoView() {
  const el = optionRefs.get(activeOptionId.value)
  const container = document.getElementById('docs-topic-list')
  if (!(el instanceof HTMLElement) || container == null) return
  const pad = 4
  const listRect = container.getBoundingClientRect()
  const itemRect = el.getBoundingClientRect()
  if (itemRect.top < listRect.top + pad) container.scrollTop -= listRect.top + pad - itemRect.top
  else if (itemRect.bottom > listRect.bottom - pad) container.scrollTop += itemRect.bottom - (listRect.bottom - pad)
}

function moveActive(delta: number) {
  const topics = visibleTopics.value
  if (topics.length === 0) return
  const index = topics.findIndex(topic => topic.id === activeOptionId.value)
  const next = index < 0 ? (delta > 0 ? 0 : topics.length - 1) : Math.min(Math.max(index + delta, 0), topics.length - 1)
  activeOptionId.value = topics[next].id
  // Live preview: the article follows the highlighted topic, so the pane and
  // the list never disagree while browsing or searching.
  selectedTopicId.value = topics[next].id
  scrollActiveIntoView()
}

function chooseActive() {
  const topic = visibleTopics.value.find(candidate => candidate.id === activeOptionId.value)
  if (topic != null) selectTopic(topic)
}

function applyInitialTarget() {
  const target = resolveDocTarget(sections, props.initialSection, props.initialTopic)
  selectedTopicId.value = target.topic.id
  activeOptionId.value = target.topic.id
  if (articleEl.value != null) articleEl.value.scrollTop = 0
}

function activate() {
  term.value = ''
  applyInitialTarget()
  void nextTick(() => {
    searchInput.value?.focus()
    activeOptionId.value = selectedTopicId.value
    scrollActiveIntoView()
  })
}

function close() {
  emit('close')
}

/** Panel-level handling so Escape works from the search field, a row, or a link. */
function onLayerKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    close()
    return
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    moveActive(event.key === 'ArrowDown' ? 1 : -1)
    return
  }
  if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
    event.preventDefault()
    chooseActive()
  }
}

watch(term, async () => {
  if (isSearching.value) {
    const first = results.value[0]?.topic
    activeOptionId.value = first?.id ?? ''
    if (first != null) selectedTopicId.value = first.id
  } else {
    activeOptionId.value = selectedTopicId.value
  }
  await nextTick()
  scrollActiveIntoView()
})

watch(
  () => [props.initialSection, props.initialTopic],
  () => {
    if (props.open) applyInitialTarget()
  },
)

watch(
  () => props.open,
  async (open) => {
    if (open) {
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      activate()
      return
    }
    const target = returnFocus
    returnFocus = null
    await nextTick()
    if (target != null && target.isConnected) target.focus()
  },
)

onMounted(() => {
  if (props.open) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    activate()
  }
})
</script>

<style scoped>
.docs-layer {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  justify-content: flex-end;
  font-family: var(--font-sans);
  color: var(--ink);
}
.docs-scrim { position: absolute; inset: 0; background: var(--backdrop-scrim); }
.docs-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(760px, 96vw);
  height: 100%;
  background: var(--surface);
  border-left: 1px solid var(--hairline);
  box-shadow: var(--shadow-1);
}
.docs-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px 10px;
  border-bottom: 1px solid var(--hairline);
}
.docs-head-text { flex: 1 1 auto; min-width: 0; }
.docs-title { margin: 0; font-size: var(--font-size-heading); font-weight: var(--font-weight-title); line-height: var(--line-height-title); }
.docs-subtitle { margin: 2px 0 0; font-size: var(--font-size-meta); line-height: var(--line-height-body); opacity: var(--opacity-secondary); }
.docs-keycap {
  font-family: var(--font-mono);
  font-size: var(--font-size-keycap);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-keycap);
  padding: 1px 4px;
  opacity: var(--opacity-secondary);
}
.docs-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--hairline);
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--ink);
  cursor: pointer;
}
.docs-close:hover { background: var(--hover-tint); }
.docs-close:focus-visible { outline: 2px solid var(--accent-steel); outline-offset: 1px; }

/* Section tabs: quiet text buttons, steel underline for the active section. */
.docs-sections {
  flex: none;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 16px 0;
  border-bottom: 1px solid var(--hairline);
}
.docs-section-tab {
  padding: 6px 8px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--ink);
  font-family: var(--font-sans);
  font-size: var(--font-size-section);
  font-weight: var(--font-weight-section);
  line-height: var(--line-height-title);
  opacity: var(--opacity-secondary);
  cursor: pointer;
}
.docs-section-tab:hover { opacity: 1; background: var(--hover-tint); }
.docs-section-tab--active {
  opacity: 1;
  border-bottom-color: var(--accent-steel);
}
.docs-section-tab:focus-visible { outline: 2px solid var(--accent-steel); outline-offset: -2px; }

.docs-search-row { flex: none; display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-bottom: 1px solid var(--hairline); }
.docs-search {
  flex: 1 1 auto;
  min-width: 0;
  padding: 6px 8px;
  font-family: var(--font-sans);
  font-size: var(--font-size-value);
  color: var(--ink);
  background: var(--surface-sunken);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-control);
}
.docs-search:focus { outline: 2px solid var(--accent-steel); outline-offset: 1px; border-color: var(--accent-steel); }

.docs-body { flex: 1 1 auto; min-height: 0; display: flex; }
.docs-nav {
  flex: 0 0 260px;
  min-width: 0;
  overflow-y: auto;
  border-right: 1px solid var(--hairline);
  padding: 4px 6px 12px;
  scrollbar-width: thin;
  scrollbar-color: var(--hairline-strong) transparent;
}
.docs-nav-heading {
  padding: 10px 8px 4px;
  font-size: var(--font-size-section);
  font-weight: var(--font-weight-section);
  opacity: var(--opacity-secondary);
}
.docs-nav-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  padding: 5px 8px;
  border: none;
  border-radius: var(--radius-control);
  background: transparent;
  font-family: var(--font-sans);
  font-size: var(--font-size-value);
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}
.docs-nav-item:hover { background: var(--hover-tint); }
.docs-nav-item--active { background: var(--active-tint); box-shadow: inset 2px 0 0 var(--accent-steel); }
.docs-nav-item:focus-visible { outline: 2px solid var(--accent-steel); outline-offset: -2px; }
.docs-nav-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.docs-nav-meta { flex: 0 0 auto; font-size: var(--font-size-meta); opacity: var(--opacity-secondary); }
.docs-empty { margin: 8px; font-size: var(--font-size-label); line-height: var(--line-height-body); opacity: var(--opacity-secondary); }
.docs-empty em { font-style: normal; color: var(--ink); opacity: 1; }

.docs-article {
  flex: 1 1 auto;
  min-width: 0;
  overflow-y: auto;
  padding: 16px 24px 32px;
  scrollbar-width: thin;
  scrollbar-color: var(--hairline-strong) transparent;
}
.docs-crumb { margin: 0 0 4px; font-size: var(--font-size-meta); opacity: var(--opacity-secondary); }
.docs-article-title { margin: 0 0 6px; font-size: var(--font-size-heading); font-weight: var(--font-weight-title); line-height: var(--line-height-title); }
.docs-summary { margin: 0 0 12px; font-size: var(--font-size-value); line-height: var(--line-height-body); }
.docs-p { margin: 0 0 10px; font-size: var(--font-size-value); line-height: var(--line-height-body); }
.docs-list { margin: 0 0 10px; padding-left: 18px; font-size: var(--font-size-value); line-height: var(--line-height-body); }
.docs-list li { margin: 2px 0; }
.docs-steps { list-style: decimal; }
.docs-note {
  margin: 0 0 12px;
  padding: 8px 10px;
  font-size: var(--font-size-label);
  line-height: var(--line-height-body);
  background: var(--surface-sunken);
  border-left: 2px solid var(--accent-steel);
}
.docs-table-wrap { margin: 0 0 12px; overflow-x: auto; }
.docs-table { width: 100%; border-collapse: collapse; font-size: var(--font-size-label); line-height: var(--line-height-body); }
.docs-table th {
  text-align: left;
  font-size: var(--font-size-section);
  font-weight: var(--font-weight-section);
  padding: 4px 8px 4px 0;
  border-bottom: 1px solid var(--hairline);
  white-space: nowrap;
}
.docs-table td { padding: 4px 8px 4px 0; border-bottom: 1px solid var(--border-subtle); vertical-align: top; overflow-wrap: anywhere; }
.docs-table td:nth-child(1), .docs-table td:nth-child(2) { white-space: nowrap; }
.docs-table td:first-child { font-family: var(--font-mono); font-size: var(--font-size-literal); }
.docs-related { margin-top: 20px; padding-top: 10px; border-top: 1px solid var(--hairline); }
.docs-related-title { margin: 0 0 6px; font-size: var(--font-size-section); font-weight: var(--font-weight-section); opacity: var(--opacity-secondary); }
.docs-related-list { display: flex; flex-wrap: wrap; gap: 6px; }
.docs-related-link {
  padding: 3px 8px;
  font-family: var(--font-sans);
  font-size: var(--font-size-label);
  color: var(--ink);
  background: transparent;
  border: 1px solid var(--hairline);
  border-radius: var(--radius-control);
  cursor: pointer;
}
.docs-related-link:hover { background: var(--hover-tint); }
.docs-related-link:focus-visible { outline: 2px solid var(--accent-steel); outline-offset: 1px; }

.docs-foot {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  border-top: 1px solid var(--hairline);
  font-size: var(--font-size-meta);
  opacity: var(--opacity-secondary);
}
.docs-foot-keys { display: inline-flex; align-items: center; gap: 3px; }
.docs-foot-sep { margin: 0 2px; }
.docs-foot kbd {
  font-family: var(--font-mono);
  font-size: var(--font-size-keycap);
  padding: 0 3px;
  border: 1px solid var(--hairline);
  border-radius: var(--radius-keycap);
  opacity: 1;
}
</style>

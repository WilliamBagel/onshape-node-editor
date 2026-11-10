<!-- Editor context menu: recursive search + viewport clamping.
     The vendor preset only filters its top-level rows, so typing a node name
     (for example "fillet") found nothing inside Math / Onshape features.
     This replacement keeps the same item shape but searches every leaf.
     Keyboard: root is a real menu (role=menu/menuitem, aria-activedescendant);
     ArrowUp/ArrowDown/Home/End move the active row and scroll it into view,
     Enter/Space activate, Escape closes and returns focus to the canvas.
     Tab is not trapped. Mouse behaviour is unchanged. -->
<template>
  <div ref="root" class="menu" data-testid="context-menu" rete-context-menu
    role="menu" tabindex="0" aria-label="Editor context menu"
    :aria-activedescendant="activeId"
    @keydown="onKeydown"
    @mouseover="cancelHide" @mouseleave="scheduleHide" @wheel.stop="onWheel">
    <div v-if="searchBar" class="block">
      <input ref="search" v-model="term" class="search" data-testid="context-menu-search-input"
        aria-label="Search context menu" aria-expanded="true" aria-controls="context-menu-list"
        placeholder="Search…" />
    </div>

    <div id="context-menu-list">
    <template v-if="!query">
      <div v-for="item in items" :key="item.key" class="block"
        :class="{ hasSubitems: hasChildren(item), 'block--active': item.key === activeKey, 'block--section-start': item.sectionStart }"
        role="menuitem" :id="`cm-${item.key}`" tabindex="-1"
        :aria-expanded="hasChildren(item) ? openKey === item.key : undefined"
        @mouseenter="activeKey = item.key" @focus="activeKey = item.key"
        @click.stop="activate(item)">
        <span v-if="item.icon" class="row-icon" aria-hidden="true">
          <SvgIcon :href="item.icon" :size="16" />
        </span>
        <div class="content">{{ item.label }}</div>
        <kbd v-if="item.shortcut" class="row-shortcut">{{ item.shortcut }}</kbd>
        <span v-if="hasChildren(item)" class="row-chevron" :class="{ 'row-chevron--open': openKey === item.key }"
          aria-hidden="true"></span>
        <div v-if="hasChildren(item) && openKey === item.key" class="subitems subitems-inline">
          <div v-for="sub in item.subitems" :key="sub.key" class="block subitem"
            :class="{ 'block--active': sub.key === activeKey }"
            role="menuitem" :id="`cm-${sub.key}`" tabindex="-1"
            @mouseenter="activeKey = sub.key" @focus="activeKey = sub.key"
            @click.stop="activate(sub)">
            <span v-if="sub.icon" class="row-icon" aria-hidden="true">
              <SvgIcon :href="sub.icon" :size="16" />
            </span>
            <div class="content">{{ sub.label }}</div>
            <kbd v-if="sub.shortcut" class="row-shortcut">{{ sub.shortcut }}</kbd>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div v-for="hit in hits" :key="hit.item.key" class="block"
        :class="{ 'block--active': hit.item.key === activeKey }"
        role="menuitem" :id="`cm-${hit.item.key}`" tabindex="-1"
        @mouseenter="activeKey = hit.item.key" @focus="activeKey = hit.item.key"
        @click.stop="activate(hit.item)">
        <span v-if="hit.item.icon" class="row-icon" aria-hidden="true">
          <SvgIcon :href="hit.item.icon" :size="16" />
        </span>
        <div class="content">
          <span class="hit-category">{{ hit.category }}</span>
          <span class="hit-label">{{ hit.item.label }}</span>
        </div>
        <kbd v-if="hit.item.shortcut" class="row-shortcut">{{ hit.item.shortcut }}</kbd>
      </div>
      <div v-if="hits.length === 0" class="block">
        <div class="content menu-empty">No matching node.</div>
      </div>
    </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUpdated, ref, watch } from "vue";
import SvgIcon from "../components/SvgIcon.vue";
import type { EditorContextMenuItem as ContextMenuItem } from "./context-menu-types";

interface Hit {
  item: ContextMenuItem;
  category: string;
}

const props = withDefaults(defineProps<{
  items: ContextMenuItem[];
  searchBar?: boolean;
  onHide?: () => void;
}>(), { searchBar: false, onHide: undefined });

const term = ref("");
const openKey = ref<string | null>(null);
const activeKey = ref<string | null>(null);
const root = ref<HTMLElement | null>(null);
const search = ref<HTMLInputElement | null>(null);

let submenuTimer: ReturnType<typeof setTimeout> | null = null;

const query = computed(() => term.value.trim().toLowerCase());

function hasChildren(item: ContextMenuItem): boolean {
  return Array.isArray(item.subitems) && item.subitems.length > 0;
}

function leaves(items: readonly ContextMenuItem[], category = ""): Hit[] {
  const out: Hit[] = [];
  for (const item of items) {
    if (hasChildren(item)) out.push(...leaves(item.subitems as ContextMenuItem[], category || item.label));
    else out.push({ item, category });
  }
  return out;
}

/** Category match shows the whole category; leaf match shows only that leaf. */
const hits = computed<Hit[]>(() => {
  const q = query.value;
  if (q === "") return [];
  const out: Hit[] = [];
  for (const item of props.items) {
    if (hasChildren(item)) {
      const categoryMatches = item.label.toLowerCase().includes(q);
      const children = leaves(item.subitems as ContextMenuItem[], item.label);
      out.push(...children.filter(hit => categoryMatches || hit.item.label.toLowerCase().includes(q)));
    } else if (item.label.toLowerCase().includes(q)) {
      out.push({ item, category: "" });
    }
  }
  return out.slice(0, 80);
});

/** Rows the keyboard can reach right now: search hits, or the visible tree
 *  (top level plus the open inline category). */
const visibleItems = computed<ContextMenuItem[]>(() => {
  if (query.value !== "") return hits.value.map(hit => hit.item);
  const out: ContextMenuItem[] = [];
  for (const item of props.items) {
    out.push(item);
    if (hasChildren(item) && openKey.value === item.key) out.push(...(item.subitems as ContextMenuItem[]));
  }
  return out;
});

const activeId = computed(() => (activeKey.value != null ? `cm-${activeKey.value}` : undefined));

watch(visibleItems, () => {
  if (activeKey.value == null || !visibleItems.value.some(item => item.key === activeKey.value)) {
    activeKey.value = visibleItems.value[0]?.key ?? null;
  }
  scrollActiveIntoView();
}, { immediate: true });

/**
 * Keep the active row inside the menu by scrolling the menu only.
 * (Same rule as the palettes: never scroll the document/canvas.)
 */
function scrollActiveIntoView(): void {
  const container = root.value;
  if (activeKey.value == null || container == null) return;
  // Keys are catalog-generated; quote/backslash escaping suffices for the
  // attribute selector (and avoids relying on CSS.escape in jsdom).
  const escaped = activeKey.value.replace(/["\\]/g, "\\$&");
  const el = container.querySelector(`[id="cm-${escaped}"]`);
  if (!(el instanceof HTMLElement)) return;
  const pad = 4;
  const listRect = container.getBoundingClientRect();
  const itemRect = el.getBoundingClientRect();
  if (itemRect.top < listRect.top + pad) container.scrollTop -= listRect.top + pad - itemRect.top;
  else if (itemRect.bottom > listRect.bottom - pad) container.scrollTop += itemRect.bottom - (listRect.bottom - pad);
}

function moveActive(delta: number): void {
  const list = visibleItems.value;
  if (list.length === 0) return;
  const idx = list.findIndex(item => item.key === activeKey.value);
  const next = idx === -1 ? 0 : Math.min(Math.max(idx + delta, 0), list.length - 1);
  activeKey.value = list[next]?.key ?? null;
  scrollActiveIntoView();
}

function jumpActive(toEnd: boolean): void {
  const list = visibleItems.value;
  if (list.length === 0) return;
  activeKey.value = (toEnd ? list[list.length - 1] : list[0])?.key ?? null;
  scrollActiveIntoView();
}

/** Escape closes the menu and returns focus to the canvas. */
function closeAndRefocus(): void {
  props.onHide?.();
  const canvas = root.value?.closest("main.rete") as HTMLElement | null;
  if (canvas != null) {
    canvas.tabIndex = -1;
    canvas.focus();
  }
}

function onKeydown(event: KeyboardEvent): void {
  const inSearch = search.value != null && event.target === search.value;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveActive(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    moveActive(-1);
  } else if (event.key === "Home") {
    event.preventDefault();
    jumpActive(false);
  } else if (event.key === "End") {
    event.preventDefault();
    jumpActive(true);
  } else if (event.key === "Enter") {
    event.preventDefault();
    const item = visibleItems.value.find(i => i.key === activeKey.value);
    if (item != null) activate(item);
  } else if (event.key === " " && !inSearch) {
    // Space activates a menu row (in the search input it types a space).
    event.preventDefault();
    const item = visibleItems.value.find(i => i.key === activeKey.value);
    if (item != null) activate(item);
  } else if (event.key === "Escape") {
    closeAndRefocus();
  }
  // Tab intentionally unhandled: the menu never traps it.
}

/**
 * The menu lives inside MAIN.rete, where the canvas zoom handler sits on
 * an ancestor and preventDefaults wheel events — so without this the
 * search results could never wheel-scroll (user-reported: "scrollbar
 * doesn't work"). Stopping propagation lets the menu's own overflow
 * scroll natively; the rest of the menu interaction is unchanged.
 */
function onWheel(): void {}

function activate(item: ContextMenuItem): void {
  if (hasChildren(item)) {
    openKey.value = openKey.value === item.key ? null : item.key;
    return;
  }
  void item.handler?.();
  // Same hand-back as Escape: the menu root owns focus, so hiding it without
  // this leaves keyboard focus on document.body. Mouse users get the canvas
  // focused too, which is where the next gesture goes anyway.
  closeAndRefocus();
}

function cancelHide(): void {
  if (submenuTimer != null) {
    clearTimeout(submenuTimer);
    submenuTimer = null;
  }
}

function scheduleHide(): void {
  cancelHide();
  submenuTimer = setTimeout(() => props.onHide?.(), 1200);
}

/** The plugin positions its fixed host at the pointer and never flips it. */
function clamp(): void {
  const el = root.value;
  const host = el?.parentElement;
  if (el == null || host == null) return;
  host.style.zIndex = "1000";
  const rect = el.getBoundingClientRect();
  const pad = 8;
  let left = Number.parseFloat(host.style.left) || rect.left;
  let top = Number.parseFloat(host.style.top) || rect.top;
  if (left + rect.width > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - rect.width - pad);
  if (top + rect.height > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - rect.height - pad);
  host.style.left = `${left}px`;
  host.style.top = `${top}px`;
}

onMounted(async () => {
  await nextTick();
  clamp();
  if (search.value != null) search.value.focus();
  else root.value?.focus();
});

onUpdated(() => {
  void nextTick(clamp);
});
</script>

<style scoped>
.content { display: flex; align-items: baseline; gap: 6px; flex: 1 1 auto; min-width: 0; }
.row-icon { display: inline-flex; flex: none; color: var(--text-secondary); }
/* A category row wraps its header line and puts the inline submenu on its own
   full-width line; without the wrap the submenu became a narrow column beside
   the label (the block is a flex row). */
.block.hasSubitems { flex-wrap: wrap; }
.row-chevron {
  flex: none;
  width: 6px;
  height: 6px;
  margin: 0 2px;
  border: solid var(--text-secondary);
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(-45deg);
}
.row-chevron--open { transform: rotate(45deg); }
.subitems-inline { flex: 1 0 100%; width: 100%; }
/* Keycap chips: right-aligned, mono 10px, hairline border (STYLE_GUIDE). */
.row-shortcut {
  flex: none;
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: var(--font-size-keycap);
  line-height: 1.2;
  padding: 2px 5px;
  border: 1px solid var(--hairline);
  border-radius: var(--radius-keycap);
  background: var(--surface-sunken);
  color: var(--text-secondary);
  opacity: 1;
}
.hit-category { color: var(--text-secondary); font-size: var(--font-size-meta); white-space: nowrap; }
.hit-label { color: var(--text-primary); overflow-wrap: anywhere; }
.menu-empty { color: var(--text-secondary); font-style: italic; }
</style>

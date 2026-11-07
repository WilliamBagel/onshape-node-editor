<!-- Editor context menu: recursive search + viewport clamping.
     The vendor preset only filters its top-level rows, so typing a node name
     (for example "fillet") found nothing inside Math / Onshape features.
     This replacement keeps the same item shape but searches every leaf. -->
<template>
  <div ref="root" class="menu" data-testid="context-menu" rete-context-menu
    @mouseover="cancelHide" @mouseleave="scheduleHide" @wheel.stop="onWheel">
    <div v-if="searchBar" class="block">
      <input ref="search" v-model="term" class="search" data-testid="context-menu-search-input"
        aria-label="Search context menu" placeholder="Search…" />
    </div>

    <template v-if="!query">
      <div v-for="item in items" :key="item.key" class="block"
        :class="{ hasSubitems: hasChildren(item) }">
        <div class="content" @click.stop="activate(item)">{{ item.label }}</div>
        <div v-if="hasChildren(item) && openKey === item.key" class="subitems subitems-inline">
          <div v-for="sub in item.subitems" :key="sub.key" class="block subitem" @click.stop="activate(sub)">
            <div class="content">{{ sub.label }}</div>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div v-for="hit in hits" :key="hit.item.key" class="block" @click.stop="activate(hit.item)">
        <div class="content">
          <span class="hit-category">{{ hit.category }}</span>
          <span class="hit-label">{{ hit.item.label }}</span>
        </div>
      </div>
      <div v-if="hits.length === 0" class="block">
        <div class="content menu-empty">No matching node.</div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUpdated, ref } from "vue";

interface ContextMenuItem {
  label: string;
  key: string;
  handler?: () => void | Promise<void>;
  subitems?: ContextMenuItem[];
}

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
  props.onHide?.();
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
  search.value?.focus();
});

onUpdated(() => {
  void nextTick(clamp);
});
</script>

<style scoped>
.content { display: flex; align-items: baseline; gap: 6px; }
.hit-category { color: var(--text-secondary); font-size: var(--font-size-meta); white-space: nowrap; }
.hit-label { color: var(--text-primary); overflow-wrap: anywhere; }
.menu-empty { color: var(--text-secondary); font-style: italic; }
</style>

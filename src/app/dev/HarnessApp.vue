<template>
  <div class="harness">
    <header class="harness-bar">
      <strong>UI test harness</strong>
      <span>fake document: one Part Studio &middot; fake messaging channel &middot; no network</span>
      <button type="button" @click="expandAll">Expand nested maps</button>
      <button type="button" @click="showMessages">Show sent messages</button>
    </header>
    <p class="harness-note">
      Nodes below are the real <code>OnshapeNode</code> components mounted with
      fake data. Edit titles, expand maps, type values. Everything stays in the
      browser; nothing calls Onshape.
    </p>
    <div class="harness-grid">
      <section v-for="entry in entries" :key="entry.id" class="harness-panel">
        <h2>{{ entry.title }}</h2>
        <div class="harness-node-host" :ref="(el) => registerHost(entry.id, el as HTMLElement | null)"></div>
        <p class="harness-meta">node id: {{ entry.id }}</p>
      </section>
    </div>
    <pre v-if="lastMessages" class="harness-messages">{{ lastMessages }}</pre>
  </div>
</template>

<script lang="ts">
import { createApp, defineComponent, h, ref } from 'vue';
import OnshapeNode from '../customization/OnshapeNode.vue';
import { makeHarnessGraph } from '../test-utils/fixtures';
import type { OnshapeNode as OnshapeNodeData } from '../rete/nodes/onshapenode';

interface Entry {
  id: string;
  title: string;
  node: OnshapeNodeData;
}

function mountInto(host: HTMLElement, node: OnshapeNodeData, onEmit: (args: unknown[]) => void) {
  const app = createApp({
    render: () => h(OnshapeNode, { data: node, emit: (...args: unknown[]) => onEmit(args), seed: 0 }),
  });
  app.mount(host);
  return app;
}

export default defineComponent({
  setup() {
    const { feature, math } = makeHarnessGraph();
    const entries: Entry[] = [
      { id: feature.id, title: 'Custom feature (nested map)', node: feature },
      { id: math.id, title: 'Math node (typed sockets)', node: math },
    ];
    const hosts = new Map<string, HTMLElement>();
    const proxy = ref<unknown[][]>([]);
    const lastMessages = ref('');

    function registerHost(id: string, el: HTMLElement | null) {
      if (!el || hosts.has(id)) return;
      hosts.set(id, el);
      const entry = entries.find((e) => e.id === id);
      if (entry) mountInto(el, entry.node, (args) => proxy.value.push(args));
    }

    function expandAll() {
      for (const el of hosts.values()) {
        const headers = el.querySelectorAll('.node-expander');
        headers.forEach((h) => (h as HTMLElement).click());
      }
    }

    function showMessages() {
      lastMessages.value = JSON.stringify(proxy.value.slice(-10), null, 2) || '(no messages yet)';
    }

    return { entries, registerHost, expandAll, showMessages, lastMessages };
  },
});
</script>

<style scoped>
.harness {
  font-family: sans-serif;
  padding: 16px;
}
.harness-bar {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.harness-note {
  color: gray;
}
.harness-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.harness-panel {
  border: 1px solid gray;
  padding: 8px;
}
.harness-messages {
  white-space: pre-wrap;
}
</style>

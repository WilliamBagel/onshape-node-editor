<script lang="ts">
import { defineComponent } from 'vue';
import TopBar from './components/TopBar.vue'
import { createEditor, createEditorDev } from './rete';
import BottomBar from './components/BottomBar.vue';

import { inject } from 'vue'
import ToolTip from './components/tooltip/ToolTip.vue';

export default defineComponent({
  components: {
    TopBar: TopBar,
    BottomBar: BottomBar,
    ToolTip: ToolTip
  },
  async mounted() {
    const dev = inject('developerMode');
    if (dev === true) {
      await createEditorDev(this.$refs.rete as HTMLElement);
    } else {
      await createEditor(this.$refs.rete as HTMLElement);
    }
  },
  methods: {
    onBuild() {

    },
    onRun() {

    },
    onSave() {

    },
    onOpen() {

    },
    onSettings() {

    },
    onSearch() {

    },
  },
})
</script>

<template>
  <TopBar project-name="My Graph" @build="onBuild" @run="onRun" @save="onSave" @open="onOpen" @settings="onSettings" />
  <main class="rete" ref="rete"></main>
  <BottomBar graph-name="My Graph" @search="onSearch" />
  <ToolTip />
</template>

<style scoped>
@use './common.css' as *;
@use './customization/background.css' as *;

header {
  line-height: 1.5;
}

.rete {
  margin: 0;
  background: white;
  border-radius: 0em;
  text-align: left;
  border: none;
  line-height: 1;
}
</style>

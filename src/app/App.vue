<script lang="ts">
import { defineComponent } from 'vue';
import TopBar from './components/TopBar.vue'
import { createEditor, createEditorDev } from './rete';
import BottomBar from './components/BottomBar.vue';

import { inject } from 'vue'
import ToolTip from './components/tooltip/ToolTip.vue';
import { editorBase, EditorControls } from './rete/editorbase.js';

export default defineComponent({
  components: {
    TopBar: TopBar,
    BottomBar: BottomBar,
    ToolTip: ToolTip
  },
  data() {
    return {
      controls: null as EditorControls | null
    }
  },
  async mounted() {
    let editorControls: EditorControls;
    const dev = inject('developerMode');

    if (dev === true) {
      editorControls = await createEditorDev(this.$refs.rete as HTMLElement);
    } else {
      editorControls = await createEditor(this.$refs.rete as HTMLElement);
    }
    this.controls = editorControls;
  },
  methods: {
    async runBuild() {
      const featurescript = await this.controls?.studioEvents.build();
      console.log(featurescript);
    },
    runRun() {

    },
    runSave() {

    },
    runOpen() {

    },
    runSettings() {

    },
    runSearch() {

    },
  },
})
</script>

<template>
  <TopBar project-name="My Graph" @build="runBuild" @run="runRun" @save="runSave" @open="runOpen"
    @settings="runSettings" />
  <main class="rete" ref="rete"></main>
  <BottomBar graph-name="My Graph" @search="runSearch" />
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

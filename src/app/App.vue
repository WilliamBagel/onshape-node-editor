<script lang="ts">
import { defineComponent } from 'vue';
import TopBar from './components/TopBar.vue'
import { createEditor, createEditorDev } from './rete';
import BottomBar from './components/BottomBar.vue';

import { inject } from 'vue'
import ToolTip from './components/tooltip/ToolTip.vue';
import { editorBase, EditorControls } from './rete/editorbase.js';
import { formatTarget, type FeatureStudioTarget } from './onshape-utils/featurestudiotarget';

/**
 * The slice of `App` the toolbar needs for the Feature Studio upload (#1).
 * Declared here rather than imported from `./app` to keep the App <-> App.vue
 * import one-way.
 */
interface FeatureStudioHost {
  getFeatureStudioTarget(): FeatureStudioTarget | undefined;
  setFeatureStudioTarget(target: string): unknown;
  suggestFeatureStudioTarget(): string;
  reportMessage(message: string): void;
  uploadFeatureStudio(source: string | undefined): Promise<unknown>;
}

export default defineComponent({
  components: {
    TopBar: TopBar,
    BottomBar: BottomBar,
    ToolTip: ToolTip
  },
  // Options-API injection: `provide('app', this)` in `App.startVueApp()`.
  // `inject()` called from a lifecycle hook (as `developerMode` is above) only
  // resolves during `setup()`, so the object is declared here instead.
  inject: {
    app: { from: 'app', default: null }
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
    /** The injected `App` instance (see the `inject: { app }` option above). */
    featureStudioHost(): FeatureStudioHost | null {
      return ((this as unknown as { app?: FeatureStudioHost | null }).app) ?? null;
    },
    async runBuild() {
      const featurescript = await this.controls?.studioEvents.build();
      console.log(featurescript);
    },
    /**
     * Ask for the upload target (`did`, `wvm`, `wvmid`, `eid`) and persist it.
     * There is no settings dialog in the app yet, so the prompt is the selector;
     * parsing and validation live in `FeatureStudioTargetSettings`.
     */
    async runSelectTarget() {
      const host = this.featureStudioHost();
      if (host == null) return;
      const current = host.getFeatureStudioTarget();
      const initial = current != null ? formatTarget(current) : host.suggestFeatureStudioTarget();
      const entered = window.prompt(
        'Upload target for the generated FeatureScript\n' +
        'did (document id), wvm (w=workspace, v=version, m=microversion), wvmid (workspace id) and eid (Feature Studio element id):',
        initial
      );
      if (entered == null) return;
      try {
        host.setFeatureStudioTarget(entered);
      } catch (error) {
        host.reportMessage(error instanceof Error ? error.message : String(error));
      }
    },
    /** Build the graph and write its FeatureScript into the target Feature Studio. */
    async runUpload() {
      const host = this.featureStudioHost();
      if (host == null) return;
      if (host.getFeatureStudioTarget() == null) {
        await this.runSelectTarget();
        if (host.getFeatureStudioTarget() == null) return;
      }
      const featurescript = await this.controls?.studioEvents.build();
      await host.uploadFeatureStudio(featurescript);
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
    @settings="runSettings" @upload="runUpload" @target="runSelectTarget" />
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

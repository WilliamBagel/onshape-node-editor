<script lang="ts">
import { defineComponent } from 'vue';
import TopBar from './components/TopBar.vue'
import { createEditor, createEditorDev } from './rete';
import BottomBar from './components/BottomBar.vue';

import { inject } from 'vue'
import ToolTip from './components/tooltip/ToolTip.vue';
import { editorBase, EditorControls } from './rete/editorbase.js';
import { formatTarget, type FeatureStudioTarget } from './onshape-utils/featurestudiotarget';
import type { FeatureInsertion } from './onshape-utils/partstudiofeature';
import type { GeneratedFeatureDescription } from './rete/graph-codegen';

/**
 * The slice of `App` the toolbar needs for the Feature Studio upload (#1) and
 * the Part Studio insert (#2). Declared here rather than imported from `./app`
 * to keep the App <-> App.vue import one-way.
 */
interface FeatureStudioHost {
  getFeatureStudioTarget(): FeatureStudioTarget | undefined;
  setFeatureStudioTarget(target: string): unknown;
  suggestFeatureStudioTarget(): string;
  getPartStudioTarget(): FeatureStudioTarget | undefined;
  setPartStudioTarget(target: string): unknown;
  suggestPartStudioTarget(): string;
  reportMessage(message: string): void;
  uploadFeatureStudio(source: string | undefined): Promise<unknown>;
  insertPartStudioFeature(feature: FeatureInsertion): Promise<unknown>;
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
    /**
     * Ask for the Part Studio target (`did`, `wvm`, `wvmid`, `eid`) and persist
     * it. Mirrors `runSelectTarget`; same parser and validation, different
     * storage key, because a Part Studio and a Feature Studio are never the same
     * element.
     */
    async runSelectPartStudioTarget() {
      const host = this.featureStudioHost();
      if (host == null) return;
      const current = host.getPartStudioTarget();
      const initial = current != null ? formatTarget(current) : host.suggestPartStudioTarget();
      const entered = window.prompt(
        'Part Studio to insert the generated feature into\n' +
        'did (document id), wvm (w=workspace, v=version, m=microversion), wvmid (workspace id) and eid (Part Studio element id):',
        initial
      );
      if (entered == null) return;
      try {
        host.setPartStudioTarget(entered);
      } catch (error) {
        host.reportMessage(error instanceof Error ? error.message : String(error));
      }
    },
    /**
     * Run: insert the feature the graph defines into the configured Part Studio
     * (#2). The Feature Studio target is the *defining* element (namespace), the
     * Part Studio target is the *consumer*; both are required, and every message
     * goes through `App.reportMessage()` so #4's log panel picks it up.
     */
    async runRun() {
      const host = this.featureStudioHost();
      if (host == null) return;

      if (host.getFeatureStudioTarget() == null) {
        host.reportMessage('Run needs the Feature Studio that defines the feature: set the Upload Target first.');
        return;
      }
      if (host.getPartStudioTarget() == null) {
        await this.runSelectPartStudioTarget();
        if (host.getPartStudioTarget() == null) return;
      }

      const description: GeneratedFeatureDescription | undefined = this.controls?.studioEvents.describe();
      if (description == null) {
        host.reportMessage('Nothing to run: the editor is not ready yet.');
        return;
      }
      if (description.ok !== true) {
        host.reportMessage(description.message);
        return;
      }

      await host.insertPartStudioFeature({
        featureType: description.featureType,
        featureName: description.featureName,
        parameters: description.parameters,
      });
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
    @settings="runSettings" @upload="runUpload" @target="runSelectTarget"
    @run-target="runSelectPartStudioTarget" />
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

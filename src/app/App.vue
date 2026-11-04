<script lang="ts">
import { defineComponent } from 'vue';
import TopBar from './components/TopBar.vue'
import AppDialog from './components/AppDialog.vue';
import { promptText, dialogService } from './ui/dialog';
import { editorSettings, matchCommand } from './ui/editorSettings';
import { createEditor, createEditorDev } from './rete';
import BottomBar from './components/BottomBar.vue';
import LogPanel from './components/LogPanel.vue';

import { inject } from 'vue'
import ToolTip from './components/tooltip/ToolTip.vue';
import { editorBase, EditorControls } from './rete/editorbase.js';
import { formatTarget, type FeatureStudioTarget } from './onshape-utils/featurestudiotarget';
import type { GraphIdentity } from './onshape-utils/graphidentity';
import type { FeatureInsertion } from './onshape-utils/partstudiofeature';
import type { GeneratedFeatureDescription } from './rete/graph-codegen';
import { BuildLogStore, type LogSeverity } from './logging/buildlog';

/**
 * The slice of `App` the toolbar needs for the Feature Studio upload (#1) and
 * the Part Studio insert (#2). Declared here rather than imported from `./app`
 * to keep the App <-> App.vue import one-way.
 */
interface FeatureStudioHost {
  /** #4: the build/upload/run log rendered by LogPanel.vue. */
  log: BuildLogStore;
  /** #31: the active graph, whose recorded ids form the deploy target. */
  activeGraphIdentity?: GraphIdentity;
  getFeatureStudioTarget(): FeatureStudioTarget | undefined;
  /** #31: resolve the active graph, or offer "Make new node graph". */
  ensureGraphForDeploy(graphName: string): Promise<unknown> | unknown;
  /** #31: `+` — an additional graph with its own studio and element. */
  createAdditionalGraph(graphName: string): Promise<unknown> | unknown;
  getPartStudioTarget(): FeatureStudioTarget | undefined;
  setPartStudioTarget(target: string): unknown;
  suggestPartStudioTarget(): string;
  /**
   * #2: resolve (and persist) the active document's single Part Studio.
   * Returns the target when exactly one Part Studio exists, else `undefined`.
   */
  resolveSinglePartStudioTarget(): Promise<unknown> | unknown;
  reportMessage(message: string, severity?: LogSeverity, source?: string): void;
  reportBuildResult(source: string | undefined, failure?: string): void;
  insertPartStudioFeature(feature: FeatureInsertion): Promise<unknown>;
  uploadFeatureStudio(source: string | undefined): Promise<unknown>;
  /** #6: the editor's serialized graph, once the editor exists. */
  serializedGraphProvider?: (() => string | undefined) | undefined;
  /** #6: save the open graph to its element, verified by read-back. */
  saveGraph(graphName: string): Promise<unknown> | unknown;
}

/**
 * #4: rendered only when the injected `App` is missing (a bare component
 * mount); module-level so Vue does not have to proxy a class instance in data.
 */
const fallbackLogStore = new BuildLogStore();

export default defineComponent({
  components: {
    TopBar: TopBar,
    AppDialog: AppDialog,
    BottomBar: BottomBar,
    LogPanel: LogPanel,
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
      controls: null as EditorControls | null,
      /** #31: name of the graph the deploy target is resolved for. */
      graphName: 'My Graph'
    }
  },
  computed: {
    /** #4: the App-owned log, or a local one when there is no injected App. */
    logStore(): BuildLogStore {
      return this.featureStudioHost()?.log ?? fallbackLogStore;
    }
  },
  async mounted() {
    window.addEventListener('keydown', this.onShortcutKeydown);
    let editorControls: EditorControls;
    const dev = inject('developerMode');

    if (dev === true) {
      editorControls = await createEditorDev(this.$refs.rete as HTMLElement);
    } else {
      editorControls = await createEditor(this.$refs.rete as HTMLElement);
    }
    this.controls = editorControls;
    // #6: the App's save path reads the open graph through this provider.
    const host = this.featureStudioHost();
    if (host != null) {
      host.serializedGraphProvider = () => editorControls.serializeGraph();
    }
  },
  beforeUnmount() {
    window.removeEventListener('keydown', this.onShortcutKeydown);
  },
  methods: {
    /** The injected `App` instance (see the `inject: { app }` option above). */
    featureStudioHost(): FeatureStudioHost | null {
      return ((this as unknown as { app?: FeatureStudioHost | null }).app) ?? null;
    },
    /** #4: Build -> a typed log entry (with the generated source when it works). */
    async runBuild() {
      const host = this.featureStudioHost();
      try {
        const featurescript = await this.controls?.studioEvents.build();
        host?.reportBuildResult(featurescript);
      } catch (error) {
        host?.reportBuildResult(undefined, error instanceof Error ? error.message : String(error));
      }
    },
    /**
     * #31: the deploy target is the active document plus the active graph's
     * recorded element ids, resolved against the document's elements. With no
     * active graph yet (first open in a document), offer "Make new node
     * graph"; the name prompt is the graph selector until a graph list UI
     * exists.
     */
    async runSelectTarget() {
      const host = this.featureStudioHost();
      if (host == null) return;
      if (host.getFeatureStudioTarget() != null) {
        host.reportMessage(
          'Deploy target is the active document and the active graph\'s Feature Studio (resolved by its recorded element id).',
        );
        return;
      }
      const name = await promptText({
        title: 'Name for the new node graph',
        label: 'Graph name',
        initialValue: this.graphName,
      });
      if (name == null || name.trim() === '') return;
      await host.ensureGraphForDeploy(name);
      this.graphName = host.activeGraphIdentity?.graphName ?? name.trim();
    },
    /** #31: `+` — an additional graph with its own studio and element. */
    async runNewGraph() {
      const host = this.featureStudioHost();
      if (host == null) return;
      const name = await promptText({
        title: 'Name for the additional node graph',
        label: 'Graph name',
        initialValue: 'Another Graph',
      });
      if (name == null || name.trim() === '') return;
      await host.createAdditionalGraph(name);
      this.graphName = host.activeGraphIdentity?.graphName ?? name.trim();
    },
    /** #31: first open in a document offers "Make new node graph". */
    async ensureGraphOrReport(source: string): Promise<boolean> {
      const host = this.featureStudioHost();
      if (host == null) return false;
      if (host.getFeatureStudioTarget() != null) return true;
      const name = await promptText({
        title: 'No node graph in this document yet. Name for the new node graph',
        label: 'Graph name',
        initialValue: this.graphName,
      });
      if (name == null || name.trim() === '') return false;
      await host.ensureGraphForDeploy(name);
      this.graphName = host.activeGraphIdentity?.graphName ?? name.trim();
      if (host.getFeatureStudioTarget() == null) {
        host.reportMessage(
          `${source} needs a node graph in the active document: make one with the graph target button.`,
          'error',
          source === 'Upload' ? 'upload' : 'run',
        );
        return false;
      }
      return true;
    },
    /** Build the graph and write its FeatureScript into the target Feature Studio. */
    async runUpload() {
      const host = this.featureStudioHost();
      if (host == null) return;
      if (host.getFeatureStudioTarget() == null) {
        if (!(await this.ensureGraphOrReport('Upload'))) return;
      }
      try {
        const featurescript = await this.controls?.studioEvents.build();
        await host.uploadFeatureStudio(featurescript);
      } catch (error) {
        host.reportMessage(
          `Upload failed: ${error instanceof Error ? error.message : String(error)}`,
          'error',
          'upload',
        );
      }
    },
    /**
     * Ask for the Part Studio target (`did`, `wvm`, `wvmid`, `eid`) and persist
     * it. Mirrors `runSelectTarget`; same parser and validation, different
     * storage key, because a Part Studio and a Feature Studio are never the same
     * element.
     */
    /**
     * Manual Part Studio target entry — the fallback of last resort.
     *
     * #2: `runRun()` tries the single-Part-Studio auto-resolution first and
     * only reaches this prompt when the document has zero or multiple Part
     * Studios. Uses the in-app dialog service (#34); never a browser default.
     */
    async runSelectPartStudioTarget() {
      const host = this.featureStudioHost();
      if (host == null) return;
      const current = host.getPartStudioTarget();
      const initial = current != null ? formatTarget(current) : host.suggestPartStudioTarget();
      const entered = await promptText({
        title: 'Part Studio target',
        label: 'Part Studio to insert the generated feature into',
        body: 'did (document id), wvm (w=workspace, v=version, m=microversion), wvmid (workspace id) and eid (Part Studio element id):',
        initialValue: initial,
        submitLabel: 'Set target',
        mono: true,
      });
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
        host.reportMessage('Run needs the Feature Studio that defines the feature: make a node graph first.', 'warning', 'run');
        return;
      }
      // #2: no consumer target yet. First auto-resolve the active document's
      // single Part Studio — no raw-id prompt when exactly one exists. Only
      // zero or multiple Part Studios fall back to the manual dialog prompt.
      if (host.getPartStudioTarget() == null) {
        await host.resolveSinglePartStudioTarget();
      }
      if (host.getPartStudioTarget() == null) {
        await this.runSelectPartStudioTarget();
        if (host.getPartStudioTarget() == null) return;
      }

      const description: GeneratedFeatureDescription | undefined = this.controls?.studioEvents.describe();
      if (description == null) {
        host.reportMessage('Nothing to run: the editor is not ready yet.', 'warning', 'run');
        return;
      }
      if (description.ok !== true) {
        host.reportMessage(description.message, 'warning', 'run');
        return;
      }

      await host.insertPartStudioFeature({
        featureType: description.featureType,
        featureName: description.featureName,
        parameters: description.parameters,
      });
    },
    /** #6: write the open graph to its element; App reports the verified outcome. */
    async runSave() {
      const host = this.featureStudioHost();
      if (host == null) return;
      await host.saveGraph(this.graphName);
    },
    runOpen() {

    },
    /** #36: open the settings dialog via the shared #34 dialog service. */
    async runSettings() {
      await dialogService.openSettings();
    },
    /**
     * #36: dispatch a keydown through the shortcut registry. No-ops while a
     * dialog is open or the user is typing (matchCommand enforces the latter).
     */
    async onShortcutKeydown(event: KeyboardEvent) {
      if (dialogService.current != null) return;
      const command = matchCommand(event, event.target, editorSettings.getBindings());
      if (command == null) return;
      event.preventDefault();
      switch (command) {
        case 'build': await this.runBuild(); break;
        case 'run': await this.runRun(); break;
        case 'upload': await this.runUpload(); break;
        case 'settings': await this.runSettings(); break;
        case 'fitView': await this.controls?.fitView(); break;
        case 'deleteSelected': {
          const removed = await this.controls?.deleteSelectedNodes();
          if (removed != null && removed > 0) {
            this.featureStudioHost()?.reportMessage(`Deleted ${removed} selected node${removed === 1 ? '' : 's'}.`);
          }
          break;
        }
      }
    },
    runSearch() {

    },
    /**
     * #30: "Locate" on a design check row. Select the node; a no-op when the
     * canvas is not ready or the node is gone. (Scrolling the viewport to the
     * selection is not implemented yet — the canvas does not expose a
     * scroll-to-node API.)
     */
    runLocateNode(nodeId: string) {
      this.controls?.selectNode(nodeId);
    },
  },
})
</script>

<template>
  <TopBar :project-name="graphName" :log="logStore" @build="runBuild" @run="runRun" @save="runSave" @open="runOpen"
    @settings="runSettings" @upload="runUpload" @target="runSelectTarget" @new-graph="runNewGraph"
    @run-target="runSelectPartStudioTarget" @locate-node="runLocateNode" />
  <main class="rete" ref="rete"></main>
  <BottomBar :graph-name="graphName" @search="runSearch" />
  <LogPanel :store="logStore" />
  <ToolTip />
  <AppDialog />
</template>

<style scoped>
@use './common.css' as *;
@use './customization/background.css' as *;

header {
  line-height: 1.5;
}

.rete {
  margin: 0;
  /* Canvas is near-white; the graph is the hero (STYLE_GUIDE.md). */
  background: var(--canvas-bg);
  border-radius: 0em;
  text-align: left;
  border: none;
  line-height: 1;
}
</style>

<script lang="ts">
import { defineComponent, watch } from 'vue';
import TopBar from './components/TopBar.vue'
import AppDialog from './components/AppDialog.vue';
import DebugGrid from './components/DebugGrid.vue';
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
import type { GroupBoundaryState } from './rete/groups/group-editor';
import type { SpecResolver } from './rete/serialization/graph-schema-types';
import type { FeatureInsertion } from './onshape-utils/partstudiofeature';
import type { GeneratedFeatureDescription } from './rete/graph-codegen';
import { BuildLogStore, type LogSeverity } from './logging/buildlog';
import NodePalette from './components/NodePalette.vue';
import ActionPalette from './components/ActionPalette.vue';
import DocumentationPanel from './components/DocumentationPanel.vue';
import { onDocHelp, type DocHelpRequest } from './docs/help-request';
import type { DocSectionId } from './docs/types';
import GroupConfigPanel from './components/GroupConfigPanel.vue';
import FeatureConfigPanel from './components/FeatureConfigPanel.vue';
import type { DefineFeatureState } from './rete/nodes/definefeaturenode';
import { buildPaletteInsertables, type PaletteInsertable } from './rete/catalog-node-factory';
import { canDispatchAction } from './ui/actionPalette';
import type { CommandId } from './ui/editorSettings';
import { defaultCatalog } from './onshape/catalog/spec-catalog';
import type { DebugNodeSource, DebugSelection, EvalFeatureScriptApiLike } from './onshape-utils/evalfeaturescript';
import { selectedNodeIds } from './rete/modified-rete/connection-raise';

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
  /** #6: replace the editor's contents with a stored graph. */
  loadGraphProvider?: ((reteJSON: string, resolveSpec: SpecResolver) => Promise<{ nodes: number; warnings: string[] }>) | undefined;
  /** #6: save the open graph to its element, verified by read-back. */
  saveGraph(graphName: string): Promise<unknown> | unknown;
  /** #6: pick, confirm, and load a saved graph. */
  openGraph(): Promise<unknown> | unknown;
  /** #16: the injected Part Studio API for the debug grid's eval call. */
  onshape?: { partStudioApi: { evalFeatureScript: (request: Record<string, unknown>) => Promise<unknown> } } | undefined;
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
    DebugGrid: DebugGrid,
    BottomBar: BottomBar,
    LogPanel: LogPanel,
    NodePalette: NodePalette,
    ActionPalette: ActionPalette,
    GroupConfigPanel: GroupConfigPanel,
    FeatureConfigPanel: FeatureConfigPanel,
    DocumentationPanel: DocumentationPanel,
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
      graphName: 'My Graph',
      /** #8: catalog palette visibility. */
      paletteOpen: false,
      /** #73: action palette (Search button / F3) visibility. */
      actionsOpen: false,
      /** #73: group definitions offered by the node palette; refreshed on open. */
      paletteGroupDefs: [] as { id: string; name: string }[],
      /** #14: group editing breadcrumb, from the toolbar down to the open group. */
      groupBreadcrumb: [] as string[],
      /** Group config: true while editing a group (breadcrumb past top level). */
      groupEditing: false,
      /** Group config: Start/End Feature panel visibility. */
      groupPanelOpen: false,
      /** Group config: live boundary state for the panel; null at top level. */
      groupBoundaryState: null as GroupBoundaryState | null,
      /** Feature config: the Define Feature node currently selected. */
      selectedDefineFeatureId: null as string | null,
      /** Feature config: FeatureConfigPanel visibility. */
      featurePanelOpen: false,
      /** Feature config: live parameter state for the panel. */
      featureState: null as DefineFeatureState | null,
      /** #16: debug grid panel visibility plus a graph-change pulse the panel debounces. */
      debugGridOpen: false,
      debugGraphVersion: 0,
      debugGraphTimer: null as ReturnType<typeof setInterval> | null,
      debugGraphSignature: '',
      /** Documentation panel: visibility, plus the section/topic it opens at. */
      docsOpen: false,
      docsSection: undefined as DocSectionId | undefined,
      docsTopic: undefined as string | undefined,
      /** Documentation: unsubscribe for the node help request bus. */
      docHelpUnsubscribe: null as (() => void) | null,
      catalogEntries: defaultCatalog.entries
    }
  },
  computed: {
    /** #4: the App-owned log, or a local one when there is no injected App. */
    logStore(): BuildLogStore {
      return this.featureStudioHost()?.log ?? fallbackLogStore;
    },
    /**
     * #16: debug grid inputs. Nodes/selections are rebuilt from the canvas
     * whenever the graph pulse fires; the target/microversion come from the
     * stored Part Studio target (microversion known only for `m` targets —
     * the panel's no-target state covers the rest).
     */
    debugSources(): { nodes: DebugNodeSource[]; selections: DebugSelection[] } {
      void this.debugGraphVersion;
      return this.controls?.debugSources?.() ?? { nodes: [], selections: [] };
    },
    debugNodes(): DebugNodeSource[] {
      return this.debugSources.nodes;
    },
    debugSelections(): DebugSelection[] {
      return this.debugSources.selections;
    },
    debugTarget(): FeatureStudioTarget | null {
      return this.featureStudioHost()?.getPartStudioTarget() ?? null;
    },
    debugMicroversion(): string | null {
      const target = this.debugTarget;
      return target != null && target.wvm === 'm' ? target.wvmid : null;
    },
    /** #73: live shortcut bindings for the action palette keycaps. */
    bindings() {
      return editorSettings.getBindings();
    },
    /** #73: the full insertable catalog for the node palette. */
    paletteInsertables(): PaletteInsertable[] {
      return buildPaletteInsertables(this.catalogEntries, this.paletteGroupDefs);
    },
    debugApi(): EvalFeatureScriptApiLike | null {
      const api = this.featureStudioHost()?.onshape?.partStudioApi;
      return api != null ? (api as unknown as EvalFeatureScriptApiLike) : null;
    },
  },
  watch: {
    /** #16: while the grid is open, pulse on graph change (panel debounces it). */
    debugGridOpen(open: boolean) {
      if (this.debugGraphTimer != null) {
        clearInterval(this.debugGraphTimer);
        this.debugGraphTimer = null;
      }
      if (!open) return;
      this.debugGraphSignature = this.controls?.serializeGraph() ?? '';
      this.debugGraphTimer = setInterval(() => {
        const signature = this.controls?.serializeGraph() ?? '';
        if (signature !== this.debugGraphSignature) {
          this.debugGraphSignature = signature;
          this.debugGraphVersion += 1;
        }
      }, 1500);
    },
  },
  async mounted() {
    window.addEventListener('keydown', this.onShortcutKeydown);
    // Documentation: node cards request their topic through a small
    // module-level bus (they are rendered by rete, not as App children).
    this.docHelpUnsubscribe = onDocHelp((request: DocHelpRequest) => this.openDocs(request));
    // Blender-style: selecting a group's Start/End card opens the config
    // panel. Subscribes to the shared `selectedNodeIds` ref (no document
    // listeners); selecting an unrelated node never opens the panel.
    // Selecting a Define Feature node opens the feature-parameter panel.
    watch(selectedNodeIds, (ids: string[]) => {
      this.onBoundarySelected(ids);
      this.onDefineFeatureSelected(ids);
    });
    let editorControls: EditorControls;
    const dev = inject('developerMode');

    if (dev === true) {
      editorControls = await createEditorDev(this.$refs.rete as HTMLElement);
    } else {
      editorControls = await createEditor(this.$refs.rete as HTMLElement);
    }
    this.controls = editorControls;
    // QA harness hook: the browser checks (qa/harness/*) assert live editor
    // state through the same controls the UI calls, not a re-implementation.
    (window as unknown as { controls?: EditorControls }).controls = editorControls;
    // Live group I/O: wire binds/rebinds/unbinds refresh the open panel
    // state immediately (read-only — refreshGroupBoundaryState never opens
    // the panel or writes back, so this cannot loop).
    editorControls.setGroupBoundaryChangedCallback?.(() => {
      if (this.groupEditing) this.refreshGroupBoundaryState();
    });
    // #6: the App's save path reads the open graph through this provider.
    const host = this.featureStudioHost();
    if (host != null) {
      host.serializedGraphProvider = () => editorControls.serializeGraph();
      host.loadGraphProvider = (reteJSON, resolveSpec) => editorControls.loadGraph(reteJSON, resolveSpec);
    }
  },
  beforeUnmount() {
    window.removeEventListener('keydown', this.onShortcutKeydown);
    this.docHelpUnsubscribe?.();
    this.docHelpUnsubscribe = null;
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
    /** #6: pick, confirm, and load a saved graph; adopt its name on success. */
    async runOpen() {
      const host = this.featureStudioHost();
      if (host == null) return;
      const outcome = (await host.openGraph()) as { status?: string; graphName?: string } | null;
      if (outcome?.status === 'opened' && typeof outcome.graphName === 'string') {
        this.graphName = outcome.graphName;
      }
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
      // #14: Tab enters/exits a group, M mutes the selection. Neither is a
      // registered command, and neither may fire while typing.
      const target = event.target as HTMLElement | null;
      const typing = target != null && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (!typing && event.key === 'Tab') {
        // Group enter/exit is a canvas gesture only. Tab on toolbar,
        // panel, dialog or any other chrome must stay normal browser
        // focus navigation — intercepting it there used to enter/exit
        // the group (and can literally empty the canvas).
        const onCanvas = target === document.body || target?.closest?.('main.rete') != null;
        const chrome =
          target?.closest?.(
            'button, a, input, textarea, select, [contenteditable], [role="button"], dialog, [role="dialog"], .group-config-panel, .action-palette',
          ) != null;
        // Only hijack Tab when it can actually enter/exit a group — otherwise
        // the browser's normal focus navigation (into the toolbar, etc.) must
        // happen so Tab from body is not trapped on BODY.
        const canToggle = this.controls?.canToggleGroupEdit?.() ?? true;
        if (onCanvas && !chrome && canToggle) {
          event.preventDefault();
          await this.runToggleGroupEdit();
        }
        return;
      }
      if (!typing && (event.key === 'm' || event.key === 'M')) {
        const muted = await this.controls?.toggleMuteSelected();
        if (muted != null && muted > 0) {
          this.featureStudioHost()?.reportMessage(`Muted ${muted} selected node${muted === 1 ? '' : 's'} (M toggles).`);
        }
        return;
      }
      const command = matchCommand(event, event.target, editorSettings.getBindings());
      if (command == null) return;
      event.preventDefault();
      await this.runCommand(command);
    },
    /**
     * #14: turn the selected nodes into a node group. The registry shortcut
     * (Ctrl+Shift+G), the action palette and the toolbar all land here; the
     * editor reports failures (no selection, ungroupable kind, cycle) through
     * the status bar, never a browser dialog.
     */
    async runCreateGroup() {
      try {
        const instance = await this.controls?.createGroupFromSelection();
        if (instance != null) {
          this.featureStudioHost()?.reportMessage(`Created group \u201c${instance.getTitle()}\u201d from the selection. Select it and press Tab to edit it.`);
        } else {
          this.featureStudioHost()?.reportMessage('Nothing to group: select at least one node first (frames and define/output features cannot be grouped).', 'warning', 'group');
        }
      } catch (error) {
        this.featureStudioHost()?.reportMessage(error instanceof Error ? error.message : String(error), 'warning', 'group');
      }
    },
    /**
     * #73: dispatch a command by id — the one path shortcuts and the
     * action palette share. No-ops while a dialog is open.
     */
    async runCommand(command: CommandId) {
      if (!canDispatchAction({ dialogOpen: dialogService.current != null })) return;
      switch (command) {
        case 'build': await this.runBuild(); break;
        case 'run': await this.runRun(); break;
        case 'upload': await this.runUpload(); break;
        case 'save': await this.runSave(); break;
        case 'open': await this.runOpen(); break;
        case 'addNode': this.refreshPaletteGroupDefs(); this.paletteOpen = true; break;
        case 'settings': await this.runSettings(); break;
        case 'debugGrid': this.debugGridOpen = !this.debugGridOpen; break;
        case 'fitView': await this.controls?.fitView(); break;
        case 'deleteSelected': {
          const removed = await this.controls?.deleteSelectedNodes();
          if (removed != null && removed > 0) {
            this.featureStudioHost()?.reportMessage(`Deleted ${removed} selected node${removed === 1 ? '' : 's'}.`);
          }
          break;
        }
        case 'copy': {
          const copied = this.controls?.copySelection() ?? 0;
          if (copied > 0) {
            this.featureStudioHost()?.reportMessage(`Copied ${copied} node${copied === 1 ? '' : 's'}.`);
          }
          break;
        }
        case 'paste': {
          const pasted = (await this.controls?.pasteClipboard()) ?? 0;
          if (pasted > 0) {
            this.featureStudioHost()?.reportMessage(`Pasted ${pasted} node${pasted === 1 ? '' : 's'}.`);
          }
          break;
        }
        case 'createFrame': {
          const frame = await this.controls?.createFrameFromSelection();
          if (frame != null) {
            this.featureStudioHost()?.reportMessage(`Grouped selection into frame “${frame.label}”.`);
          }
          break;
        }
        case 'createGroup': await this.runCreateGroup(); break;
        // #73: F3 / the bottom Search button opens the action palette.
        case 'actionPalette': this.actionsOpen = true; break;
      }
    },
    /** Group config: refresh the panel state from the editor controls. */
    refreshGroupBoundaryState() {
      this.groupBoundaryState = this.controls?.getGroupBoundaryState() ?? null;
    },
    /**
     * Blender-style: if the selection now includes the Start/End card of
     * the group being edited, open the config panel (and refresh its
     * state). Any other selection — including an empty one — leaves the
     * panel as it is. Leaving group editing closes it (runToggleGroupEdit).
     */
    onBoundarySelected(ids: string[]) {
      if (!this.groupEditing) return;
      const boundary = this.groupBoundaryState?.boundaryNodeIds;
      const isBoundary = (id: string) =>
        (boundary != null && (id === boundary.input || id === boundary.output)) ||
        (this.controls?.isGroupBoundaryNode?.(id) ?? false);
      if (ids.some(isBoundary)) {
        this.refreshGroupBoundaryState();
        this.groupPanelOpen = true;
      }
    },
    /**
     * Group config: Tab enter/exit lands here. Entering a group refreshes
     * the boundary state but does NOT open the panel — it opens on Start /
     * End Feature selection (onBoundarySelected) or the TopBar toggle.
     * Leaving to the top level closes it. The canvas is never blocked.
     */
    async runToggleGroupEdit() {
      this.applyGroupBreadcrumb(await this.controls?.toggleGroupEdit() ?? []);
      if (this.groupEditing) {
        // The Start/End cards sit outside the member bounds; fit so the user
        // actually sees the group boundary instead of off-screen chrome.
        await this.controls?.fitView();
      }
    },
    /**
     * Group config: shared landing for Tab and the breadcrumb. Refreshing the
     * boundary state keeps the panel honest; leaving a group always closes it.
     */
    applyGroupBreadcrumb(breadcrumb: string[]) {
      this.groupBreadcrumb = breadcrumb;
      this.groupEditing = breadcrumb.length > 1;
      if (this.groupEditing) {
        this.refreshGroupBoundaryState();
        this.groupPanelOpen = false;
      } else {
        this.groupPanelOpen = false;
        this.groupBoundaryState = null;
      }
    },
    /**
     * Topbar breadcrumb: leave groups until `depth` remain (segment index;
     * 0 = top level). One-level Tab semantics live in runToggleGroupEdit and
     * are untouched — this is the explicit "jump out to here" path.
     */
    async runExitGroupTo(depth: number) {
      if (this.controls?.exitGroupTo == null) return;
      this.applyGroupBreadcrumb(await this.controls.exitGroupTo(depth));
      await this.controls.fitView();
    },
    /** Documentation: open the panel, optionally at a section/topic. */
    openDocs(request: { topic?: string; section?: DocSectionId } = {}) {
      this.docsSection = request.section;
      this.docsTopic = request.topic;
      this.docsOpen = true;
    },
    /** Documentation: close the panel and clear its target for the next open. */
    closeDocs() {
      this.docsOpen = false;
      this.docsSection = undefined;
      this.docsTopic = undefined;
    },
    /** Group config: toolbar button toggles the panel while editing a group. */
    toggleGroupConfigPanel() {
      if (!this.groupEditing) return;
      this.groupPanelOpen = !this.groupPanelOpen;
      if (this.groupPanelOpen) this.refreshGroupBoundaryState();
    },
    /** Group config: panel closed; boundary state is refreshed on next open. */
    closeGroupConfigPanel() {
      this.groupPanelOpen = false;
    },
    /** Group config: rename/retype a boundary socket, then refresh. */
    async onGroupConfigUpdate(payload: { socketId: string; direction: 'input' | 'output'; patch: { label?: string; valueType?: string } }) {
      await this.controls?.updateGroupBoundarySocket(payload.socketId, payload.patch, payload.direction);
      this.refreshGroupBoundaryState();
    },
    /** Group config: create an arbitrary (unbound) socket, then refresh. */
    async onGroupConfigAddAny(payload: { direction: 'input' | 'output'; label: string; valueType: string }) {
      await this.controls?.addGroupBoundarySocketAny(payload.direction, payload.label, payload.valueType);
      this.refreshGroupBoundaryState();
    },
    /** Group config: remove a boundary socket, then refresh. */
    async onGroupConfigRemove(payload: { socketId: string; direction: 'input' | 'output' }) {
      await this.controls?.removeGroupBoundarySocket(payload.socketId, payload.direction);
      this.refreshGroupBoundaryState();
    },
    /** Feature config: refresh the panel state from the editor controls. */
    refreshFeatureState(nodeId?: string) {
      const state = this.controls?.getDefineFeatureState(nodeId ?? this.selectedDefineFeatureId ?? undefined) ?? null;
      this.featureState = state;
      this.selectedDefineFeatureId = state?.nodeId ?? null;
    },
    /**
     * Feature config: selecting a Define Feature node opens the parameter
     * panel. Moving the selection away closes it (the TopBar "Feature
     * parameters" button reopens it for the current selection).
     */
    onDefineFeatureSelected(ids: string[]) {
      const defineId = ids.find((id) => (this.controls?.isDefineFeatureNode?.(id) ?? false)) ?? null;
      this.selectedDefineFeatureId = defineId;
      if (defineId != null) {
        this.refreshFeatureState(defineId);
        this.featurePanelOpen = true;
      } else if (this.featurePanelOpen) {
        this.featurePanelOpen = false;
        this.featureState = null;
      }
    },
    /** Feature config: toolbar/rail button toggles the parameter panel for the current selection. */
    toggleFeatureConfigPanel() {
      if (this.featurePanelOpen && this.featureState != null) {
        this.closeFeatureConfigPanel();
        return;
      }
      this.refreshFeatureState();
      this.featurePanelOpen = this.featureState != null;
    },
    /** Feature config: panel closed; state is refreshed on next open. */
    closeFeatureConfigPanel() {
      this.featurePanelOpen = false;
      this.featureState = null;
    },
    /** Feature config: rename the feature (annotation + node title apply). */
    async onFeatureNameUpdate(name: string) {
      await this.controls?.setDefineFeatureName(name, this.selectedDefineFeatureId ?? undefined);
      this.refreshFeatureState();
    },
    /** Feature config: add a parameter, then refresh. */
    async onFeatureParamAdd(payload: { name: string; valueType: string }) {
      await this.controls?.addDefineFeatureParameter(payload.name, payload.valueType, this.selectedDefineFeatureId ?? undefined);
      this.refreshFeatureState();
    },
    /** Feature config: rename/retype a parameter, then refresh. */
    async onFeatureParamUpdate(payload: { socketKey: string; patch: { name?: string; valueType?: string } }) {
      await this.controls?.updateDefineFeatureParameter(payload.socketKey, payload.patch, this.selectedDefineFeatureId ?? undefined);
      this.refreshFeatureState();
    },
    /** Feature config: remove a parameter, then refresh. */
    async onFeatureParamRemove(payload: { socketKey: string }) {
      await this.controls?.removeDefineFeatureParameter(payload.socketKey, this.selectedDefineFeatureId ?? undefined);
      this.refreshFeatureState();
    },
    /** #73: group instances are runtime state; snapshot them when a palette opens. */
    refreshPaletteGroupDefs() {
      this.paletteGroupDefs = this.controls?.listGroupDefinitions().map(d => ({ id: d.id, name: d.name })) ?? [];
    },
    /** #73: an action chosen in the palette; guarded like any dispatch. */
    async onActionSelect(command: CommandId) {
      this.actionsOpen = false;
      if (!canDispatchAction({ dialogOpen: dialogService.current != null })) return;
      await this.runCommand(command);
    },
    /** #73 follow-up: a node chosen in the same search menu inserts it. */
    async onActionInsert(item: PaletteInsertable) {
      this.actionsOpen = false;
      await this.onPaletteSelect(item);
    },
    /** #73: the bottom Search button opens the Blender-style action palette. */
    runSearch() { this.actionsOpen = true; },
    /** #73: resolve a palette insertable to its creation path. */
    async onPaletteSelect(item: PaletteInsertable) {
      this.paletteOpen = false;
      if (item.entry != null) { await this.controls?.addNodeFromCatalog(item.entry); return; }
      if (item.arrayVariant != null) { await this.controls?.addArrayNode(item.arrayVariant); return; }
      if (item.isMathExpression === true) { await this.controls?.addMathExpressionNode(); return; }
      if (item.utilityId != null) { await this.controls?.addUtilityNode(item.utilityId); return; }
      if (item.groupDefinitionId != null) { await this.controls?.addGroupInstance(item.groupDefinitionId); }
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
  <TopBar :project-name="graphName" :group-breadcrumb="groupBreadcrumb" :group-editing="groupEditing" :feature-selected="selectedDefineFeatureId != null" :log="logStore" @build="runBuild" @run="runRun" @save="runSave" @open="runOpen"
    @settings="runSettings" @upload="runUpload" @target="runSelectTarget" @new-graph="runNewGraph"
    @run-target="runSelectPartStudioTarget" @locate-node="runLocateNode" @create-group="runCreateGroup" @toggle-group-config="toggleGroupConfigPanel" @toggle-feature-config="toggleFeatureConfigPanel"
    @help="openDocs()" @exit-group="runToggleGroupEdit" @exit-group-to="runExitGroupTo" />
  <main class="rete" ref="rete"></main>
  <!-- Slim rail tabs: explicit, always-visible affordances for the two config
       panels, shown only when the matching panel is closed. -->
  <button
    v-if="groupEditing && !groupPanelOpen"
    type="button"
    data-testid="group-panel-open-rail"
    class="panel-rail panel-rail--group"
    @click="toggleGroupConfigPanel"
  >
    Group inputs &amp; outputs
  </button>
  <button
    v-if="selectedDefineFeatureId != null && !featurePanelOpen"
    type="button"
    data-testid="feature-panel-open-rail"
    class="panel-rail panel-rail--feature"
    @click="toggleFeatureConfigPanel"
  >
    Feature parameters
  </button>
  <GroupConfigPanel
    v-if="groupPanelOpen && groupEditing"
    :state="groupBoundaryState"
    @update="onGroupConfigUpdate"
    @add-any="onGroupConfigAddAny"
    @remove="onGroupConfigRemove"
    @close="closeGroupConfigPanel"
  />
  <FeatureConfigPanel
    v-if="featurePanelOpen"
    :state="featureState"
    @update-name="onFeatureNameUpdate"
    @add="onFeatureParamAdd"
    @update-param="onFeatureParamUpdate"
    @remove-param="onFeatureParamRemove"
    @close="closeFeatureConfigPanel"
  />
  <BottomBar :graph-name="graphName" @search="runSearch" />
  <LogPanel :store="logStore" />
  <DocumentationPanel
    :open="docsOpen"
    :initial-section="docsSection"
    :initial-topic="docsTopic"
    @close="closeDocs"
  />
  <ToolTip />
  <ActionPalette :open="actionsOpen" :bindings="bindings" :insertables="paletteInsertables" @select="onActionSelect" @insert="onActionInsert" @close="actionsOpen = false" />
  <NodePalette :open="paletteOpen" :insertables="paletteInsertables" @select="onPaletteSelect" @close="paletteOpen = false" />
    <AppDialog />
    <!-- #16: debug grid (node-wrangler view); row click focuses the node. -->
    <DebugGrid
      :open="debugGridOpen"
      :nodes="debugNodes"
      :selections="debugSelections"
      :target="debugTarget"
      :api="debugApi"
      :microversion="debugMicroversion"
      :graph-version="debugGraphVersion"
      @close="debugGridOpen = false"
      @select-node="runLocateNode"
    />
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

/* Slim panel rails: explicit text affordances for the two config panels,
   shown only when the matching panel is closed. */
.panel-rail {
  position: fixed;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 19;
  writing-mode: vertical-rl;
  padding: 10px 4px;
  font-family: var(--font-sans);
  font-size: var(--font-size-label);
  font-weight: var(--font-weight-section);
  line-height: var(--line-height-title);
  color: var(--text-primary);
  background: var(--surface-panel);
  border: 1px solid var(--border-hairline);
  border-right: none;
  border-radius: var(--radius-control) 0 0 var(--radius-control);
  box-shadow: var(--shadow-1);
  cursor: pointer;
  box-sizing: border-box;
}

.panel-rail:hover {
  background: var(--hover-tint);
}

.panel-rail:focus-visible {
  border-color: var(--accent-steel);
  outline: none;
}

.panel-rail--feature { top: calc(50% - 80px); }
.panel-rail--group { top: calc(50% + 80px); }
</style>

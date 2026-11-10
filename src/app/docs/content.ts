/**
 * Authored documentation content and the assembled section tree.
 *
 * General and Design practice are written by hand. Nodes is generated from
 * the live palette catalog so every insertable node is covered. Keep prose
 * free of external URLs: this ships inside the app and must work offline.
 */
import { defaultCatalog } from '../onshape/catalog/spec-catalog';
import { buildPaletteInsertables, type PaletteInsertable } from '../rete/catalog-node-factory';
import { buildNodeTopics } from './node-docs';
import type { DocSection, DocTopic } from './types';

const GENERAL_TOPICS: DocTopic[] = [
  {
    id: 'general:overview',
    section: 'general',
    title: 'What the node editor does',
    summary: 'The node editor is a visual authoring surface for Onshape FeatureScript: build a graph, then build, upload or run it against a document.',
    body: [
      {
        kind: 'paragraph',
        text: 'The node editor turns a graph of typed nodes into FeatureScript. Each node is either a standard-library function, a high-level Onshape feature, an array/iteration construct or a reusable group, and each socket carries a value type so the graph can be checked before anything reaches Onshape.',
      },
      {
        kind: 'paragraph',
        text: 'A graph lives in a Feature Studio element inside a document. Building compiles and validates the graph, Upload writes the generated FeatureScript to that Feature Studio, and Run inserts the generated feature into the target Part Studio.',
      },
      {
        kind: 'steps',
        items: [
          'Open or create a node graph in the active document.',
          'Add nodes from the palette (Shift+A) or the action search (F3).',
          'Wire outputs into typed inputs; incompatible sockets are refused.',
          'Build (Ctrl+B) to compile and see errors in the status bar.',
          'Upload (Ctrl+Shift+U) to write the Feature Studio, or Run (Ctrl+Enter) to insert the feature.',
        ],
      },
      { kind: 'note', text: 'The graph is the source of truth. Editing FeatureScript in the Feature Studio does not flow back into the graph, and the next Upload replaces the generated body.' },
    ],
    related: ['general:canvas', 'general:workflow', 'practice:flow'],
  },
  {
    id: 'general:canvas',
    section: 'general',
    title: 'The canvas',
    summary: 'Pan and zoom the graph, read node cards, and use frames and groups to keep the layout legible.',
    body: [
      {
        kind: 'paragraph',
        text: 'Node cards are white with a hairline border on a warm off-white canvas. The header names the node; the body holds inputs, values and outputs. An output socket on the right can be dragged to a compatible input socket on another node.',
      },
      {
        kind: 'bullets',
        items: [
          'Drag empty canvas to pan; wheel to zoom; Ctrl+0 fits the whole graph in view.',
          'Select a node to sharpen its border and reveal its actions in the toolbar.',
          'Frames (Ctrl+G) are labelled regions that move their contents together — use them to mark stages of a model.',
          'Groups (Ctrl+Shift+G) are reusable subgraphs with declared inputs and outputs; Tab enters and leaves an instance.',
          'The status bar at the bottom carries warnings and errors. Nothing floats over the graph.',
        ],
      },
      { kind: 'note', text: 'Port fills encode value types (queries are teal, quantities amber, enums salmon and so on). The colour is data, not decoration; the tooltip and the socket label always name the type as well.' },
    ],
    related: ['general:overview', 'practice:groups'],
  },
  {
    id: 'general:workflow',
    section: 'general',
    title: 'Build, upload and run',
    summary: 'Build validates the graph, Upload writes FeatureScript to the target Feature Studio, and Run inserts the feature into a Part Studio.',
    body: [
      { kind: 'paragraph', text: 'The three verbs are deliberately separate so a failed build never half-writes a document.' },
      {
        kind: 'bullets',
        items: [
          'Build compiles the graph and reports schema, type and codegen errors. It does not touch Onshape.',
          'Upload writes the generated FeatureScript into the graph’s target Feature Studio element. The feature is then available in that document.',
          'Run ensures the graph is built, inserts the feature into the target Part Studio and opens it for editing.',
        ],
      },
      { kind: 'paragraph', text: 'The graph target is resolved per document: the editor uses the Part Studio and Feature Studio recorded in the graph identity, and asks you to choose when the document has none or several. The target is shown in the toolbar so you always know which document a button will write to.' },
      { kind: 'note', text: 'If Upload reports that the target is missing, re-resolve the graph target from the toolbar rather than creating a second Feature Studio by hand.' },
    ],
    related: ['general:documents', 'general:overview', 'general:status'],
  },
  {
    id: 'general:documents',
    section: 'general',
    title: 'Documents and targets',
    summary: 'Graphs are tied to a document: a Part Studio to run into and a Feature Studio to upload generated code to.',
    body: [
      {
        kind: 'paragraph',
        text: 'Every graph records the document it belongs to and the element ids it writes to. Opening a graph in a different document re-resolves those ids, and the toolbar shows the active target.',
      },
      {
        kind: 'bullets',
        items: [
          'A document can hold several graphs; each graph keeps its own target elements.',
          'When the document has exactly one Part Studio it is used automatically; otherwise the editor asks which one to use.',
          'The Feature Studio target is where Upload writes. Treat it as generated output, not as a second source of truth.',
          'Switching documents does not copy graphs; open the graph in its own document instead.',
        ],
      },
      { kind: 'note', text: 'A graph with no target can still be edited and built. Only Upload and Run need a resolved target.' },
    ],
    related: ['general:workflow', 'general:saving'],
  },
  {
    id: 'general:saving',
    section: 'general',
    title: 'Saving and opening graphs',
    summary: 'Save writes the graph to its element; Open loads a saved graph from the document.',
    body: [
      { kind: 'paragraph', text: 'The graph document stores nodes, wiring, frames, groups and view state. Saving is explicit (Ctrl+S); closing without saving discards the changes made since the last save.' },
      {
        kind: 'bullets',
        items: [
          'Open (Ctrl+O) lists the graphs saved in the active document.',
          'Save writes to the element recorded in the graph identity, creating one the first time.',
          'Frames and groups are serialized with the graph, so layout and reuse survive a reload.',
          'Undo history is per session and is not saved with the graph.',
        ],
      },
      { kind: 'note', text: 'If a save fails because the element was removed in Onshape, use Open to pick a new element before saving again — do not keep retrying the stale target.' },
    ],
    related: ['general:documents', 'general:workflow'],
  },
  {
    id: 'general:shortcuts',
    section: 'general',
    title: 'Keyboard and palettes',
    summary: 'The default shortcuts, and the two searchable palettes for adding nodes and running commands.',
    body: [
      { kind: 'paragraph', text: 'Shortcuts are defaults; the Settings dialog can rebind commands and shows the current binding beside each one. The same binding appears as a keycap in menus.' },
      {
        kind: 'table',
        headers: ['Action', 'Default', 'What it does'],
        rows: [
          ['Add node', 'Shift+A', 'Open the node palette and insert a node under the cursor or at the view centre.'],
          ['Search actions', 'F3', 'Search every command and node from one list.'],
          ['Build', 'Ctrl+B', 'Compile and validate the graph.'],
          ['Upload', 'Ctrl+Shift+U', 'Write generated FeatureScript to the target Feature Studio.'],
          ['Run', 'Ctrl+Enter', 'Insert the feature into the target Part Studio.'],
          ['Save', 'Ctrl+S', 'Save the graph to its element.'],
          ['Open', 'Ctrl+O', 'Pick a saved graph in the active document.'],
          ['Fit view', 'Ctrl+0', 'Zoom the canvas to fit all nodes.'],
          ['Frame selection', 'Ctrl+G', 'Wrap the selected nodes in a frame.'],
          ['Group selection', 'Ctrl+Shift+G', 'Turn the selected nodes into a reusable group.'],
          ['Delete selection', 'Delete', 'Remove the selected nodes and their wires.'],
          ['Settings', 'Ctrl+,', 'Open editor settings and shortcut bindings.'],
        ],
      },
      {
        kind: 'paragraph',
        text: 'Both palettes are keyboard-first: the search field is focused on open, Up and Down move the highlighted row, Enter chooses it and Escape closes the palette without inserting anything. Nothing is inserted until you press Enter or click a row.',
      },
    ],
    related: ['general:overview', 'practice:flow'],
  },
  {
    id: 'general:status',
    section: 'general',
    title: 'Status and warnings',
    summary: 'Problems are reported in the status bar and on node badges, never as floating overlays on the canvas.',
    body: [
      { kind: 'paragraph', text: 'The canvas stays clean. A node with a problem shows a small corner badge; its message appears in the fixed status bar at the bottom with an icon and an accent colour. Dismiss the message when you have read it, or open the node to fix the cause.' },
      {
        kind: 'bullets',
        items: [
          'Build errors name the node and the socket that failed.',
          'A statement node whose definition schema is unknown is marked as a generic-definition node — its remaining definition map must be completed in FeatureScript.',
          'Warnings are advisory; the graph can still build and upload.',
        ],
      },
      { kind: 'note', text: 'If the status bar is empty but a node looks wrong, select it: its toolbar actions and configuration panel show the current values and any validation message.' },
    ],
    related: ['general:workflow', 'practice:debugging'],
  },
];

const PRACTICE_TOPICS: DocTopic[] = [
  {
    id: 'practice:flow',
    section: 'design-practice',
    title: 'Read graphs left to right',
    summary: 'Data flows from left to right: values feed operations, and the shared context carries the model forward.',
    body: [
      { kind: 'paragraph', text: 'Lay a graph out so the eye can follow it: sources on the left, operations in the middle, results on the right. A reader should be able to trace one wire at a time without crossing the canvas.' },
      {
        kind: 'bullets',
        items: [
          'Give each stage its own frame with a short label — sketch, base solid, features, finishing.',
          'Keep the main path on one horizontal line; branch only for values that feed several nodes.',
          'Put reusable value nodes (queries, ids, constants) above the nodes that consume them.',
          'Do not route a wire backwards through a frame; move the source instead.',
        ],
      },
      { kind: 'note', text: 'Statement nodes also carry the shared context from left to right. If two statements are not chained by context, their order in the build is not guaranteed to be the visual order.' },
    ],
    related: ['general:canvas', 'practice:groups'],
  },
  {
    id: 'practice:statements-values',
    section: 'design-practice',
    title: 'Statement and value nodes',
    summary: 'Statement nodes change the model through the shared context; value nodes are pure expressions that can be shared.',
    body: [
      { kind: 'paragraph', text: 'A statement node runs inside the graph’s context: it reads and writes model state and passes the context on. A value node computes one value and has no side effects, so several consumers can share it without duplicating work.' },
      {
        kind: 'bullets',
        items: [
          'Use a value node for queries, ids, vectors and anything that is a pure function of its inputs.',
          'Use a statement node when the operation creates or changes bodies.',
          'Prefer one shared value node over several identical copies; the build reuses its output.',
          'Do not expect a value node to run in a particular order relative to statements — only data dependencies constrain it.',
        ],
      },
    ],
    related: ['practice:flow', 'practice:debugging'],
  },
  {
    id: 'practice:queries',
    section: 'design-practice',
    title: 'Queries, not selections',
    summary: 'Build entity selections as composable Q* queries so they follow the model when it changes.',
    body: [
      { kind: 'paragraph', text: 'A query is a description of which entities to act on, evaluated when the feature runs. This is what lets a graph survive an upstream change: the filter still describes the right faces after the model grows.' },
      {
        kind: 'bullets',
        items: [
          'Start broad — QEverything or QCreatedBy — then narrow with QBodyType, QGeometry, QAdjacent or QSketchRegion.',
          'Scope by feature id (QCreatedBy) rather than by position so earlier nodes remain the source of truth.',
          'Check that a query is non-empty with IsQueryEmpty before an operation that would fail on zero entities.',
          'Use QNthElement, QLargest or QClosestTo only when the model really guarantees that ordering.',
        ],
      },
      { kind: 'note', text: 'Queries are cheap to build and expensive to evaluate. Reusing one query node across several operations is both clearer and faster than rebuilding it each time.' },
    ],
    related: ['practice:statements-values', 'practice:units'],
  },
  {
    id: 'practice:units',
    section: 'design-practice',
    title: 'Numbers, units and tolerances',
    summary: 'Quantities carry units; vectors do not. Compare geometry with tolerances, not exact equality.',
    body: [
      { kind: 'paragraph', text: 'A ValueWithUnits is a number plus a unit. Lengths, angles and offsets are quantities, and the editor shows them as value controls rather than string literals. A Vector is unitless: its components take their meaning from the socket that consumes them.' },
      {
        kind: 'bullets',
        items: [
          'Enter a quantity with its unit; the graph stores the value and unit together.',
          'Do not strip units to reuse a number in a unitless socket — convert deliberately.',
          'Compare computed geometry with TolerantEquals or ApproximateResults; exact equality fails on floating-point noise.',
          'Prefer named constants over repeated literals when the same dimension appears in several nodes.',
        ],
      },
    ],
    related: ['practice:queries', 'general:status'],
  },
  {
    id: 'practice:arrays',
    section: 'design-practice',
    title: 'Arrays and iteration',
    summary: 'Build arrays with array nodes and iterate with a body that runs in the surrounding context.',
    body: [
      { kind: 'paragraph', text: 'Array nodes cover the common cases without writing FeatureScript: literal construction, concatenation, index, size, map and counted/for-each loops. Iteration nodes take a body and run it once per element.' },
      {
        kind: 'bullets',
        items: [
          'Use Map array when each element produces a value; use For each when the body changes the model.',
          'Guard Array index with Array size when the array can be empty.',
          'Keep iteration bodies small and single-purpose; nest only when the second level is genuinely two-dimensional.',
          'Name the iteration so a build error points at the right loop.',
        ],
      },
      { kind: 'note', text: 'Arrays of quantities, vectors and queries work the same way; the element type is shown on the socket so an array of the wrong type is rejected at wiring time.' },
    ],
    related: ['practice:flow', 'practice:groups'],
  },
  {
    id: 'practice:groups',
    section: 'design-practice',
    title: 'Frames and groups',
    summary: 'Frames organise the canvas; groups encapsulate a subgraph with declared inputs and outputs.',
    body: [
      { kind: 'paragraph', text: 'A frame is a labelled region that moves its nodes together — pure layout, no effect on the build. A group is a reusable subgraph with an explicit interface: inputs, outputs and a body that expands at build time.' },
      {
        kind: 'bullets',
        items: [
          'Frame stages of the model so the graph reads as a sequence.',
          'Group a subgraph when it will be reused or when it deserves a single, named interface.',
          'Give a group the smallest interface that works; pass values in rather than capturing nodes from outside.',
          'Tab enters an instance on the canvas and Tab again leaves it, so you can inspect the body in place.',
        ],
      },
    ],
    related: ['practice:flow', 'practice:naming'],
  },
  {
    id: 'practice:naming',
    section: 'design-practice',
    title: 'Naming and ids',
    summary: 'Use stable ids and clear node names so generated code and error messages stay readable.',
    body: [
      { kind: 'paragraph', text: 'Ids are how a graph refers to a feature or entity across builds. A stable id (MakeId) keeps references working when the model changes; a fresh id (NewId) is appropriate only for something that is genuinely new each run.' },
      {
        kind: 'bullets',
        items: [
          'Name nodes after what they produce, not after the operation: “Bolt circle”, not “OpPattern 2”.',
          'Use MakeId with a readable string for anything referenced by a later query.',
          'Keep names unique within a graph; duplicate names make the build log ambiguous.',
          'When you duplicate a subtree, rename the copies so the two paths remain distinguishable.',
        ],
      },
    ],
    related: ['practice:groups', 'practice:debugging'],
  },
  {
    id: 'practice:debugging',
    section: 'design-practice',
    title: 'Debugging a graph',
    summary: 'Work from the status bar outwards: read the error, inspect the node, then isolate the smallest failing subgraph.',
    body: [
      { kind: 'steps', items: [
        'Build and read the status bar message; it names the node and socket.',
        'Select the node and check its configuration panel and socket types.',
        'Disconnect the failing input and build again to confirm the source.',
        'Use the debug grid to inspect live values without changing the graph.',
        'If the graph is large, frame the failing stage and test it in isolation before reconnecting.',
      ] },
      { kind: 'paragraph', text: 'Most failures are one of three things: a query that selects nothing, a unit mismatch, or a statement node running before the context it needs. All three show up as an empty result or a type error at a specific socket.' },
      { kind: 'note', text: 'Warnings about a generic definition mean the node is missing part of its definition map. Either fill it in or replace the node with a higher-level feature node that already knows the schema.' },
    ],
    related: ['general:status', 'practice:queries', 'practice:units'],
  },
];

/** Build the full documentation tree. Pass the palette's insertables so the
 * Nodes section matches exactly what the user can insert. */
export function buildDocumentation(insertables: readonly PaletteInsertable[] = buildPaletteInsertables(defaultCatalog.entries)): DocSection[] {
  return [
    {
      id: 'general',
      title: 'General',
      blurb: 'What the editor is, how a graph reaches Onshape, and the controls around the canvas.',
      topics: GENERAL_TOPICS,
    },
    {
      id: 'design-practice',
      title: 'Design practice',
      blurb: 'How to lay out, name and debug a graph so it stays readable and rebuilds cleanly.',
      topics: PRACTICE_TOPICS,
    },
    {
      id: 'nodes',
      title: 'Nodes',
      blurb: 'Every insertable node and category, generated from the live catalog.',
      topics: buildNodeTopics(insertables),
    },
  ];
}

/** The documentation for the default catalog, built once per module load. */
export const DOC_SECTIONS: DocSection[] = buildDocumentation();

export const SECTION_ORDER: readonly DocSection['id'][] = ['general', 'design-practice', 'nodes'];

/**
 * Node documentation, derived from the live palette catalog.
 *
 * Every `PaletteInsertable` becomes a topic, so adding a node to the catalog
 * automatically adds it to the docs. Authored copy (`CURATED_BY_KEY` /
 * `CURATED_BY_TITLE`) explains the important nodes in editor terms; for the
 * long tail the scraped standard-library description is used, which is real
 * vendor documentation rather than a placeholder. The port table below each
 * topic comes from the catalog's typed sockets, so it cannot drift either.
 *
 * No topic links out to an external URL: the panel is in-app documentation.
 */
import type { PaletteInsertable } from '../rete/catalog-node-factory';
import type { CatalogPort } from '../onshape/catalog/types';
import type { DocBlock, DocTopic } from './types';

interface CategoryGuide {
  /** One-sentence answer shown in the topic summary and search. */
  blurb: string;
  /** Authored context paragraphs for the category overview topic. */
  paragraphs: string[];
  /** Recognisable nodes to start from. */
  startWith?: string[];
}

/** Authored overview for each palette category. Unknown categories get a
 * generated overview so a future catalog cannot ship an undocumented group. */
const CATEGORY_GUIDES: Readonly<Record<string, CategoryGuide>> = {
  Modeling: {
    blurb: 'Low-level modeling operations and the query language that selects the entities they act on.',
    paragraphs: [
      'Modeling covers the geometry kernel operations (booleans, fillets, extrudes, planes) and the Q* query filters that pick bodies, faces, edges and vertices. Statement nodes mutate the shared context; value nodes build queries and ids.',
      'Queries are lazy descriptions, not captured selections. A query node keeps working after the model changes, which is why filters compose: start from QEverything or QCreatedBy and narrow with QBodyType, QAdjacent or QSketchRegion.',
    ],
    startWith: ['QEverything', 'QCreatedBy', 'QBodyType', 'OpBoolean', 'OpRevolve', 'OpChamfer', 'MakeId', 'GetVariable'],
  },
  Math: {
    blurb: 'Pure value math: vectors, matrices, planes, coordinate systems, angles and tolerances.',
    paragraphs: [
      'Math nodes take values and return values. Nothing here touches the model, so they can be shared by several downstream nodes and re-evaluated freely on every build.',
      'Units travel with quantities. A Vector is unitless by itself; lengths and angles are ValueWithUnits values, and mixed-unit arithmetic fails at build time rather than silently converting.',
    ],
    startWith: ['Vector', 'Matrix', 'Transform', 'CoordSystem', 'Plane', 'Cross', 'Normalize', 'RotationMatrix3d', 'TolerantEquals', 'Math expression'],
  },
  Utilities: {
    blurb: 'Helpers for attributes, strings, paths, feature status and bookkeeping.',
    paragraphs: [
      'Utilities are ordinary standard-library functions surfaced as nodes: attribute get/set pairs, string and JSON helpers, timers, feature-status queries and path utilities.',
      'Most of these are used inside groups or when a graph needs to inspect feature state rather than build geometry. Their inputs are typed exactly as the library declares them.',
    ],
    startWith: ['GetFeatureStatus', 'GetFeatureError', 'SetFormAttribute', 'ParseJson', 'ConcatenateStringsWithTolerances', 'PrintTimer'],
  },
  'Onshape features': {
    blurb: 'The high-level Part Studio features — Extrude, Fillet, Hole, sheet metal and the rest.',
    paragraphs: [
      'These are the features you recognise from the Part Studio toolbar. Each node wraps one FeatureScript feature function, so its sockets mirror that feature dialog and its defaults follow the same rules.',
      'Prefer a feature node over hand-built operations when one exists: it carries the dialog logic (end conditions, tangent propagation, sheet-metal state) that a low-level op leaves to the caller.',
    ],
    startWith: ['Extrude', 'Revolve', 'Fillet', 'Chamfer', 'Shell', 'Thicken', 'Hole', 'BooleanBodies', 'Frame', 'SheetMetalStart'],
  },
  enums: {
    blurb: 'Library enum declarations surfaced as nodes so enum values can be passed to other nodes.',
    paragraphs: [
      'An enum node does no work on its own: it produces one value of a declared enum type. Use it wherever a downstream socket expects that enum, such as a bounding type or a lookup-table evaluation mode.',
    ],
    startWith: ['LookupTableEvaluate', 'PlaneSectionPart'],
  },
  Utility: {
    blurb: 'Curated convenience nodes that bundle a common operation the catalog exposes only as a generic definition.',
    paragraphs: [
      'A utility node fixes the FeatureScript call and its definition-map keys so the common case is one node with typed sockets. It is still standard-library codegen underneath, so it deploys with the rest of the graph.',
    ],
    startWith: ['InstanceOnPoints', 'Transform'],
  },
  Array: {
    blurb: 'Iteration and array construction for building, reading and traversing arrays.',
    paragraphs: [
      'These nodes are defined by the editor rather than the library catalog: they exist so a graph can build arrays, read an element, and run a body once per element without dropping into raw FeatureScript.',
      'Iteration nodes take a body socket; the body runs in the surrounding context and may contain statement nodes. Keep array bodies small and name the iteration so build errors point at the right node.',
    ],
    startWith: ['Array literal', 'Array index', 'Array size', 'Concatenate arrays', 'Map array', 'For each', 'Bounded for'],
  },
  'Group instance': {
    blurb: 'Instances of reusable node groups, expanded into the group body at build time.',
    paragraphs: [
      'A group instance exposes the inputs and outputs its group declares. Editing the group definition updates every instance; the instance itself only holds its input wiring and placement.',
      'Tab enters a group on the canvas and Tab again leaves it, so you can inspect the body without losing the surrounding graph.',
    ],
  },
};

/** Node copy that explains the node in editor terms. Keyed by catalog key
 * when the display title is ambiguous (overloads, shared names). */
const CURATED_BY_KEY: Readonly<Record<string, string>> = {
  'sphere::': 'Creates a solid sphere body from a centre point and radius through the modeling kernel.',
  'utility::transformArray': 'Builds an array of transforms from per-element inputs, ready for an instance-on-points or pattern node.',
  'instanceOnPoints::utility': 'Places copies of a body at every point/transform in a list, using one opPattern call. The curated counterpart of the raw pattern definition.',
};

/** Authored node summaries keyed by palette display title. */
const CURATED_BY_TITLE: Readonly<Record<string, string>> = {
  // Array nodes
  'Array literal': 'Builds an array from connected element values, in socket order.',
  'Array index': 'Reads the element at an index; out-of-range reads return undefined, so guard the index when the size can change.',
  'Array size': 'Returns the number of elements in an array.',
  'Concatenate arrays': 'Joins two arrays into one, preserving the order of both inputs.',
  'Map array': 'Applies a body once per element and collects the results into a new array.',
  'For each': 'Runs a body once per element for its side effects on the shared context.',
  'Bounded for': 'Runs a body a fixed number of times, with the iteration index available inside the body.',
  'Math expression': 'Evaluates a free-form FeatureScript expression. Inputs are the names referenced in the expression; the result is one typed value.',

  // Utility nodes
  InstanceOnPoints: 'Instances a body at each supplied point or transform. A shortcut for the common opPattern case with typed sockets.',
  'Transform array': 'Builds an array of transforms from per-element inputs, ready for an instance-on-points or pattern node.',

  // Modeling primitives and ops
  Sphere: 'Creates a solid sphere body from its centre and radius.',
  Cube: 'Creates an axis-aligned solid box from its corner and size.',
  FCuboid: 'Creates a cuboid body feature with the Onshape feature defaults (size, centre, orientation).',
  FCone: 'Creates a cone or truncated cone body from base radius, top radius and height.',
  FCylinder: 'Creates a cylinder body from radius, height and axis.',
  FEllipsoid: 'Creates an ellipsoid body from three semi-axis lengths.',
  OpBoolean: 'Combines bodies with union, difference or intersection. The generic definition map carries the boolean type and tool/target queries.',
  OpChamfer: 'Chamfers selected edges or faces by width, width/angle or two widths.',
  OpRevolve: 'Revolves a profile around an axis into a solid or surface body.',
  OpSweep: 'Sweeps a profile along a path, optionally with twist, scale and lock-face options.',
  OpShell: 'Hollows a solid by removing faces and offsetting the remaining walls.',
  OpThicken: 'Thickens surface bodies into solids, optionally in both directions.',
  OpPlane: 'Creates a construction plane from an origin and orientation, or from references.',
  OpHelix: 'Creates a helical curve from radius, pitch, height and direction.',
  OpFillet: 'Rounds selected edges with a constant radius, variable radius or face-blend options.',
  OpFullRoundFillet: 'Creates a full-round fillet that consumes the faces between the selected edges.',
  OpModifyFillet: 'Edits an existing fillet by changing its radius or the edges it applies to.',
  OpDeleteBodies: 'Deletes the bodies matched by a query from the context.',
  OpDeleteFace: 'Deletes faces, optionally healing the resulting opening into a valid body.',
  OpMoveFace: 'Offsets or moves faces along their normal, extending adjacent faces as needed.',
  OpOffsetFace: 'Offsets faces by a distance; the offset direction follows the face normal.',
  OpReplaceFace: 'Replaces faces with a surface, trimming or extending the result to the body.',
  OpEnclose: 'Encloses the selected regions into a solid, optionally merging with existing bodies.',
  OpFillSurface: 'Builds a surface patch bounded by the selected edges, with continuity controls.',
  OpImportForeign: 'Imports foreign geometry (STEP, Parasolid and similar) into the context and returns the created bodies.',
  OpCreateCompositePart: 'Groups bodies into a composite part so they can be treated as one selectable unit.',
  OpMateConnector: 'Creates a mate connector at a point and orientation for downstream assembly or feature use.',
  OpWrap: 'Wraps a sketch or surface onto a target face using the selected wrap method.',
  OpTransform: 'Applies a transform to bodies or entities. Use the Transform utility node for the typed version.',
  OpSplitFace: 'Splits faces with a tool surface or curve while keeping the body whole.',
  QEverything: 'Selects every entity in the context. The usual starting point for a narrowing filter chain.',
  QCreatedBy: 'Selects entities created by a given feature id, the standard way to scope a query to an earlier node.',
  QBodyType: 'Filters a query to solids, surfaces, wires or points by body type.',
  QSketchRegion: 'Selects the closed regions of a sketch so they can be extruded or revolved.',
  QAdjacent: 'Selects entities adjacent to the input query across a given topology (faces, edges, vertices).',
  QGeometry: 'Filters entities by geometric condition such as plane, cylinder or curve type.',
  QNthElement: 'Selects the n-th entity of a query, in the order the query evaluates.',
  QLargest: 'Selects the largest entity (by area or volume) from a query.',
  QSmallest: 'Selects the smallest entity (by area or volume) from a query.',
  QClosestTo: 'Selects the entity nearest a point, optionally within a radius.',
  QFarthestAlong: 'Selects the entity farthest along a direction, useful for end faces.',
  QContainsPoint: 'Selects entities that contain a given point.',
  QIntersectsPlane: 'Selects entities that cross a plane.',
  QParallelPlanes: 'Selects planes parallel to a reference plane.',
  QUniqueVertices: 'Collapses a query to its unique vertices, removing duplicates shared by edges.',
  QNothing: 'An empty query. Useful as a neutral starting point when a filter chain is built conditionally.',
  DummyQuery: 'Creates a placeholder query carrying an operation id and entity type. It selects nothing itself; use it where a query parameter must exist but no entities should match.',
  QToleranceFilter: 'Filters a query by the model’s tolerance settings, keeping entities that match within tolerance.',
  StartFeature: 'Opens a feature block: takes the context and feature id, and the downstream calls emit inside that feature.',
  MakeId: 'Creates a stable id from a string, so a feature or entity can be referred to by name across builds.',
  NewId: 'Generates a fresh id for a definition entry. Prefer MakeId when the id must be stable across rebuilds.',
  GetVariable: 'Reads a variable previously stored in the context by name.',
  IsQueryEmpty: 'Returns true when a query selects nothing, for guarding an operation.',
  AreQueriesEquivalent: 'Returns true when two queries select the same entities, regardless of construction order.',

  // Math
  Vector: 'Constructs a vector from components or from an array. Vectors are unitless; quantities carry units.',
  Matrix: 'Constructs a matrix from rows or from an array of values.',
  'IdentityMatrix': 'Returns the identity matrix of the requested size.',
  ZeroMatrix: 'Returns a zero matrix of the requested size.',
  Transpose: 'Returns the transpose of a matrix.',
  Inverse: 'Returns the inverse of a square matrix.',
  Determinant: 'Returns the determinant of a square matrix.',
  CwiseProduct: 'Multiplies two matrices element by element.',
  Dot: 'Returns the dot product of two vectors.',
  Cross: 'Returns the cross product of two 3D vectors, perpendicular to both.',
  Normalize: 'Returns a unit vector in the direction of the input; a zero vector has no direction.',
  Norm: 'Returns the Euclidean length of a vector.',
  SquaredNorm: 'Returns the squared length of a vector, avoiding a square root when comparing distances.',
  AngleBetween: 'Returns the angle between two vectors as a ValueWithUnits.',
  RotationMatrix3d: 'Builds a 3D rotation matrix, either from two directions or around an axis by an angle.',
  RotationAround: 'Builds a rotation around an axis through a point, as a transform.',
  Transform: 'Constructs a transform from its rotation and translation parts.',
  CoordSystem: 'Constructs a coordinate system from an origin and three axes.',
  'PersistentCoordSystem': 'A coordinate system anchored to model geometry, so it follows the model when it changes.',
  Plane: 'Constructs a plane value from an origin and normal.',
  PlaneToWorld: 'Maps a point from plane coordinates into world coordinates.',
  WorldToPlane: 'Maps a world point into the local coordinates of a plane.',
  MirrorAcross: 'Mirrors a value or transform across a plane.',
  ScaleUniformly: 'Scales uniformly around an origin, as a transform.',
  Box3d: 'Builds an axis-aligned bounding box from two opposite corners or from a point array.',
  InsideBox3d: 'Tests whether a point lies inside a bounding box.',
  TolerantEquals: 'Compares two values within a tolerance instead of exact equality. Use it for geometry results.',
  ApproximateResults: 'Marks a computation as tolerant of small numerical differences during rebuild.',
  RoundToPrecision: 'Rounds a number to a given decimal precision.',
  ToString: 'Converts a value to its FeatureScript string form. Useful for labels, messages and concatenation.',
  'ParseJsonWithUnits': 'Parses JSON text into a FeatureScript value, preserving unit-tagged quantities.',
  Range: 'Builds an array of numbers in a range with a step.',
  Hypot: 'Returns the hypotenuse of two numbers, sqrt(a² + b²), without intermediate overflow.',

  // Onshape features
  Extrude: 'Extrudes sketch regions, faces or edges with start and end conditions, direction and optional draft.',
  Revolve: 'Revolves a profile around an axis, with angle and merge options, followed by a boolean with the existing model.',
  Sweep: 'Sweeps a profile along a path with orientation, twist and scale controls.',
  Loft: 'Lofts through two or more profiles, with optional guide curves and continuity.',
  Fillet: 'Rounds edges or face-adjacent edges with constant, variable or face-blend options.',
  Chamfer: 'Breaks edges with a distance, distance/angle or two-distance chamfer.',
  Shell: 'Hollows a solid, removing the selected faces and offsetting the remaining walls.',
  Thicken: 'Turns surface bodies into solids by offsetting them, optionally in both directions.',
  Hole: 'Creates simple, counterbore, countersink or tapped holes at selected points, with standard sizes.',
  BooleanBodies: 'Unions, subtracts or intersects bodies with the standard boolean feature, including keep-tools options.',
  Draft: 'Adds a draft angle to faces relative to a neutral plane or parting line.',
  Rib: 'Creates ribs from open profiles, with thickness, draft and extension options.',
  Mirror: 'Mirrors features, bodies or parts across a plane, with a copy or merge result.',
  'BoundarySurface': 'Builds a surface patch from boundary curves with per-edge continuity.',
  Fill: 'Fills a closed boundary with a surface patch and optional continuity constraints.',
  'RuledSurface': 'Creates a ruled surface between an edge and a direction or another edge.',
  'OffsetSurface': 'Creates a surface offset from selected faces or surfaces.',
  'ExtendSurface': 'Extends a surface body beyond its boundary.',
  'TrimCurve': 'Trims or extends a curve to an intersection or a distance.',
  'ProjectCurves': 'Projects curves or points onto faces along a direction or normal to the surface.',
  'IntersectionCurve': 'Creates curves where two sets of faces intersect.',
  'CompositeCurve': 'Combines edges into a single curve entity.',
  'CompositePart': 'Creates a composite part from selected bodies so they select and move together.',
  'SplitPart': 'Splits a part or body with a tool surface, curve or plane.',
  'DeleteFace': 'Deletes faces from a body, with optional healing of the opening.',
  'DeleteBodies': 'Deletes the selected bodies from the model.',
  'MoveFace': 'Moves or offsets faces, extending neighbours to keep the body valid.',
  'ReplaceFace': 'Replaces faces with another surface, trimming or extending it to fit.',
  'ModifyFillet': 'Edits an existing fillet rather than creating a new one.',
  'FaceBlend': 'Blends two sets of faces with a rolling-ball or chordal blend.',
  'Frame': 'Creates structural frames from a profile along selected paths, with corner treatment.',
  'FrameTrim': 'Trims frame members against faces or against each other.',
  'Gusset': 'Adds gusset plates between selected frame or sheet edges.',
  'Helix': 'Creates a helical curve or spring from diameter, pitch and height.',
  'Cutlist': 'Builds a cut list from frame selections for downstream documentation.',
  'Decal': 'Places an image decal on a face with position, scale and rotation controls.',
  'ImportForeign': 'Imports foreign geometry into the Part Studio and returns the new bodies.',
  'ImportDerived': 'Brings parts from another Part Studio into this one as derived features.',
  'Tag': 'Attaches metadata to entities so later features and exports can find them.',
  'Wrap': 'Wraps sketches or surfaces onto a target face.',
  'SheetMetalStart': 'Converts a solid into an active sheet-metal model; the entry point for every sheet-metal chain.',
  'SheetMetalBend': 'Bends an active sheet-metal model along a reference line.',
  'SheetMetalFlange': 'Adds a flange along selected sheet-metal edges with bend and relief settings.',
  'SheetMetalTab': 'Adds tabs between parallel sheet-metal faces.',
  'SheetMetalCorner': 'Overrides the corner treatment of a sheet-metal model.',
  'SheetMetalJoint': 'Edits a sheet-metal joint, changing its type, gap or bend radius.',
  'SheetMetalFormed': 'Creates formed features (louvers, embosses) of a given style and size.',
  'ConvertExistingPart': 'Converts an existing solid body into a sheet-metal part.',
  'SheetMetalEnd': 'Deactivates the sheet-metal model on the selected parts, ending the sheet-metal chain.',
};

/** Node kinds that need a sentence about how the node behaves in a graph. */
function kindSentence(item: PaletteInsertable): string {
  if (item.isMathExpression === true) {
    return 'This is a value node: it evaluates to one value and never mutates the model.';
  }
  if (item.arrayVariant != null) {
    return 'This is an editor-defined array node: it participates in the build like any other node and may run a body in the surrounding context.';
  }
  if (item.groupDefinitionId != null) {
    return 'This is a group instance: it expands to the group definition at build time and exposes the group’s declared inputs.';
  }
  if (item.utilityId != null) {
    return 'This is a curated utility: it fixes the library call and its definition keys, so the common case is one node with typed sockets.';
  }
  if (item.meta.includes('statement') || item.entry?.kind === 'statement') {
    return 'This is a statement node: it runs against the graph’s shared context and changes model state when the graph is built.';
  }
  if (item.entry?.kind === 'value') {
    return 'This is a value node: it is a pure expression, so its output can feed several consumers and is recomputed on every build.';
  }
  return 'This node participates in the graph’s build like any other node.';
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** First sentence, capped, for list rows. Abbreviations such as "i.e." and
 * decimal points are not sentence ends. */
function firstSentence(text: string, max = 180): string {
  const clean = collapse(text);
  let end = -1;
  for (const match of clean.matchAll(/[.!?](\s|$)/g)) {
    const idx = match.index ?? -1;
    const before = clean.slice(Math.max(0, idx - 4), idx + 1).toLowerCase();
    const after = clean.slice(idx + 1, idx + 3);
    if (/\b[a-z]\.[a-z]\.$/.test(before)) continue; // i.e. / e.g. / vs.
    if (/\d\.\d/.test(clean.slice(Math.max(0, idx - 1), idx + 2))) continue; // 1.5
    if (/^\d/.test(after.trim())) continue; // numbered list, not a sentence end
    end = idx;
    break;
  }
  const sentence = end >= 0 ? clean.slice(0, end + 1) : clean;
  return sentence.length > max ? `${sentence.slice(0, max - 1).trimEnd()}…` : sentence;
}

function fallbackSummary(item: PaletteInsertable): string {
  const scraped = item.entry?.description ?? '';
  if (scraped.trim() !== '') return firstSentence(scraped);
  const kind = item.entry?.kind === 'statement' ? 'statement' : item.entry?.kind === 'value' ? 'value' : 'library';
  return `${item.name} is a ${kind} node from the ${item.category} library.`;
}

function describeNode(item: PaletteInsertable): string {
  return CURATED_BY_KEY[item.key] ?? CURATED_BY_TITLE[item.name] ?? fallbackSummary(item);
}

function camelWords(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^op/, 'op ')
    .toLowerCase();
}

function portRows(ports: readonly CatalogPort[], direction: 'in' | 'out'): string[][] {
  return ports
    .filter(p => p != null && p.name !== '')
    .map(p => [p.name, p.valueType, collapse(p.description ?? '') || (direction === 'in' ? 'Input socket.' : 'Output socket.')]);
}

function nodeBody(item: PaletteInsertable, description: string): DocBlock[] {
  const blocks: DocBlock[] = [{ kind: 'paragraph', text: description }, { kind: 'paragraph', text: kindSentence(item) }];
  const entry = item.entry;
  if (entry != null) {
    const inputs = portRows(entry.inputs, 'in');
    if (inputs.length > 0) {
      blocks.push({ kind: 'table', headers: ['Input', 'Type', 'Meaning'], rows: inputs });
    }
    const outputs = portRows(entry.outputs, 'out');
    if (outputs.length > 0) {
      blocks.push({ kind: 'table', headers: ['Output', 'Type', 'Meaning'], rows: outputs });
    }
    if (entry.genericDefinition === true) {
      blocks.push({
        kind: 'note',
        text: 'This node is built from a generic definition map: the definition schema is not known to the editor, so only the typed inputs are exposed as sockets. Fill the rest of the definition in FeatureScript or use a higher-level feature node.',
      });
    }
    if (entry.description != null && entry.description.trim() !== '' && entry.description.trim() !== description) {
      blocks.push({ kind: 'note', text: `Standard library: ${collapse(entry.description)}` });
    }
  }
  const where = entry?.file != null && entry.file !== '' ? `${item.category} · ${entry.file}` : item.category;
  blocks.push({ kind: 'paragraph', text: `Library: ${where}. Kind: ${item.meta}.` });
  return blocks;
}

function categoryTopic(category: string, items: readonly PaletteInsertable[]): DocTopic {
  const guide = CATEGORY_GUIDES[category];
  const paragraphs = guide?.paragraphs ?? [
    `Nodes from the ${category} group of the live catalog. Each node documents its own typed sockets.`,
  ];
  const body: DocBlock[] = paragraphs.map(text => ({ kind: 'paragraph', text }));
  if (guide?.startWith != null && guide.startWith.length > 0) {
    body.push({ kind: 'bullets', items: guide.startWith.map(name => `${name} — open its topic from the list below.`) });
  }
  body.push({ kind: 'note', text: `${items.length} insertable node${items.length === 1 ? '' : 's'} in this category, generated from the live catalog.` });
  return {
    id: `category:${category}`,
    section: 'nodes',
    title: `${category} nodes`,
    category,
    summary: guide?.blurb ?? `Every insertable node in the ${category} category of the live catalog.`,
    body,
    keywords: [category, `${category} nodes`],
  };
}

/**
 * One topic per insertable node plus one overview per category, grouped by
 * category then title. Derived from the caller's catalog — pass the same
 * insertables the palette is showing so the docs cannot go stale.
 */
export function buildNodeTopics(items: readonly PaletteInsertable[]): DocTopic[] {
  const byCategory = new Map<string, PaletteInsertable[]>();
  for (const item of items) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }
  const topics: DocTopic[] = [];
  for (const category of [...byCategory.keys()].sort((a, b) => a.localeCompare(b))) {
    const categoryItems = [...(byCategory.get(category) ?? [])].sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
    topics.push(categoryTopic(category, categoryItems));
    for (const item of categoryItems) {
      const description = describeNode(item);
      topics.push({
        id: `node:${item.key}`,
        section: 'nodes',
        title: item.name,
        category,
        catalogKey: item.key,
        summary: description,
        body: nodeBody(item, description),
        keywords: [item.name, camelWords(item.name), item.key, category, item.meta],
        related: [`category:${category}`],
      });
    }
  }
  return topics;
}

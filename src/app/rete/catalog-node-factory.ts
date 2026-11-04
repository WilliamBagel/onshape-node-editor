/**
 * #8 — Node factory + palette filtering over the #7 catalog.
 *
 * `createNodeFromCatalogEntry` maps a catalog entry to a node instance:
 *  - `statement` entries become a `CustomFeatureNode` whose spec is
 *    synthesized from the entry's typed ports (a live spec from
 *    `LiveSpecProvider` can be supplied via `resolveSpec` and wins), and
 *  - allowlisted `value` entries (classification allowlist + all ports
 *    known, i.e. `entry.nodeable`) become a `FunctionNode`.
 * Anything else is not node-able and returns null rather than a broken node.
 *
 * #11 — curated utility nodes (utility-overrides.ts) replace the scraped
 * ports of the vector/matrix/transform family. Entries with a utilityId
 * are built from the curated definition instead of the synthesized spec:
 * value utilities become `FunctionNode` (pure expression, let-hoisted),
 * statement utilities become `UtilityStatementNode` (fixed codegen).
 */
import type { BTFeatureSpec129 } from "onshape-typescript-fetch";
import type { CatalogEntry } from "../onshape/catalog/types";
import { UTILITY_BY_ID, type UtilityOverride } from "../onshape/catalog/utility-overrides";
import type { FeatureSpecReference } from "./serialization/graph-schema-types";
import { CustomFeatureNode } from "./nodes/customfeaturenode";
import { FunctionNode, type FunctionNodeMeta } from "./nodes/functionnode";
import { UtilityStatementNode, type UtilityStatementDef } from "./nodes/utilitystatementnode";
import { createArrayNode as createArrayNodeImpl, ARRAY_NODE_VARIANTS } from "./nodes/arraynodes";
import type { ArrayNodeVariant } from "./nodes/arraynodes";
import { MathExpressionNode } from "./nodes/mathexpressionnode";
import type { ValueType } from "../onshape-utils/valuetypes";
import { OnshapeNode } from "./nodes/onshapenode";

export { ARRAY_NODE_VARIANTS };
export type { ArrayNodeVariant };

/**
 * #12: create an array/iteration node by variant — the array counterpart
 * of {@link createNodeFromCatalogEntry} for nodes that are not catalog
 * entries. Palette/UIs offer `ARRAY_NODE_VARIANTS` and call this; no
 * `App.vue` changes are needed to construct the nodes.
 */
/** #20: create a math expression node. Palette/UIs call this; the node
 * derives its sockets from the source on `setSource`. */
export function createMathExpressionNode(source = ""): MathExpressionNode {
  return new MathExpressionNode(source);
}

export function createArrayNode(
  variant: ArrayNodeVariant,
  options?: { elementType?: ValueType; resultElementType?: ValueType; bound?: number; body?: string },
): OnshapeNode {
  return createArrayNodeImpl(variant, options);
}

const VALUE_TYPE_TO_BT: Record<string, string> = {
  Boolean: "BTParameterSpecBoolean-170",
  ValueWithUnits: "BTParameterSpecQuantity-173",
  Enum: "BTParameterSpecEnum-171",
  QueryList: "BTParameterSpecQuery-174",
  Selection: "BTParameterSpecQuery-174",
  String: "BTParameterSpecString-169",
};

/** Synthesize a minimal BTFeatureSpec from a statement entry's typed ports. */
export function synthesizeFeatureSpec(entry: CatalogEntry): BTFeatureSpec129 {
  const parameters = entry.inputs
    .filter(p => VALUE_TYPE_TO_BT[p.valueType] != null)
    .map(p => ({
      btType: VALUE_TYPE_TO_BT[p.valueType],
      parameterId: p.name,
      parameterName: p.name,
      ...(p.valueType === "ValueWithUnits" ? { defaultValue: { btType: "BTMParameterQuantity-147", value: 0, units: "m" } } : {}),
      ...(p.valueType === "Enum" ? { options: [p.enumName ?? "option"], optionNames: [p.enumName ?? "option"], enumName: p.enumName ?? "Enum", defaultValue: { type: "Enum", value: "" } } : {}),
      ...(p.valueType === "Boolean" ? { defaultValue: { type: "Boolean", value: false } } : {}),
      ...(p.valueType === "QueryList" || p.valueType === "Selection" ? { defaultValue: { btType: "BTMParameterQueryList-148", nodeId: "", queries: [] } } : {}),
    }));
  return {
    btType: "BTFeatureSpec-129",
    featureType: entry.name,
    featureTypeName: entry.name,
    parameters,
  } as unknown as BTFeatureSpec129;
}

/** Fixed codegen for the two statement utilities. */
const STATEMENT_DEFS: Readonly<Record<string, { def: UtilityStatementDef; ports: CatalogEntry["inputs"] }>> = {
  opTransform: {
    def: {
      utilityId: "opTransform",
      displayName: "opTransform",
      tooltip: "Maps to FeatureScript opTransform(context, id, { bodies, transform }) (Modeling/geomOperations).",
      definition: [
        { key: "bodies", mapKey: "bodies" },
        { key: "transform", mapKey: "transform" },
      ],
      fsFunction: "opTransform",
    },
    ports: UTILITY_BY_ID["opTransform"].inputs,
  },
  instanceOnPoints: {
    def: {
      utilityId: "instanceOnPoints",
      displayName: "Instance on points",
      tooltip: UTILITY_BY_ID["instanceOnPoints"].tooltip,
      definition: [
        { key: "body", mapKey: "entities" },
        { key: "transforms", mapKey: "transforms" },
        { key: "instanceNames", mapKey: "instanceNames" },
      ],
      fsFunction: "opPattern",
    },
    ports: UTILITY_BY_ID["instanceOnPoints"].inputs,
  },
};

export function resolveUtilityStatement(utilityId: string): { def: UtilityStatementDef; ports: CatalogEntry["inputs"] } | undefined {
  return STATEMENT_DEFS[utilityId];
}

export function utilityMeta(override: UtilityOverride): FunctionNodeMeta {
  return {
    utilityId: override.utilityId,
    displayName: override.displayName,
    tooltip: override.tooltip,
    ...(override.template != null ? { template: override.template } : {}),
  };
}

/** Create a curated utility node by id (value or statement). */
export function createUtilityNode(utilityId: string): OnshapeNode | null {
  const override = UTILITY_BY_ID[utilityId];
  if (override == null) return null;
  if (override.kind === "statement") {
    const statement = STATEMENT_DEFS[utilityId];
    if (statement == null) return null;
    return new UtilityStatementNode(statement.def, statement.ports);
  }
  const entry: CatalogEntry = {
    key: `utility::${utilityId}`,
    name: override.displayName === undefined ? utilityId : fsNameFor(override),
    category: "Utility",
    file: "",
    descriptor: "",
    signature: "",
    description: override.tooltip,
    kind: "value",
    nodeable: true,
    utilityId,
    inputs: override.inputs.map(p => ({ ...p })),
    outputs: override.outputs.map(p => ({ ...p })),
  };
  return new FunctionNode(entry, utilityMeta(override));
}

/** The FeatureScript function name for a value override (overloads aside). */
function fsNameFor(override: UtilityOverride): string {
  // The override display name is the FS name except for transformArray,
  // which is an array literal (see its tooltip).
  switch (override.utilityId) {
    case "transformArray": return "array";
    case "transform": return "transform";
    default: return override.utilityId;
  }
}

/** All utility node ids the factory can create. */
export function listUtilityIds(): string[] {
  return Object.keys(UTILITY_BY_ID);
}

export function createNodeFromCatalogEntry(
  entry: CatalogEntry,
  resolveSpec?: (ref: FeatureSpecReference) => BTFeatureSpec129 | undefined,
): OnshapeNode | null {
  if (entry.utilityId != null) {
    return createUtilityNode(entry.utilityId);
  }
  if (!entry.nodeable) return null;
  if (entry.kind === "value") return new FunctionNode(entry);
  if (entry.kind === "statement") {
    const live = resolveSpec?.({ did: null, wvm: null, wvmid: null, eid: null, featureType: entry.name, microversion: null });
    return new CustomFeatureNode(live ?? synthesizeFeatureSpec(entry));
  }
  return null;
}

/** Node-able entries only — what the palette and context menu may offer. */
export function nodeableEntries(entries: readonly CatalogEntry[]): CatalogEntry[] {
  return entries.filter(e => e.nodeable && (e.kind === "statement" || e.kind === "value"));
}

/**
 * #73: one ranked scorer shared by the catalog filter and the palette
 * search. Every whitespace-separated token must match somewhere (AND);
 * name matches outrank category matches, which outrank description
 * matches, so the best node sinks to the top.
 */
interface SearchableFields { name: string; category: string; description: string }

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (const ch of haystack) { if (ch === needle[i]) i++; if (i >= needle.length) return true; }
  return needle.length === 0;
}

function scoreFields(fields: SearchableFields, tokens: readonly string[]): number | null {
  const name = fields.name.toLowerCase();
  const category = fields.category.toLowerCase();
  const description = (fields.description ?? "").toLowerCase();
  let total = 0;
  for (const token of tokens) {
    if (name.startsWith(token)) total += 100;
    else if (name.includes(token)) total += 60;
    else if (category.includes(token)) total += 40;
    else if (description.includes(token)) total += 20;
    else if (isSubsequence(token, name)) total += 10;
    else return null;
  }
  return total;
}

function ranked<T extends SearchableFields>(items: readonly T[], term: string): T[] {
  const tokens = term.trim().toLowerCase().split(/\s+/).filter(t => t !== "");
  if (tokens.length === 0) return [...items];
  return items
    .map(item => ({ item, score: scoreFields(item, tokens) }))
    .filter((r): r is { item: T; score: number } => r.score != null)
    .sort((a, b) => b.score - a.score)
    .map(r => r.item);
}

/** Ranked case-insensitive search over name, category and description. */
export function filterCatalogEntries(entries: readonly CatalogEntry[], term: string): CatalogEntry[] {
  return ranked(entries, term);
}

/**
 * #73: every insertable node the palette may offer, as one flat list.
 * `nodeableEntries` alone excludes the non-catalog insertables (array,
 * math, utility-by-id, group instances); this is the full catalog.
 */
export interface PaletteInsertable {
  /** Stable unique key for list rendering and keyboard navigation. */
  key: string;
  name: string;
  category: string;
  description: string;
  /** Short meta label shown beside the name (kind / origin). */
  meta: string;
  entry?: CatalogEntry;
  arrayVariant?: ArrayNodeVariant;
  utilityId?: string;
  groupDefinitionId?: string;
  isMathExpression?: boolean;
}

const ARRAY_VARIANT_META: Readonly<Record<ArrayNodeVariant, { name: string; description: string }>> = {
  "array-literal": { name: "Array literal", description: "Build an array from element nodes." },
  "array-concat": { name: "Concatenate arrays", description: "Join two arrays into one." },
  "array-index": { name: "Array index", description: "Read the element at an index." },
  "array-size": { name: "Array size", description: "The number of elements in an array." },
  "map-array": { name: "Map array", description: "Apply a body to every element." },
  "for-each": { name: "For each", description: "Iterate over an array with a body." },
  "bounded-for": { name: "Bounded for", description: "A counted loop with a fixed bound." },
};

export interface PaletteGroupDefinitionLike { id: string; name: string }

/** Build the full insertable catalog: node-able catalog entries plus array, math, utility and group-instance nodes. */
export function buildPaletteInsertables(
  entries: readonly CatalogEntry[],
  groupDefinitions: readonly PaletteGroupDefinitionLike[] = [],
): PaletteInsertable[] {
  const items: PaletteInsertable[] = nodeableEntries(entries).map(entry => ({
    key: entry.key,
    name: entry.name,
    category: entry.category,
    description: entry.description ?? "",
    meta: entry.utilityId != null ? "utility" : entry.kind,
    entry,
  }));
  const coveredUtilityIds = new Set(items.map(i => i.utilityId ?? i.entry?.utilityId).filter((id): id is string => id != null));
  for (const utilityId of listUtilityIds()) {
    if (coveredUtilityIds.has(utilityId)) continue;
    const override = UTILITY_BY_ID[utilityId];
    items.push({
      key: `utility::${utilityId}`,
      name: override.displayName,
      category: "Utility",
      description: override.tooltip,
      meta: "utility",
      utilityId,
    });
  }
  for (const variant of ARRAY_NODE_VARIANTS) {
    const meta = ARRAY_VARIANT_META[variant];
    items.push({
      key: `array::${variant}`,
      name: meta.name,
      category: "Array",
      description: meta.description,
      meta: "array",
      arrayVariant: variant,
    });
  }
  items.push({
    key: "math::expression",
    name: "Math expression",
    category: "Math",
    description: "Free-form FeatureScript expression.",
    meta: "math",
    isMathExpression: true,
  });
  for (const def of groupDefinitions) {
    items.push({
      key: `group::${def.id}`,
      name: def.name,
      category: "Group instance",
      description: "Place another instance of this group.",
      meta: "group",
      groupDefinitionId: def.id,
    });
  }
  return items;
}

/** Ranked search over the full insertable catalog. */
export function searchPaletteInsertables(items: readonly PaletteInsertable[], term: string): PaletteInsertable[] {
  return ranked(items, term);
}

/** Group insertables by category, sorted by category then name. */
export function groupInsertablesByCategory(items: readonly PaletteInsertable[]): { category: string; entries: PaletteInsertable[] }[] {
  const map = new Map<string, PaletteInsertable[]>();
  for (const i of items) map.set(i.category, [...(map.get(i.category) ?? []), i]);
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([category, list]) => ({ category, entries: [...list].sort((a, b) => a.name.localeCompare(b.name)) }));
}

export interface CategoryGroup { category: string; entries: CatalogEntry[] }

/** Group entries by category, sorted by category then name. */
export function groupByCategory(entries: readonly CatalogEntry[]): CategoryGroup[] {
  const map = new Map<string, CatalogEntry[]>();
  for (const e of entries) {
    const list = map.get(e.category) ?? [];
    list.push(e);
    map.set(e.category, list);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([category, list]) => ({ category, entries: [...list].sort((a, b) => a.name.localeCompare(b.name)) }));
}

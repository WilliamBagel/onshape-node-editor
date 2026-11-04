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

/** Case-insensitive substring search over name, category and description. */
export function filterCatalogEntries(entries: readonly CatalogEntry[], term: string): CatalogEntry[] {
  const t = term.trim().toLowerCase();
  if (t === "") return [...entries];
  return entries.filter(e =>
    e.name.toLowerCase().includes(t) ||
    e.category.toLowerCase().includes(t) ||
    (e.description ?? "").toLowerCase().includes(t));
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

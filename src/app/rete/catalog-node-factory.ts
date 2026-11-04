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
 */
import type { BTFeatureSpec129 } from "onshape-typescript-fetch";
import type { CatalogEntry } from "../onshape/catalog/types";
import type { FeatureSpecReference } from "./serialization/graph-schema-types";
import { CustomFeatureNode } from "./nodes/customfeaturenode";
import { FunctionNode } from "./nodes/functionnode";
import { OnshapeNode } from "./nodes/onshapenode";

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

export function createNodeFromCatalogEntry(
  entry: CatalogEntry,
  resolveSpec?: (ref: FeatureSpecReference) => BTFeatureSpec129 | undefined,
): OnshapeNode | null {
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

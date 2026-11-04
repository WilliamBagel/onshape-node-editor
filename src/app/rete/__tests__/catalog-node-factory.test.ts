/** #8: factory maps catalog entries to nodes; palette filtering helpers. */
import { describe, expect, it } from "vitest";
import { createNodeFromCatalogEntry, filterCatalogEntries, groupByCategory, nodeableEntries, synthesizeFeatureSpec } from "../catalog-node-factory";
import { CustomFeatureNode } from "../nodes/customfeaturenode";
import { FunctionNode } from "../nodes/functionnode";
import { defaultCatalog } from "../../onshape/catalog/spec-catalog";
import type { CatalogEntry } from "../../onshape/catalog/types";

const valueEntry: CatalogEntry = {
  key: "Math::cross", name: "cross", category: "Math", file: "f", descriptor: "d", signature: "cross(a, b)",
  description: "Cross product", kind: "value", nodeable: true,
  inputs: [{ name: "a", valueType: "Vector", scrapedType: "Vector", description: "" }, { name: "b", valueType: "Vector", scrapedType: "Vector", description: "" }],
  outputs: [{ name: "return", valueType: "Vector", scrapedType: "Vector", description: "" }],
};
const statementEntry: CatalogEntry = {
  key: "Part::box", name: "box", category: "Part", file: "f", descriptor: "d", signature: "box(context, id, {height})",
  description: "Box", kind: "statement", nodeable: true,
  inputs: [{ name: "height", valueType: "ValueWithUnits", scrapedType: "ValueWithUnits", description: "" }],
  outputs: [],
};
const blocked: CatalogEntry = { ...statementEntry, kind: "type", nodeable: false };

describe("createNodeFromCatalogEntry", () => {
  it("creates a FunctionNode for an allowlisted value entry", () => {
    const node = createNodeFromCatalogEntry(valueEntry);
    expect(node).toBeInstanceOf(FunctionNode);
    expect((node as FunctionNode).functionName).toBe("cross");
    expect((node as FunctionNode).getFeaturescript({ a: "x", b: "y" })).toBe("cross(x, y)");
  });
  it("creates a CustomFeatureNode for a statement entry with a synthesized spec", () => {
    const node = createNodeFromCatalogEntry(statementEntry);
    expect(node).toBeInstanceOf(CustomFeatureNode);
    expect((node as CustomFeatureNode).getTitle()).toBe("box");
    expect(synthesizeFeatureSpec(statementEntry).parameters[0].btType).toBe("BTParameterSpecQuantity-173");
  });
  it("returns null for non-nodeable entries", () => {
    expect(createNodeFromCatalogEntry(blocked)).toBeNull();
  });
  it("prefers a live spec when a resolver supplies one", () => {
    const live: any = synthesizeFeatureSpec(statementEntry);
    live.featureTypeName = "Live Box";
    const node = createNodeFromCatalogEntry(statementEntry, () => live) as CustomFeatureNode;
    expect((node as CustomFeatureNode).getTitle()).toBe("Live Box");
  });
});

describe("palette filtering", () => {
  it("filters by name, category and description (case-insensitive)", () => {
    const entries = [valueEntry, statementEntry];
    expect(filterCatalogEntries(entries, "CROSS")).toEqual([valueEntry]);
    expect(filterCatalogEntries(entries, "part")).toEqual([statementEntry]);
    expect(filterCatalogEntries(entries, "cross product")).toEqual([valueEntry]);
    expect(filterCatalogEntries(entries, "")).toHaveLength(2);
    expect(filterCatalogEntries(entries, "zzz")).toEqual([]);
  });
  it("groups by category, sorted, and only node-able entries are offered", () => {
    const groups = groupByCategory(nodeableEntries([valueEntry, statementEntry, blocked]));
    expect(groups.map(g => g.category)).toEqual(["Math", "Part"]);
    expect(groups[0].entries).toEqual([valueEntry]);
  });
  it("real catalog offers node-able entries in categories", () => {
    const offered = nodeableEntries(defaultCatalog.entries);
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.every(e => e.kind === "statement" || e.kind === "value")).toBe(true);
    expect(groupByCategory(offered).length).toBeGreaterThan(1);
    // every offered entry can be instantiated
    for (const e of offered.slice(0, 25)) {
      expect(createNodeFromCatalogEntry(e)).not.toBeNull();
    }
  });
});

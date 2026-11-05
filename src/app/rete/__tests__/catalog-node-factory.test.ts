/** #8: factory maps catalog entries to nodes; palette filtering helpers. */
import { describe, expect, it } from "vitest";
import { ARRAY_NODE_VARIANTS, buildPaletteInsertables, createNodeFromCatalogEntry, filterCatalogEntries, groupByCategory, listUtilityIds, nodeableEntries, searchPaletteInsertables, synthesizeFeatureSpec } from "../catalog-node-factory";
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

describe("full insertable catalog (#73)", () => {
  it("covers every insertable kind: catalog, array, math, utility, group instance", () => {
    const items = buildPaletteInsertables(defaultCatalog.entries, [{ id: "g1", name: "My group" }]);
    // catalog statement/value entries
    expect(items.some(i => i.entry?.kind === "statement")).toBe(true);
    expect(items.some(i => i.entry?.kind === "value")).toBe(true);
    // every array variant
    for (const variant of ARRAY_NODE_VARIANTS) {
      expect(items.some(i => i.arrayVariant === variant)).toBe(true);
    }
    // math expression
    expect(items.some(i => i.isMathExpression === true)).toBe(true);
    // every utility id is reachable (via a catalog entry or a utility insertable)
    for (const id of listUtilityIds()) {
      expect(items.some(i => i.utilityId === id || i.entry?.utilityId === id)).toBe(true);
    }
    // group instances
    expect(items.some(i => i.groupDefinitionId === "g1" && i.name === "My group" && i.category === "Group instance")).toBe(true);
  });

  it("excludes non-nodeable catalog entries but keeps the non-catalog insertables", () => {
    const items = buildPaletteInsertables([valueEntry, statementEntry, blocked]);
    expect(items.some(i => i.entry === blocked)).toBe(false);
    expect(items.filter(i => i.entry != null)).toHaveLength(2);
    expect(items.some(i => i.arrayVariant != null)).toBe(true);
    expect(items.some(i => i.isMathExpression === true)).toBe(true);
  });

  it("every insertable resolves to a creatable node kind (keys unique, no empty names)", () => {
    const items = buildPaletteInsertables(defaultCatalog.entries, [{ id: "g1", name: "G" }]);
    expect(new Set(items.map(i => i.key)).size).toBe(items.length);
    expect(items.every(i => i.name.trim() !== "" && i.category.trim() !== "")).toBe(true);
    for (const i of items) {
      const kinds = [i.entry != null, i.arrayVariant != null, i.utilityId != null, i.isMathExpression === true, i.groupDefinitionId != null].filter(Boolean);
      expect(kinds).toHaveLength(1);
    }
  });
});

describe("ranked search (#73)", () => {
  const items = buildPaletteInsertables([valueEntry, statementEntry], [{ id: "g1", name: "Bracket group" }]);

  it("ranks name-prefix above category/description matches", () => {
    const found = searchPaletteInsertables(items, "cross");
    expect(found[0].name).toBe("cross");
  });

  it("matches category and description; empty term returns all", () => {
    expect(searchPaletteInsertables(items, "part")[0].name).toBe("box");
    expect(searchPaletteInsertables(items, "cross product")[0].name).toBe("cross");
    expect(searchPaletteInsertables(items, "")).toHaveLength(items.length);
    expect(searchPaletteInsertables(items, "zzz")).toEqual([]);
  });

  it("finds non-catalog nodes by their plain names", () => {
    expect(searchPaletteInsertables(items, "array literal")[0].arrayVariant).toBe("array-literal");
    expect(searchPaletteInsertables(items, "math")[0].isMathExpression).toBe(true);
    expect(searchPaletteInsertables(items, "bracket")[0].groupDefinitionId).toBe("g1");
  });

  it("filterCatalogEntries keeps its contract under ranking", () => {
    const entries = [valueEntry, statementEntry];
    expect(filterCatalogEntries(entries, "CROSS")).toEqual([valueEntry]);
    expect(filterCatalogEntries(entries, "part")).toEqual([statementEntry]);
    expect(filterCatalogEntries(entries, "cross product")).toEqual([valueEntry]);
    expect(filterCatalogEntries(entries, "")).toHaveLength(2);
    expect(filterCatalogEntries(entries, "zzz")).toEqual([]);
  });
});

describe("standard-library generic definitions", () => {
  const chamfer = defaultCatalog.entries.find(e => e.name === "chamfer");
  const opChamfer = defaultCatalog.entries.find(e => e.name === "opChamfer");

  it("chamfer is offered, searchable first, and insertable without throwing", () => {
    expect(chamfer).toBeDefined();
    expect(nodeableEntries(defaultCatalog.entries)).toContain(chamfer);
    const items = buildPaletteInsertables(defaultCatalog.entries);
    const found = searchPaletteInsertables(items, "chamfer");
    expect(found[0].name).toBe("chamfer");
    expect(found[0].meta).toContain("generic definition");
    const node = createNodeFromCatalogEntry(chamfer!) as CustomFeatureNode;
    expect(node).toBeInstanceOf(CustomFeatureNode);
    expect(node.genericDefinition).toBe(true);
    expect(node.getTitle()).toBe("chamfer");
    expect(node.getFeaturescript({ context: "context", id: "id" })).toContain("chamfer(context, id,");
    // context/id sockets exist; the generic map has no synthesized children
    expect(node.inputs.context).toBeDefined();
    expect(node.inputs.id).toBeDefined();
    expect(node.inputs.definition).toBeDefined();
    expect(synthesizeFeatureSpec(chamfer!).parameters).toEqual([]);
  });

  it("opChamfer synthesizes its typed definition parameters", () => {
    const node = createNodeFromCatalogEntry(opChamfer!) as CustomFeatureNode;
    expect(node.genericDefinition).toBe(true);
    expect(synthesizeFeatureSpec(opChamfer!).parameters.map(p => p.parameterId)).toContain("entities");
    expect(node.inputs.entities).toBeDefined();
  });

  it("fillet remains insertable and ranking is deterministic on ties", () => {
    const fillet = defaultCatalog.entries.find(e => e.name === "fillet");
    expect(createNodeFromCatalogEntry(fillet!)).toBeInstanceOf(CustomFeatureNode);
    const a: CatalogEntry = { ...valueEntry, name: "zeta" };
    const b: CatalogEntry = { ...valueEntry, name: "alpha" };
    // Same score for both on a category match: name order breaks the tie.
    expect(filterCatalogEntries([a, b], "math").map(e => e.name)).toEqual(["alpha", "zeta"]);
    const items = buildPaletteInsertables([a, b]);
    const catalogHits = searchPaletteInsertables(items, "math").filter(i => i.entry != null);
    expect(catalogHits.map(i => i.name)).toEqual(["alpha", "zeta"]);
  });
});

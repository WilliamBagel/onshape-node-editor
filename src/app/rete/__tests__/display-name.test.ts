import { describe, expect, it } from "vitest";
import { formatDisplayName } from "../display-name";
import {
  buildPaletteInsertables,
  searchPaletteInsertables,
  createNodeFromCatalogEntry,
} from "../catalog-node-factory";
import { defaultCatalog } from "../../onshape/catalog/spec-catalog";
import { CustomFeatureNode } from "../nodes/customfeaturenode";

describe("formatDisplayName", () => {
  it("capitalizes the first letter of lowercase names", () => {
    expect(formatDisplayName("chamfer")).toBe("Chamfer");
    expect(formatDisplayName("fillet")).toBe("Fillet");
  });

  it("preserves inner capitals (opChamfer -> OpChamfer, not OPCHAMFER)", () => {
    expect(formatDisplayName("opChamfer")).toBe("OpChamfer");
    expect(formatDisplayName("sheetMetalCornerBreak")).toBe("SheetMetalCornerBreak");
  });

  it("leaves already-capitalized names unchanged", () => {
    expect(formatDisplayName("Chamfer")).toBe("Chamfer");
    expect(formatDisplayName("Live Box")).toBe("Live Box");
    expect(formatDisplayName("")).toBe("");
  });

  it("does not alter codegen identifiers: featureType and functionName stay lowercase", () => {
    const chamfer = defaultCatalog.entries.find((e) => e.name === "chamfer")!;
    const node = createNodeFromCatalogEntry(chamfer) as CustomFeatureNode;
    expect(node.getTitle()).toBe("Chamfer");
    expect(node.getFeatureSpec().featureType).toBe("chamfer");
  });
});

describe("palette display names", () => {
  it("buildPaletteInsertables capitalizes catalog names without changing keys", () => {
    const items = buildPaletteInsertables(defaultCatalog.entries);
    const chamfer = items.find((i) => i.entry?.name === "chamfer")!;
    expect(chamfer).toBeDefined();
    expect(chamfer.name).toBe("Chamfer");
    expect(chamfer.entry?.name).toBe("chamfer");
    const op = items.find((i) => i.entry?.name === "opChamfer")!;
    expect(op).toBeDefined();
    expect(op.name).toBe("OpChamfer");
    expect(op.entry?.name).toBe("opChamfer");
  });

  it("does not capitalize deliberately-cased utility/array/math/group labels", () => {
    const items = buildPaletteInsertables(defaultCatalog.entries);
    // utility override displayName stays as authored (e.g. "opTransform")
    const util = items.find((i) => i.meta === "utility")!;
    expect(util.name).not.toBe(""); // sanity: utilities present
    const arrayItems = items.filter((i) => i.category === "Array");
    expect(arrayItems.map((i) => i.name)).toContain("Array literal");
    const mathItem = items.find((i) => i.category === "Math" && i.isMathExpression === true)!;
    expect(mathItem.name).toBe("Math expression");
  });

  it("finds capitalized display names via lowercase queries (search still works)", () => {
    const items = buildPaletteInsertables(defaultCatalog.entries);
    const found = searchPaletteInsertables(items, "chamfer");
    expect(found[0].name).toBe("Chamfer");
    expect(found[0].entry?.name).toBe("chamfer");
    const foundOp = searchPaletteInsertables(items, "opchamfer");
    expect(foundOp.map((i) => i.name)).toContain("OpChamfer");
    const foundSheet = searchPaletteInsertables(items, "sheetmetalcornerbreak");
    expect(foundSheet.map((i) => i.name)).toContain("SheetMetalCornerBreak");
  });
});

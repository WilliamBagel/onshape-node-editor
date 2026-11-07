/**
 * DefineFeatureNode feature-parameter mutation (feature-signature editor).
 * Adding/renaming/retyping/removing a parameter rebuilds the `definition.*`
 * outputs, keeps `context`/`id`, and renames the feature via annotation+title.
 * Serialization persists the edited preconditions.
 */
import { describe, expect, it } from "vitest";

import { DefineFeatureNode } from "../../rete/nodes/definefeaturenode";

function makeNode() {
  const node = new DefineFeatureNode({
    annotation: { type: "Feature Type Name", value: "My Feature" },
    preconditions: [
      {
        annotation: { type: "Property Function Name", value: "radius" },
        btType: "BTParameterSpecQuantity-173",
      },
    ],
  });
  return node;
}

describe("DefineFeatureNode parameter mutation", () => {
  it("exposes definition.* outputs plus context/id by default", () => {
    const node = makeNode();
    expect(Object.keys(node.outputs).sort()).toEqual(["context", "definition.radius", "id"]);
  });

  it("addParameter creates definition.<sanitized> output with the mapped btType", () => {
    const node = makeNode();
    const key = node.addParameter("my param", "string");
    expect(key).toBe("definition.myparam");
    expect(Object.keys(node.outputs)).toContain("definition.myparam");
    expect(Object.keys(node.outputs)).toContain("context");
    expect(Object.keys(node.outputs)).toContain("id");
    const state = node.getDefineFeatureState();
    expect(state.parameters.map((p) => p.socketKey)).toContain("definition.myparam");
    expect(state.parameters.find((p) => p.socketKey === "definition.myparam")?.valueType).toBe("string");
  });

  it("updateParameter rename re-keys the socket and drops the old key", () => {
    const node = makeNode();
    expect(node.updateParameter("definition.radius", { name: "width" })).toBe(true);
    expect(Object.keys(node.outputs)).toContain("definition.width");
    expect(Object.keys(node.outputs)).not.toContain("definition.radius");
  });

  it("updateParameter retype keeps the key and changes the btType", () => {
    const node = makeNode();
    expect(node.updateParameter("definition.radius", { valueType: "boolean" })).toBe(true);
    expect(Object.keys(node.outputs)).toContain("definition.radius");
    const state = node.getDefineFeatureState();
    expect(state.parameters[0].valueType).toBe("boolean");
    expect(state.parameters[0].btType).toBe("BTParameterSpecBoolean-170");
  });

  it("removeParameter drops the socket but keeps context/id", () => {
    const node = makeNode();
    expect(node.removeParameter("definition.radius")).toBe(true);
    expect(Object.keys(node.outputs).sort()).toEqual(["context", "id"]);
    expect(node.getDefineFeatureState().parameters).toHaveLength(0);
  });

  it("unknown keys are rejected without throwing", () => {
    const node = makeNode();
    expect(node.updateParameter("definition.nope", { name: "x" })).toBe(false);
    expect(node.removeParameter("definition.nope")).toBe(false);
    expect(node.addParameter("   ", "string")).toBeNull();
  });

  it("setFeatureName updates annotation and node title", () => {
    const node = makeNode();
    node.setFeatureName("Fillet Deluxe");
    expect(node.getFeatureName()).toBe("Fillet Deluxe");
    expect(node.getTitle()).toBe("Fillet Deluxe");
  });

  it("toJSON persists the edited preconditions", () => {
    const node = makeNode();
    node.addParameter("depth", "numberValueWithUnits");
    node.updateParameter("definition.radius", { name: "diameter" });
    const json = node.toJSON() as unknown as {
      preconditions: { annotation: { value: string }; btType: string }[];
    };
    expect(json.preconditions.map((p) => p.annotation.value)).toContain("diameter");
    expect(json.preconditions.map((p) => p.annotation.value)).toContain("depth");
    const restored = DefineFeatureNode.fromJSON(json as never);
    const state = restored.getDefineFeatureState();
    expect(state.parameters.map((p) => p.socketKey)).toContain("definition.diameter");
    expect(state.parameters.map((p) => p.socketKey)).toContain("definition.depth");
    expect(state.parameters.find((p) => p.socketKey === "definition.depth")?.btType).toBe(
      "BTParameterSpecQuantity-173",
    );
  });
});

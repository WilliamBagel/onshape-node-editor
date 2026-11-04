import { ClassicPreset } from "rete";
import { OnshapeNode } from "./onshapenode";
import { OnshapeSocket } from "../onshapesockets";
import { OnshapeOutput } from "../inputoutput/onshapeoutput";
import { NodeFeaturescriptInfo } from "../../onshape-utils/featurestudiogenerator";
import type { CatalogEntry, CatalogPort } from "../../onshape/catalog/types";
import type { SerializedFunctionNode, SerializedNodeBase } from "../serialization/graph-schema-types";

/** #8: a pure (value) FeatureScript function from the catalog, e.g. `cross`. */
export class FunctionNode extends OnshapeNode {
  public readonly functionName: string;
  public readonly ports: readonly CatalogPort[];

  constructor(entry: CatalogEntry) {
    super("function", entry.name);
    this.functionName = entry.name;
    this.ports = entry.inputs;
    for (const port of entry.inputs) {
      const key = port.name || `${port.valueType}${this.inputs ? Object.keys(this.inputs).length : 0}`;
      this.addInput(key, new ClassicPreset.Input(new OnshapeSocket(port.valueType), port.name || port.valueType));
    }
    const outType = entry.outputs[0]?.valueType ?? "Unknown";
    this.addOutput("return", new OnshapeOutput(new OnshapeSocket(outType), outType));
  }

  public getTitle(): string { return this.functionName; }

  public toJSON(): SerializedFunctionNode {
    return { ...(super.toJSON() as SerializedNodeBase), kind: "function", functionName: this.functionName, inputs: this.ports.map(p => ({ ...p })) };
  }

  public static fromJSON(data: SerializedFunctionNode, resolveEntry?: (name: string) => CatalogEntry | undefined): FunctionNode {
    const entry = resolveEntry?.(data.functionName);
    const node = entry ? new FunctionNode(entry) : new FunctionNode({
      key: `function::${data.functionName}`, name: data.functionName, category: "Math", file: "", descriptor: "", signature: "",
      description: "", kind: "value", nodeable: true, inputs: data.inputs ?? [], outputs: [],
    });
    node.applySerializedBase(data);
    return node;
  }

  public getFeaturescript(variableMapping: Record<string, string>): string {
    const args = Object.keys(this.inputs).map(k => variableMapping[k] ?? k).join(", ");
    return `${this.functionName}(${args})`;
  }

  public getFeatureScriptInfo(variableMapping: Record<string, string>): NodeFeaturescriptInfo {
    return { line: this.getFeaturescript(variableMapping), postindent: 0, dependencies: [] };
  }
}

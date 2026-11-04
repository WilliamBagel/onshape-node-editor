import { ClassicPreset } from "rete";
import { OnshapeNode } from "./onshapenode";
import { OnshapeSocket } from "../onshapesockets";
import { OnshapeOutput } from "../inputoutput/onshapeoutput";
import { NodeFeaturescriptInfo } from "../../onshape-utils/featurestudiogenerator";
import { ValueExpression } from "../../onshape-utils/expressioncodegen";
import { parseValueType, ValueType } from "../../onshape-utils/valuetypes";
import type { CatalogEntry, CatalogPort } from "../../onshape/catalog/types";
import { UTILITY_BY_ID } from "../../onshape/catalog/utility-overrides";
import type { SerializedFunctionNode, SerializedNodeBase } from "../serialization/graph-schema-types";

export interface FunctionNodeMeta {
    /** Curated utility identity (issue #11). */
    utilityId?: string;
    /** Display title (overloads make the bare FS name ambiguous). */
    displayName?: string;
    /** Tooltip text; names the FeatureScript function mapped to. */
    tooltip?: string;
    /** Expression template with `{inputKey}` placeholders; default `fsName(args)`. */
    template?: string;
}

/** #8: a pure (value) FeatureScript function from the catalog, e.g. `cross`. */
export class FunctionNode extends OnshapeNode {
  public readonly functionName: string;
  public readonly ports: readonly CatalogPort[];
  /** Output port definition (value type of the `return` socket); persisted for round-trip. */
  public readonly outputPorts: readonly CatalogPort[];
  /** Curated utility identity, when created by the utility registry. */
  public readonly utilityId?: string;
  /** Tooltip text naming the FeatureScript function mapped to. */
  public readonly tooltip?: string;
  /** Expression template override (e.g. an array literal). */
  private readonly template?: string;
  /** Per-input FeatureScript literals for unconnected inputs. */
  private literals: Record<string, string> = {};

  constructor(entry: CatalogEntry, meta: FunctionNodeMeta = {}) {
    super("function", meta.displayName ?? entry.name);
    this.functionName = entry.name;
    this.ports = entry.inputs;
    this.outputPorts = [...entry.outputs];
    this.utilityId = meta.utilityId ?? entry.utilityId;
    this.tooltip = meta.tooltip ?? entry.description;
    this.template = meta.template;
    for (const port of entry.inputs) {
      const key = port.name || `${port.valueType}${this.inputs ? Object.keys(this.inputs).length : 0}`;
      this.addInput(key, new ClassicPreset.Input(new OnshapeSocket(port.valueType), port.name || port.valueType));
      if (port.defaultLiteral != null) {
        this.literals[port.name] = port.defaultLiteral;
      }
    }
    const outType = entry.outputs[0]?.valueType ?? "Unknown";
    this.addOutput("return", new OnshapeOutput(new OnshapeSocket(outType), outType));
  }

  public getTitle(): string { return this.title; }

  /** Set the literal emitted for an unconnected input (or cleared with `undefined`). */
  public setLiteral(key: string, literal: string | undefined): void {
    if (literal == null) {
      delete this.literals[key];
    } else {
      this.literals[key] = literal;
    }
  }

  public getLiteral(key: string): string | undefined {
    return this.literals[key];
  }

  /** Current literals, for serialization. */
  public getLiterals(): Record<string, string> {
    return { ...this.literals };
  }

  public toJSON(): SerializedFunctionNode {
    return {
      ...(super.toJSON() as SerializedNodeBase),
      kind: "function",
      functionName: this.functionName,
      outputs: this.outputPorts.length > 0 ? this.outputPorts.map(p => ({ ...p })) : [{ name: "return", valueType: ((this.outputs["return"]?.socket as OnshapeSocket | undefined)?.valueType?.name ?? "Unknown") as CatalogPort["valueType"], scrapedType: ((this.outputs["return"]?.socket as OnshapeSocket | undefined)?.valueType?.name ?? "Unknown"), description: "" } as CatalogPort],
      inputs: this.ports.map(p => ({ ...p })),
      ...(this.utilityId != null ? { utilityId: this.utilityId } : {}),
      ...(Object.keys(this.literals).length > 0 ? { literals: { ...this.literals } } : {}),
    };
  }

  public static fromJSON(data: SerializedFunctionNode, resolveEntry?: (name: string) => CatalogEntry | undefined, resolveMeta?: (utilityId: string) => FunctionNodeMeta | undefined): FunctionNode {
    const entry = resolveEntry?.(data.functionName);
    const meta: FunctionNodeMeta | undefined = data.utilityId != null ? resolveMeta?.(data.utilityId) : undefined;
    const base = entry ?? {
      key: `function::${data.functionName}`, name: data.functionName, category: "Math", file: "", descriptor: "", signature: "",
      description: "", kind: "value" as const, nodeable: true, inputs: data.inputs ?? [], outputs: [],
    };
    const persistedOutputs = data.outputs != null && data.outputs.length > 0 ? data.outputs : undefined;
    const utilityOutputs = (data.utilityId != null ? (UTILITY_BY_ID[data.utilityId]?.outputs ?? undefined) : undefined);
    const resolvedOutputs = persistedOutputs ?? (base.outputs.length > 0 ? base.outputs : (utilityOutputs ?? []));
    const node = new FunctionNode({ ...base, outputs: resolvedOutputs, ...(data.utilityId != null ? { utilityId: data.utilityId } : {}) }, meta ?? {});
    if (data.literals != null) {
      for (const [key, literal] of Object.entries(data.literals)) {
        node.setLiteral(key, literal);
      }
    }
    node.applySerializedBase(data);
    return node;
  }

  public getVariableSymbols(): string[] {
    return ["return"];
  }

  private argumentFor(key: string, variableMapping: Record<string, string>): string {
    return variableMapping[key] ?? this.literals[key] ?? key;
  }

  public getFeaturescript(variableMapping: Record<string, string>): string {
    if (this.template != null) {
      return this.template.replace(/\{([^{}]+)\}/g, (_match, key: string) => this.argumentFor(key, variableMapping));
    }
    const args = Object.keys(this.inputs).map(k => this.argumentFor(k, variableMapping)).join(", ");
    return `${this.functionName}(${args})`;
  }

  /** Issue #10: value-node IR with literal defaults for unconnected inputs. */
  public getExpressionInfo(context: {
    variableMapping: Record<string, string>;
    inputProducers: Record<string, string>;
  }): ValueExpression | undefined {
    const outputSocket = this.outputs["return"]?.socket as OnshapeSocket | undefined;
    const valueType: ValueType = outputSocket?.valueType ?? parseValueType(outputSocket?.name);
    const template = this.template ?? `${this.functionName}(${Object.keys(this.inputs).map(k => `{${k}}`).join(", ")})`;
    const inputs: Record<string, string> = {};
    for (const key of Object.keys(this.inputs)) {
      const producer = context.inputProducers[key];
      if (producer != null) {
        inputs[key] = producer;
      } else if (context.variableMapping[key] != null) {
        // External identifier (parameter, context) — verbatim.
        inputs[key] = context.variableMapping[key];
      } else {
        inputs[key] = this.literals[key] ?? key;
      }
    }
    return {
      nodeId: this.id,
      producer: this.getTitle(),
      expression: template,
      inputs,
      valueType,
    };
  }

  public getFeatureScriptInfo(variableMapping: Record<string, string>): NodeFeaturescriptInfo {
    return { line: this.getFeaturescript(variableMapping), postindent: 0, dependencies: [] };
  }
}

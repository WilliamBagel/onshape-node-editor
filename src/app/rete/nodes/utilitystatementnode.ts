import { ClassicPreset } from "rete";
import { OnshapeNode } from "./onshapenode";
import { OnshapeSocket } from "../onshapesockets";
import { OnshapeInput } from "../inputoutput/onshapeinput";
import { OnshapeOutput } from "../inputoutput/onshapeoutput";
import { NodeFeaturescriptInfo } from "../../onshape-utils/featurestudiogenerator";
import type { CatalogPort } from "../../onshape/catalog/types";
import type {
    SerializedNodeBase,
    SerializedUtilityStatementNode,
} from "../serialization/graph-schema-types";

/**
 * #11: a curated statement utility (opTransform, instance on points).
 *
 * Unlike CustomFeatureNode (driven by a 1,000-line BT spec), these nodes
 * have fixed, curated codegen: one statement line with a definition map
 * literal. `context`/`id` are passed through from the graph like any other
 * statement; the remaining inputs come from the curated port list.
 */
export interface UtilityStatementDef {
    utilityId: string;
    displayName: string;
    tooltip: string;
    /** Definition-map keys per input, in emission order. */
    definition: { key: string; mapKey: string }[];
    /** FeatureScript function this statement calls. */
    fsFunction: "opTransform" | "opPattern";
}

export class UtilityStatementNode extends OnshapeNode {
    public readonly utilityId: string;
    public readonly tooltip: string;
    private readonly def: UtilityStatementDef;
    private readonly ports: readonly CatalogPort[];
    private literals: Record<string, string> = {};

    constructor(def: UtilityStatementDef, ports: readonly CatalogPort[]) {
        super("utility-statement", def.displayName);
        this.def = def;
        this.utilityId = def.utilityId;
        this.tooltip = def.tooltip;
        this.ports = ports;

        const contextInput = new OnshapeInput(
            new OnshapeSocket("Context"),
            "Context",
            "Context",
            { type: "Context", value: "Context" } as never,
        );
        this.addInput("context", contextInput);
        const idInput = new OnshapeInput(
            new OnshapeSocket("Id"),
            "Id",
            "Id",
            { type: "Context", value: "_0" } as never,
        );
        this.addInput("id", idInput);

        for (const portDef of ports) {
            const key = portDef.name;
            this.addInput(key, new ClassicPreset.Input(new OnshapeSocket(portDef.valueType), portDef.name || portDef.valueType));
            if (portDef.defaultLiteral != null) {
                this.literals[portDef.name] = portDef.defaultLiteral;
            }
        }
        this.addOutput("context", new OnshapeOutput(new OnshapeSocket("Context"), "Context"));
    }

    public getTitle(): string {
        return this.def.displayName;
    }

    public getVariableSymbols(): string[] {
        return ["context"];
    }

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

    public getLiterals(): Record<string, string> {
        return { ...this.literals };
    }

    private argumentFor(key: string, variableMapping: Record<string, string>): string {
        return variableMapping[key] ?? this.literals[key] ?? key;
    }

    public getFeaturescript(variableMapping: Record<string, string>): string {
        const context = variableMapping["context"] ?? "context";
        const id = variableMapping["id"] ?? "id";
        const parts = this.def.definition.map(
            ({ key, mapKey }) => `"${mapKey}" : ${this.argumentFor(key, variableMapping)}`,
        );
        return `${this.def.fsFunction}(${context}, ${id}, { ${parts.join(", ")} });`;
    }

    public getFeatureScriptInfo(variableMapping: Record<string, string>): NodeFeaturescriptInfo {
        return { line: this.getFeaturescript(variableMapping) };
    }

    public toJSON(): SerializedUtilityStatementNode {
        return {
            ...(super.toJSON() as SerializedNodeBase),
            kind: "utility-statement",
            utilityId: this.utilityId,
            ...(Object.keys(this.literals).length > 0 ? { literals: { ...this.literals } } : {}),
        } as SerializedUtilityStatementNode;
    }

    public static fromJSON(
        data: SerializedUtilityStatementNode,
        resolveDef: (utilityId: string) => { def: UtilityStatementDef; ports: readonly CatalogPort[] } | undefined,
    ): UtilityStatementNode {
        const resolved = resolveDef(data.utilityId);
        if (resolved == null) {
            throw new Error(`Unknown utility statement "${data.utilityId}".`);
        }
        const node = new UtilityStatementNode(resolved.def, resolved.ports);
        if (data.literals != null) {
            for (const [key, literal] of Object.entries(data.literals)) {
                node.setLiteral(key, literal);
            }
        }
        node.applySerializedBase(data);
        return node;
    }
}

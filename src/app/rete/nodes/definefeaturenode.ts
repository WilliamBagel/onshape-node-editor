import { Annotation } from "../../onshape-utils/featurescripttypes";
import { OnshapeNode, VariablePointer } from "./onshapenode";
import { OnshapeOutput } from "../inputoutput/onshapeoutput";
import { OnshapeSocket } from "../onshapesockets";
import { NodeFeaturescriptInfo } from "../../onshape-utils/featurestudiogenerator";
import { btTypeToFeaturescriptType, getSpecFromFeatureSpec } from "../../onshape-utils/bttypetools";
import { STD } from "../../onshape-utils/stdlib";
import { camelize } from "../../utils/stringutils";
import type {
    SerializedDefineFeatureNode,
    SerializedNodeBase,
} from "../serialization/graph-schema-types";

const PARAMETER_BT_TYPE: Record<string, string> = {
    numberValueWithUnits: "BTParameterSpecQuantity-173",
    ValueWithUnits: "BTParameterSpecQuantity-173",
    number: "BTParameterSpecQuantity-173",
    boolean: "BTParameterSpecBoolean-170",
    Boolean: "BTParameterSpecBoolean-170",
    string: "BTParameterSpecString-175",
    String: "BTParameterSpecString-175",
    Query: "BTParameterSpecQuery-174",
    QueryList: "BTParameterSpecQuery-174",
    Enum: "BTParameterSpecEnum-171",
};

const BT_TYPE_VALUE_TYPE: Record<string, string> = {
    "BTParameterSpecQuantity-173": "numberValueWithUnits",
    "BTParameterSpecBoolean-170": "boolean",
    "BTParameterSpecString-175": "string",
    "BTParameterSpecString-169": "string",
    "BTParameterSpecQuery-174": "Query",
    "BTParameterSpecEnum-171": "Enum",
};

export function valueTypeToBtType(valueType: string): string {
    return PARAMETER_BT_TYPE[valueType] ?? "BTParameterSpecString-175";
}

export function btTypeToValueType(btType: string): string {
    return BT_TYPE_VALUE_TYPE[btType] ?? "unknown";
}

export interface DefineFeatureParameterState {
    socketKey: string;
    name: string;
    valueType: string;
    btType: string;
}

export interface DefineFeatureState {
    nodeId: string;
    featureName: string;
    parameters: DefineFeatureParameterState[];
}


export interface Precondition {
    annotation: Annotation
    btType: string
}

export interface DefineFeatureData {
    annotation: Annotation;
    preconditions: Precondition[];
}

export class DefineFeatureNode extends OnshapeNode {
    private annotation: Annotation;
    private preconditions: Precondition[];
    private validPreconditionIdentifierMap: Record<string, string> = {};

    constructor(data: DefineFeatureData) {
        super("define-feature", data.annotation.value);

        this.annotation = data.annotation;
        this.preconditions = data.preconditions;

        this.addDefaultOutputs();
        this.validatePreconditionIdentifiers();
        this.loadPreconditions();
    }

    private addDefaultOutputs(): void {
        const outputContext = new OnshapeOutput(new OnshapeSocket("Context"), "Context");
        this.addOutput("context", outputContext);
        const outputId = new OnshapeOutput(new OnshapeSocket("Id"), "Id");
        this.addOutput("id", outputId);
    }

    private loadPreconditions(): void {
        for (const precondition of this.preconditions) {
            const output = new OnshapeOutput(new OnshapeSocket(precondition.annotation.value), precondition.btType);
            this.addOutput(this.validPreconditionIdentifierMap[precondition.annotation.value], output);
        }
    }

    private validatePreconditionIdentifiers(): void {
        for (const precondition of this.preconditions) {
            this.validPreconditionIdentifierMap[precondition.annotation.value] = DefineFeatureNode.socketKeyFor(precondition.annotation.value);
        }
    }

    /** The output-socket key for a parameter name: `definition.<sanitized>`. */
    static socketKeyFor(name: string): string {
        return 'definition.' + name.replaceAll(/\s+/g, "");
    }

    /** Current feature name (annotation value, mirrored on the node title). */
    getFeatureName(): string {
        return this.annotation.value;
    }

    /** Rename the feature: annotation + visible node title follow. */
    setFeatureName(name: string): void {
        const trimmed = name.trim();
        if (trimmed === "") return;
        this.annotation.value = trimmed;
        this.setTitle(trimmed);
    }

    /** Deduped output keys for the current preconditions (mirrors rebuildOutputs). */
    private parameterKeys(): string[] {
        const taken = new Set<string>(["context", "id"]);
        return this.preconditions.map((precondition) => {
            const base = DefineFeatureNode.socketKeyFor(precondition.annotation.value);
            let key = base;
            let n = 2;
            while (taken.has(key)) key = `${base}_${n++}`;
            taken.add(key);
            return key;
        });
    }

    /** Panel state: feature name + one entry per precondition parameter. */
    getDefineFeatureState(): DefineFeatureState {
        const keys = this.parameterKeys();
        return {
            nodeId: this.id,
            featureName: this.getFeatureName(),
            parameters: this.preconditions.map((precondition, index) => ({
                socketKey: keys[index],
                name: precondition.annotation.value,
                valueType: btTypeToValueType(precondition.btType),
                btType: precondition.btType,
            })),
        };
    }

    /**
     * Rebuild the precondition output sockets from the current preconditions,
     * preserving the `context`/`id` outputs. Keys stay
     * `definition.<sanitizedName>`; duplicate names get numeric suffixes so
     * two parameters never share one socket. The editor host prunes wires
     * whose socket disappeared (rename/remove) after this runs.
     */
    rebuildOutputs(): void {
        // Preserve context/id output objects so their connections survive a
        // retype (same keys); everything else is rebuilt from preconditions.
        const preserved: Record<string, OnshapeOutput> = {};
        for (const key of ["context", "id"]) {
            const output = this.outputs[key];
            if (output != null) preserved[key] = output;
        }
        for (const key of Object.keys(this.outputs)) {
            if (key === "context" || key === "id") continue;
            this.removeOutput(key);
        }
        if (preserved["context"] == null) preserved["context"] = new OnshapeOutput(new OnshapeSocket("Context"), "Context");
        if (preserved["id"] == null) preserved["id"] = new OnshapeOutput(new OnshapeSocket("Id"), "Id");
        // Re-add defaults if somehow missing (fresh node built by constructor
        // already has them; this keeps rebuild total).
        for (const [key, output] of Object.entries(preserved)) {
            if (this.outputs[key] == null) this.addOutput(key, output);
        }
        const taken = new Set<string>(["context", "id"]);
        for (const precondition of this.preconditions) {
            const base = DefineFeatureNode.socketKeyFor(precondition.annotation.value);
            let key = base;
            let n = 2;
            while (taken.has(key)) key = `${base}_${n++}`;
            taken.add(key);
            this.addOutput(key, new OnshapeOutput(new OnshapeSocket(precondition.annotation.value), precondition.btType));
        }
    }

    /** Add a new precondition parameter; returns its socket key. */
    addParameter(name: string, valueType: string): string | null {
        const trimmed = name.trim();
        if (trimmed === "") return null;
        this.preconditions.push({
            annotation: { type: "Property Function Name", value: trimmed },
            btType: valueTypeToBtType(valueType),
        });
        this.rebuildOutputs();
        return DefineFeatureNode.socketKeyFor(trimmed);
    }

    /** Rename/retype the parameter currently exposed as `socketKey`. */
    updateParameter(socketKey: string, patch: { name?: string; valueType?: string }): boolean {
        const index = this.parameterKeys().indexOf(socketKey);
        if (index < 0) return false;
        const precondition = this.preconditions[index];
        if (patch.name != null && patch.name.trim() !== "") {
            precondition.annotation.value = patch.name.trim();
        }
        if (patch.valueType != null) {
            precondition.btType = valueTypeToBtType(patch.valueType);
        }
        this.rebuildOutputs();
        return true;
    }

    /** Remove the parameter currently exposed as `socketKey`. */
    removeParameter(socketKey: string): boolean {
        const index = this.parameterKeys().indexOf(socketKey);
        if (index < 0) return false;
        this.preconditions.splice(index, 1);
        this.rebuildOutputs();
        return true;
    }

    // public data(inputs: Record<string, any>): Record<string, any> {
    //     return {
    //         name: this.annotation.value,
    //         id: this.id
    //     };
    // }

    // public data(inputs: Record<string, any>): Record<string, any> {
    //     const data: Record<string, VariablePointer> = {};

    //     // define variables for each precondition output
    //     for (const [key, output] of Object.entries(this.outputs)) {
    //         const variableName = key.replace(/\s+/g, "");
    //         data[key] = {
    //             name: variableName,
    //             id: this.id
    //         };
    //     }

    //     return data;
    // }

    public toJSON(): SerializedDefineFeatureNode {
        return {
            ...(super.toJSON() as SerializedNodeBase),
            kind: "define-feature",
            title: this.getTitle(),
            annotation: this.annotation,
            preconditions: this.preconditions,
        };
    }

    public static fromJSON(data: SerializedDefineFeatureNode): DefineFeatureNode {
        const node = new DefineFeatureNode({
            annotation: data.annotation,
            preconditions: data.preconditions,
        });
        node.applySerializedBase(data);
        node.setTitle(data.title);
        return node;
    }

    public getVariableSymbols(): string[] {
        const variables = ['context', 'id'];
        for (const precondition of this.preconditions) {
            variables.push(this.validPreconditionIdentifierMap[precondition.annotation.value])
        }
        return variables;
    }

    /**
     * The parameters the generated feature declares, in author order.
     *
     * Each `precondition` entry becomes `definition.<id> is <type>` in the
     * generated Feature Studio, which is what makes it a parameter of the feature
     * that #2 inserts into a Part Studio. `Run` reads them through
     * `describeGeneratedFeature`.
     */
    public getPreconditions(): readonly Precondition[] {
        return this.preconditions;
    }

    public getFeaturescript(variableMapping: Record<string, string>): string {
        let preconditionString: string = "precondition\n{\n";

        for (const precondition of this.preconditions) {
            preconditionString += `\tannotation{"${precondition.annotation.type}": "${precondition.annotation.value}"}\n`
            const preconditionIdentifier = this.validPreconditionIdentifierMap[precondition.annotation.value];
            preconditionString += `\t${preconditionIdentifier} is ${btTypeToFeaturescriptType(precondition.btType)};\n`
        }

        preconditionString += '}';

        return [
            `annotation { "${this.annotation.type}" : "${this.title}" }`,
            `export const ${camelize(this.getTitle())} = defineFeature(function(context is Context, id is Id, definition is map)`,
            preconditionString,
            `{`
        ].join('\n');
    }

    public getDependencies(): Array<{ path: string, version: string }> {
        return [
            { path: 'onshape/std/feature.fs', version: STD.VERSION },
            { path: 'onshape/std/units.fs', version: STD.VERSION }
        ]
    }

    public getFeatureScriptInfo(variableMapping: Record<string, string>): NodeFeaturescriptInfo {
        return {
            line: this.getFeaturescript(variableMapping),
            postindent: 1,
            dependencies: this.getDependencies()
        };
    }
}

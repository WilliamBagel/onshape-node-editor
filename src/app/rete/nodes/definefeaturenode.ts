import { Annotation } from "../../onshape-utils/featurescripttypes";
import { OnshapeNode, VariablePointer } from "./onshapenode";
import { OnshapeOutput } from "../inputoutput/onshapeoutput";
import { OnshapeSocket } from "../onshapesockets";
import { NodeFeaturescriptInfo } from "../../onshape-utils/featurestudiogenerator";
import { btTypeToFeaturescriptType, getSpecFromFeatureSpec } from "../../onshape-utils/bttypetools";
import { STD } from "../../onshape-utils/stdlib";
import { camelize } from "../../utils/stringutils";

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
            this.validPreconditionIdentifierMap[precondition.annotation.value] = 'definition.' + precondition.annotation.value.replaceAll(/\s+/g, "");
        }
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

    public getVariableSymbols(): string[] {
        const variables = ['context', 'id'];
        for (const precondition of this.preconditions) {
            variables.push(this.validPreconditionIdentifierMap[precondition.annotation.value])
        }
        return variables;
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

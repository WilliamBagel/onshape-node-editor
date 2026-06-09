import { ClassicPreset, GetSchemes } from "rete";
import { OnshapeNode } from "./nodes/onshapenode";
import { VueArea2D } from "rete-vue-plugin";
import { StyleSettings } from "./stylesettings";
import { SocketData } from "rete-connection-plugin";

export class Connection<A extends OnshapeNode, B extends OnshapeNode> extends ClassicPreset.Connection<A, B> {
    public snapped: boolean = false;
    // Ensure inputs/outputs are typed as strings to satisfy ClassicScheme constraints
    declare public sourceOutput: string;
    declare public targetInput: string;
    constructor(
        source: A, sourceOutput: keyof A['outputs'] & string, public sourceType: string,
        target: B, targetInput: keyof B['inputs'] & string, public targetType: string,
        public styleSettings: StyleSettings
    ) {
        super(source, sourceOutput, target, targetInput);
        this.sourceOutput = sourceOutput;
        this.targetInput = targetInput;
    }
}

export type Schemes = GetSchemes<
    OnshapeNode,
    Connection<OnshapeNode, OnshapeNode>
>;
export type AreaExtra = VueArea2D<Schemes>;

export interface OnshapeSocketData extends SocketData {
    btType: string;
}
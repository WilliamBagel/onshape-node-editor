import { ClassicPreset, GetSchemes } from "rete";
import { OnshapeNode } from "./nodes/onshapenode";
import { VueArea2D } from "rete-vue-plugin";
import { StyleSettings } from "./stylesettings";
import { SocketData } from "rete-connection-plugin";

export class Connection<A extends OnshapeNode, B extends OnshapeNode> extends ClassicPreset.Connection<A, B> {
    public snapped: boolean = false;
    constructor(
        source: A, sourceOutput: keyof A['outputs'], public sourceType: string,
        target: B, targetInput: keyof B['inputs'], public targetType: string,
        public styleSettings: StyleSettings
    ) {
        super(source, sourceOutput, target, targetInput);
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
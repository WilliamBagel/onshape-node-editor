import { ClassicPreset, GetSchemes } from "rete";
import { OnshapeNode } from "./nodes/onshapenode";
import { VueArea2D } from "rete-vue-plugin";

export class Connection<A extends OnshapeNode, B extends OnshapeNode> extends ClassicPreset.Connection<A, B> { }

export type Schemes = GetSchemes<
    OnshapeNode,
    Connection<OnshapeNode, OnshapeNode>
>;
export type AreaExtra = VueArea2D<Schemes>;
import { NodeEditor } from "rete";
import { Schemes } from "./types";
import { OnshapeInput } from "./inputoutput/onshapeinput";
import { OnshapeOutput } from "./inputoutput/onshapeoutput";
import { OnshapeNode } from "./nodes/onshapenode";
import { Socket } from "rete/_types/presets/classic";


type Input = OnshapeInput;
type Output = OnshapeOutput;

/**
 * Partial source: https://github.com/Ni55aN/allmatter/blob/main/src/editor/utils.ts#L77
 * @param editor 
 * @param connection 
 * @returns 
 */
export function getConnectionNodes(
    editor: NodeEditor<Schemes>,
    connection: Schemes["Connection"]
): { source: OnshapeNode, target: OnshapeNode } {
    const source = editor.getNode(connection.source);
    const target = editor.getNode(connection.target);

    return {
        source,
        target,
    };
}


export function getConnectionIO(
    editor: NodeEditor<Schemes>,
    connection: Schemes["Connection"]
): { output: Output, input: Input, source: OnshapeNode, target: OnshapeNode } {
    const { source, target } = getConnectionNodes(editor, connection);

    const output =
        source &&
        (source.outputs as Record<string, Output>)[connection.sourceOutput];
    const input =
        target && (target.inputs as unknown as Record<string, Input>)[connection.targetInput];

    return {
        output: output,
        input: input,
        source,
        target
    };
}

export function getConnectionSockets(
    editor: NodeEditor<Schemes>,
    connection: Schemes["Connection"]
): { source: Socket, target: Socket } {
    const { output, input } = getConnectionIO(editor, connection);

    return {
        source: output?.socket,
        target: input?.socket
    };
}
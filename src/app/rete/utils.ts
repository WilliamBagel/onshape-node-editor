import { NodeEditor } from "rete";
import { Schemes } from "./types";
import { OnshapeOutput } from "./inputoutput/onshapeoutput";
import { OnshapeNode } from "./nodes/onshapenode";
import { Socket } from "rete/_types/presets/classic";
import { OnshapeInput } from "./inputoutput/onshapeinput";


type Input = OnshapeInput<any>;
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
): { source: OnshapeNode | undefined, target: OnshapeNode | undefined } {
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
): { output: Output, input: Input, source: OnshapeNode, target: OnshapeNode } | undefined {
    const { source, target } = getConnectionNodes(editor, connection);

    if (source == null || target == null) { return undefined };

    const output =
        source &&
        (source.outputs as Record<string, Output>)[connection.sourceOutput];
    const input =
        target && (target.inputs as unknown as Record<string, Input>)[connection.targetInput];

    if (output == null || input == null) { return undefined };

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
): { source: Socket, target: Socket } | undefined {
    const connectionIO = getConnectionIO(editor, connection);
    if (connectionIO == null) {
        return undefined;
    }
    const { output, input } = connectionIO;

    return {
        source: output?.socket,
        target: input?.socket
    };
}
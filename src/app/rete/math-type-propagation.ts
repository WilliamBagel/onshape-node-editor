/**
 * Type propagation for math-expression nodes (#math types).
 *
 * A math node's input socket is deliberately `unknown` so any otherwise
 * compatible producer can connect; the producer's value type is recorded as
 * the variable's binding and the node's `return` socket is retyped from it.
 * Two rules make that stay correct as the graph changes:
 *
 * 1. Rete bundles every producer connected to one input (`inputs[key][0]` is
 *    what `data()` and codegen consume). The binding therefore follows the
 *    first connection in `editor.getConnections()` order, not whichever
 *    producer happened to connect last.
 * 2. Recompiling a math node can change its `return` type, which must retype
 *    math consumers recursively — otherwise connecting upstream after
 *    downstream leaves the downstream variable untyped.
 */
import type { NodeEditor } from "rete";
import { MathExpressionNode } from "./nodes/mathexpressionnode";
import type { OnshapeNode } from "./nodes/onshapenode";
import type { OnshapeSocket } from "./onshapesockets";
import type { ValueType } from "../onshape-utils/valuetypes";

type GraphLike = Pick<NodeEditor<any>, "getNode" | "getConnections">;

/** Producer value type for the input, ignoring one connection id if needed. */
function firstProducerType(
    editor: GraphLike,
    targetId: string,
    targetInput: string,
    ignoreConnectionId?: string,
): ValueType | undefined {
    const connection = editor
        .getConnections()
        .find(
            (candidate) =>
                candidate.id !== ignoreConnectionId &&
                candidate.target === targetId &&
                candidate.targetInput === targetInput,
        );
    if (connection == null) return undefined;
    const source = editor.getNode(connection.source) as OnshapeNode | undefined;
    const output = source?.outputs[connection.sourceOutput];
    return (output?.socket as OnshapeSocket | undefined)?.valueType;
}

/**
 * Bind a math input to its first producer's value type (or clear it when the
 * last producer is gone). `fallback` supplies the type of a connection being
 * added, because `connectioncreate` runs before the editor records it.
 * `ignoreConnectionId` excludes one being removed, for the same reason.
 */
export function syncMathInputType(
    editor: GraphLike,
    targetId: string,
    targetInput: string,
    options: { fallback?: ValueType; ignoreConnectionId?: string } = {},
): boolean {
    const target = editor.getNode(targetId);
    if (!(target instanceof MathExpressionNode)) return false;
    const type =
        firstProducerType(editor, targetId, targetInput, options.ignoreConnectionId) ??
        options.fallback;
    if (type == null) {
        return target.clearConnectedInputType(targetInput);
    }
    return target.applyConnectedInputType(targetInput, type);
}

/**
 * Retype math nodes fed by `source`'s `return` socket, recursively. A target
 * input with several producers still follows its first producer, so only that
 * connection is allowed to drive the target's binding.
 */
export function propagateMathReturnType(
    editor: GraphLike,
    source: MathExpressionNode,
    visited: Set<string> = new Set(),
): void {
    if (visited.has(source.id)) return;
    visited.add(source.id);

    const sourceType = (source.outputs["return"]?.socket as OnshapeSocket | undefined)?.valueType;
    if (sourceType == null) return;

    for (const connection of editor.getConnections()) {
        if (connection.source !== source.id || connection.sourceOutput !== "return") continue;
        const target = editor.getNode(connection.target);
        if (!(target instanceof MathExpressionNode)) continue;

        const first = editor
            .getConnections()
            .find(
                (candidate) =>
                    candidate.target === target.id &&
                    candidate.targetInput === connection.targetInput,
            );
        if (first == null || first.id !== connection.id) continue;

        if (target.applyConnectedInputType(connection.targetInput, sourceType)) {
            target.update();
            propagateMathReturnType(editor, target, visited);
        }
    }
}

/**
 * #14: inline expansion of group instances for codegen.
 *
 * Choice (documented per the issue): **inline the subgraph at each
 * instance**, rather than emitting one FeatureScript function per group
 * definition. Trade-off: inlining duplicates the subgraph's FeatureScript
 * once per placement (more bytes, and FeatureScript has no way to share it),
 * but it needs no typed function signatures — the existing expression
 * planner already types every value — and it composes with the statement
 * pipeline unchanged. Emitting a function per definition would be smaller
 * for heavily reused groups, at the cost of inventing a typed signature
 * (parameter types, `var`/`let` scoping, and statement-order rules) for
 * every boundary socket.
 *
 * Expansion builds a fresh editor: non-instance nodes are shared, each
 * instance's member nodes are cloned with instance-scoped ids
 * (`<instanceId>:<memberId>`), nested instances expand recursively, and the
 * instance's external connections are rewired to the cloned boundary
 * members. A muted instance expands to nothing. Cloning supports
 * function/utility/array/group nodes; a CustomFeature (spec-dependent)
 * inside a group cannot be cloned here and throws a clear error.
 */
import { NodeEditor } from "rete";
import { DataflowEngine } from "rete-engine";
import { Connection, Schemes } from "../types";
import { StyleSettings } from "../stylesettings";
import { OnshapeNode } from "../nodes/onshapenode";
import { GroupNode } from "../nodes/groupinstancenode";
import { FunctionNode } from "../nodes/functionnode";
import { ArrayConcatNode, ArrayIndexNode, ArrayLiteralNode, ArraySizeNode, BoundedForNode, ForEachNode, MapArrayNode } from "../nodes/arraynodes";
import { UtilityStatementNode } from "../nodes/utilitystatementnode";
import { createUtilityNode } from "../catalog-node-factory";
import { connectGraphNodes } from "../serialization/graph-serializer";
import type { GroupDefinition } from "./groupmodel";

interface BoundaryTarget {
    node: OnshapeNode;
    socketKey: string;
}

interface ExpandedInstance {
    /** Boundary input socket id -> cloned member input. */
    inputs: Map<string, BoundaryTarget>;
    /** Boundary output socket id -> cloned member output. */
    outputs: Map<string, BoundaryTarget>;
}

function cloneMember(node: OnshapeNode, newId: string): OnshapeNode {
    let clone: OnshapeNode;
    if (node instanceof GroupNode) {
        clone = new GroupNode(node.getDefinition(), node.muted);
    } else if (node instanceof FunctionNode) {
        if (node.utilityId != null) {
            const created = createUtilityNode(node.utilityId);
            if (!(created instanceof FunctionNode)) {
                throw new Error(`Group expansion cannot clone utility node "${node.utilityId}".`);
            }
            clone = created;
            for (const [key, literal] of Object.entries(node.getLiterals())) {
                (clone as FunctionNode).setLiteral(key, literal);
            }
        } else {
            const outSocket = node.outputs["return"]?.socket as { valueType?: { name: string } } | undefined;
            const functionClone = new FunctionNode(
                {
                    key: `function::${node.functionName}`,
                    name: node.functionName,
                    category: "Math",
                    file: "",
                    descriptor: "",
                    signature: "",
                    description: "",
                    kind: "value",
                    nodeable: true,
                    inputs: node.ports.map((port) => ({ ...port })),
                    outputs: [{ name: "return", valueType: (outSocket?.valueType?.name ?? "Unknown") as never, scrapedType: "", description: "" }],
                },
                { displayName: node.getTitle(), tooltip: node.tooltip },
            );
            clone = functionClone;
            for (const [key, literal] of Object.entries(node.getLiterals())) {
                functionClone.setLiteral(key, literal);
            }
        }
    } else if (node instanceof UtilityStatementNode) {
        const utilityId = node.utilityId;
        const created = utilityId != null ? createUtilityNode(utilityId) : null;
        if (!(created instanceof UtilityStatementNode)) {
            throw new Error(`Group expansion cannot clone statement node "${node.id}" without a utility id.`);
        }
        clone = created;
    } else if (node instanceof ArrayLiteralNode) {
        clone = ArrayLiteralNode.fromJSON(node.toJSON());
    } else if (node instanceof ArrayConcatNode) {
        clone = ArrayConcatNode.fromJSON(node.toJSON());
    } else if (node instanceof ArrayIndexNode) {
        clone = ArrayIndexNode.fromJSON(node.toJSON());
    } else if (node instanceof ArraySizeNode) {
        clone = ArraySizeNode.fromJSON(node.toJSON());
    } else if (node instanceof MapArrayNode) {
        clone = MapArrayNode.fromJSON(node.toJSON());
    } else if (node instanceof ForEachNode) {
        clone = ForEachNode.fromJSON(node.toJSON());
    } else if (node instanceof BoundedForNode) {
        clone = BoundedForNode.fromJSON(node.toJSON());
    } else {
        throw new Error(
            `Group expansion cannot clone node "${node.id}" of kind "${node.type}"; ` +
            `only function, utility, array, and group nodes can be grouped.`,
        );
    }
    clone.id = newId;
    clone.group = node.group;
    clone.muted = node.muted;
    return clone;
}

/**
 * Expand every group instance in `editor` into its member nodes.
 * Returns null when the graph has no instances (the caller then runs the
 * original editor unchanged).
 */
export async function expandGroupInstances(
    editor: NodeEditor<Schemes>,
): Promise<{ editor: NodeEditor<Schemes>; engine: DataflowEngine<Schemes> } | null> {
    const instances = editor.getNodes().filter((node): node is GroupNode => node instanceof GroupNode);
    if (instances.length === 0) {
        return null;
    }

    const expanded = new NodeEditor<Schemes>();
    const engine = new DataflowEngine<Schemes>();
    expanded.use(engine);
    const styleSettings = new StyleSettings();

    const addConnection = async (
        source: OnshapeNode,
        sourceOutput: string,
        target: OnshapeNode,
        targetInput: string,
    ): Promise<void> => {
        const connection = new Connection(
            source,
            sourceOutput,
            source.outputs[sourceOutput]?.socket.name ?? sourceOutput,
            target,
            targetInput,
            target.inputs[targetInput]?.socket.name ?? targetInput,
            styleSettings,
        );
        await expanded.addConnection(connection);
        connectGraphNodes(expanded, connection);
    };

    const boundaryByInstance = new Map<string, ExpandedInstance>();

    // Non-instance nodes are shared with the original editor.
    for (const node of editor.getNodes()) {
        if (!(node instanceof GroupNode)) {
            await expanded.addNode(node);
        }
    }

    const expandInstance = async (instance: GroupNode, prefix: string, trail: string[]): Promise<ExpandedInstance> => {
        const definition: GroupDefinition = instance.getDefinition();
        if (trail.includes(definition.id)) {
            throw new Error(`Group definitions form a cycle: ${[...trail, definition.id].join(" -> ")}.`);
        }
        const result: ExpandedInstance = { inputs: new Map(), outputs: new Map() };
        if (instance.muted) {
            return result;
        }

        const clones = new Map<string, OnshapeNode>();
        const nestedBoundaries = new Map<string, ExpandedInstance>();
        for (const member of definition.nodes) {
            const clone = cloneMember(member, `${prefix}:${member.id}`);
            clones.set(member.id, clone);
            if (clone instanceof GroupNode) {
                nestedBoundaries.set(clone.id, await expandInstance(clone, clone.id, [...trail, definition.id]));
            } else {
                await expanded.addNode(clone);
            }
        }

        const resolveMember = (nodeId: string, socketKey: string, direction: "input" | "output"): BoundaryTarget => {
            const clone = clones.get(nodeId);
            if (clone == null) {
                throw new Error(`Group "${definition.id}" boundary references missing member "${nodeId}".`);
            }
            if (clone instanceof GroupNode) {
                const nested = nestedBoundaries.get(clone.id) as ExpandedInstance;
                const map = direction === "input" ? nested.inputs : nested.outputs;
                // The socket key on a nested instance already is (or
                // contains) the inner definition's boundary socket id.
                const target = map.get(socketKey) ?? map.get(`${nodeId}.${socketKey}`);
                if (target == null) {
                    throw new Error(`Nested group "${definition.id}" has no boundary socket "${nodeId}.${socketKey}".`);
                }
                return target;
            }
            return { node: clone, socketKey };
        };

        for (const connection of definition.connections) {
            const source = resolveMember(connection.source, connection.sourceOutput, "output");
            const target = resolveMember(connection.target, connection.targetInput, "input");
            await addConnection(source.node, source.socketKey, target.node, target.socketKey);
        }

        for (const socket of definition.inputs) {
            result.inputs.set(socket.id, resolveMember(socket.nodeId, socket.socketKey, "input"));
        }
        for (const socket of definition.outputs) {
            result.outputs.set(socket.id, resolveMember(socket.nodeId, socket.socketKey, "output"));
        }
        return result;
    };

    for (const instance of instances) {
        boundaryByInstance.set(instance.id, await expandInstance(instance, instance.id, []));
    }

    const resolveEndpoint = (
        nodeId: string,
        socketKey: string,
        direction: "input" | "output",
    ): BoundaryTarget | null => {
        const instance = instances.find((candidate) => candidate.id === nodeId);
        if (instance == null) {
            const node = editor.getNode(nodeId);
            return node != null && !(node instanceof GroupNode) ? { node, socketKey } : null;
        }
        const expandedInstance = boundaryByInstance.get(nodeId) as ExpandedInstance;
        const map = direction === "input" ? expandedInstance.inputs : expandedInstance.outputs;
        return map.get(socketKey) ?? null;
    };

    // Rewire every external connection through the instances' boundaries.
    // A muted instance has no boundary targets, so its connections drop —
    // consumers fall back to their own literals/defaults, as for an
    // unconnected input.
    for (const connection of editor.getConnections()) {
        const source = resolveEndpoint(connection.source, connection.sourceOutput, "output");
        const target = resolveEndpoint(connection.target, connection.targetInput, "input");
        if (source == null || target == null) {
            continue;
        }
        await addConnection(source.node, source.socketKey, target.node, target.socketKey);
    }

    return { editor: expanded, engine };
}

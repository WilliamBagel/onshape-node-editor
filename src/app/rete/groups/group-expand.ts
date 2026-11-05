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
 * function/utility/array/group nodes; a CustomFeature is cloned from its
 * (possibly live) feature spec so grouped chamfer/fillet nodes keep their
 * parameter sockets.
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
import { MathExpressionNode } from "../nodes/mathexpressionnode";
import { CustomFeatureNode } from "../nodes/customfeaturenode";
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

/** Node that can receive a FeatureScript literal for an unconnected input. */
interface LiteralCarrier { setLiteral(key: string, literal: string | undefined): void; }

function asLiteralCarrier(node: OnshapeNode | undefined): LiteralCarrier | undefined {
    return (node != null && "setLiteral" in node && typeof (node as LiteralCarrier).setLiteral === "function")
        ? (node as unknown as LiteralCarrier)
        : undefined;
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
        for (const [key, literal] of Object.entries(node.getLiterals())) {
            (clone as UtilityStatementNode).setLiteral(key, literal);
        }
    } else if (node instanceof MathExpressionNode) {
        clone = MathExpressionNode.fromJSON(node.toJSON());
    } else if (node instanceof CustomFeatureNode) {
        // Custom features keep their (possibly live) spec, so the clone can
        // rebuild the same parameter sockets inside the group definition.
        clone = new CustomFeatureNode(node.getFeatureSpec());
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
            `only function, utility, array, math-expression, and group nodes can be grouped.`,
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
    // Every expanded instance (top-level and nested), outermost first, so
    // boundary defaults apply recursively with outer defaults winning:
    // an outer default marks its leaf target, and the inner default for
    // the same leaf is then skipped.
    const instanceRecords: { instance: GroupNode; boundary: ExpandedInstance }[] = [];
    // Leaf inputs that received a real connection (internal definition
    // connections and external rewiring). A boundary default must not
    // override a leaf that is already connected.
    const connectedLeafInputs = new Set<string>();
    const leafKey = (nodeId: string, socketKey: string) => `${nodeId}:${socketKey}`;
    // External connections dropped because their source is a muted
    // instance (which expands to nothing). Treated as unconnected: the
    // boundary default applies when present, otherwise expansion fails.
    const droppedMutedInputs: { instanceId: string; socketId: string; sourceId: string }[] = [];

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
        instanceRecords.push({ instance, boundary: result });

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
            connectedLeafInputs.add(leafKey(target.node.id, target.socketKey));
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
    // A muted instance has no boundary targets, so its connections drop.
    // A connection is only "connected" when both ends resolve: a dropped
    // (muted-sourced) connection is treated as unconnected, so a boundary
    // default can apply — or, without one, expansion fails below rather
    // than emitting an undeclared variable. Connections *to* a muted
    // instance drop silently (the muted target emits nothing).
    for (const connection of editor.getConnections()) {
        const source = resolveEndpoint(connection.source, connection.sourceOutput, "output");
        const target = resolveEndpoint(connection.target, connection.targetInput, "input");
        if (source == null || target == null) {
            const sourceNode = editor.getNode(connection.source);
            const targetNode = editor.getNode(connection.target);
            const targetIsMutedInstance = targetNode instanceof GroupNode && targetNode.muted;
            if (source == null && target != null && !targetIsMutedInstance) {
                const sourceMuted = sourceNode?.muted === true;
                if (sourceMuted && targetNode instanceof GroupNode && !targetNode.muted) {
                    droppedMutedInputs.push({
                        instanceId: connection.target,
                        socketId: connection.targetInput,
                        sourceId: connection.source,
                    });
                }
                // A muted instance feeding an ordinary (non-instance)
                // node drops silently: that consumer falls back to its
                // own literals, as for an unconnected input.
            }
            continue;
        }
        await addConnection(source.node, source.socketKey, target.node, target.socketKey);
        connectedLeafInputs.add(leafKey(target.node.id, target.socketKey));
    }

    // #47/#76: a boundary input whose group socket carries a defaultLiteral,
    // and which this instance left unconnected, feeds that literal to the
    // cloned member (where the member supports literals). Applied to every
    // expanded instance — top-level and nested — outermost first. A leaf
    // already connected (internally or externally) or already defaulted by
    // an outer boundary keeps that value, so outer defaults win over inner
    // ones and wiring wins over defaults.
    const defaultedLeafInputs = new Set<string>();
    for (const record of instanceRecords) {
        for (const socket of record.instance.getDefinition().inputs) {
            if (socket.defaultLiteral == null) {
                continue;
            }
            const target = record.boundary.inputs.get(socket.id);
            if (target == null) {
                continue;
            }
            const key = leafKey(target.node.id, target.socketKey);
            if (connectedLeafInputs.has(key) || defaultedLeafInputs.has(key)) {
                continue;
            }
            const carrier = asLiteralCarrier(target.node);
            if (carrier != null) {
                carrier.setLiteral(target.socketKey, socket.defaultLiteral);
                defaultedLeafInputs.add(key);
            }
        }
    }

    // A boundary input wired from a muted instance that got no default
    // must not silently become an undeclared variable: fail before emitting.
    for (const dropped of droppedMutedInputs) {
        const boundary = boundaryByInstance.get(dropped.instanceId);
        const target = boundary?.inputs.get(dropped.socketId);
        if (target != null && defaultedLeafInputs.has(leafKey(target.node.id, target.socketKey))) {
            continue; // the boundary default supplied the value
        }
        const targetInstance = instances.find((candidate) => candidate.id === dropped.instanceId);
        const sourceNode = editor.getNode(dropped.sourceId);
        throw new Error(
            `Group expansion refused: group instance ` +
                `"${targetInstance?.getTitle() ?? dropped.instanceId}" (id "${dropped.instanceId}") ` +
                `input "${dropped.socketId}" is wired to a muted node ` +
                `"${sourceNode?.getTitle() ?? dropped.sourceId}" (id "${dropped.sourceId}"), ` +
                `which emits nothing, and the boundary input has no defaultLiteral; ` +
                `unmute that node, remove the connection, or set a default literal.`,
        );
    }

    return { editor: expanded, engine };
}

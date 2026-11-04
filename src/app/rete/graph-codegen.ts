/**
 * FeatureScript generation for a node graph.
 *
 * The body of `generateFeatureStudioSource` is the code that used to live inline
 * in `editorBase`'s `buildStudio` closure. It was moved here verbatim (issue #5)
 * so that the graph serializer's round-trip test can diff generated source
 * without a DOM, and so the app and the test run the same generator.
 */
import { NodeEditor } from "rete";
import { DataflowEngine } from "rete-engine";
import { Schemes } from "./types";
import { ReteOnshapeNodeProcessor } from "./rete-onshape-nodeprocessor";
import { FeatureStudioGenerator } from "../onshape-utils/featurestudiogenerator";
import { TopLevelVariableDefintion, VariablePointer } from "./nodes/onshapenode";
import { assembleFeatureScriptInfo, PipelineNodeInfo } from "./pipelineinfo";
import { DefineFeatureNode } from "./nodes/definefeaturenode";
import { camelize } from "../utils/stringutils";
import {
    ParameterValues,
    defaultParameterValue,
    parameterTypeForSpec,
} from "../onshape-utils/partstudiofeature";
import type { OnshapeNode } from "./nodes/onshapenode";
import {
    createStableNameAllocator,
    planExpressionBindings,
    ValueExpression,
} from "../onshape-utils/expressioncodegen";
import { validateGraphNodes } from "./graph-validation";
import { expandGroupInstances } from "./groups/group-expand";

/**
 * Generate the Feature Studio source for `editor`'s graph.
 *
 * @param engine the dataflow engine installed on `editor` *before* any node was
 *               added. `DataflowEngine` learns about nodes from `nodecreated`
 *               events, so an engine created after the graph exists would throw
 *               "node is not initialized".
 * @returns the generated source, or `undefined` when there is no end node to
 *          generate from.
 */
export async function generateFeatureStudioSource(
    editor: NodeEditor<Schemes>,
    engine: DataflowEngine<Schemes>
): Promise<string | undefined> {
    // #14: group instances are inlined (see groups/group-expand.ts for the
    // inline-vs-function trade-off). The expanded editor has no instances,
    // so the recursive call runs the ordinary pipeline below.
    const expanded = await expandGroupInstances(editor);
    if (expanded != null) {
        return generateFeatureStudioSource(expanded.editor, expanded.engine);
    }
    const nodeProcessor = new ReteOnshapeNodeProcessor(editor);
    const nodeArray = nodeProcessor.processNodes();

    if (!nodeArray) {
        console.warn('No nodes to process');
        return;
    }

    // Local-variable naming (issue #42): one global allocator with a single
    // taken-set across every desired name, so a node asking for `x` and a
    // node asking for `x0` can never receive the same identifier. Reuses
    // the #10 allocator (`desired`, then `desired0`, `desired1`, ...).
    const localVariableAllocator = createStableNameAllocator();

    // Helper function to populate a unique variable name
    const createLocalVariableIndentifier = (desired: string, nodeId: string): string =>
        localVariableAllocator.allocate(desired, nodeId);

    // map of consumer node id to map of input key and pointer to producer
    const nodeDataMap: Record<string, Record<string, VariablePointer>[]> = {};

    // map of consumer node id to map of input key and assigned identifier
    const topLevelVariablesMap: Record<string, Record<string, TopLevelVariableDefintion>> = {};

    // Muted head-of-chain (#78): a muted node whose pass-through input
    // (an output key that is also an input key, e.g. `context`) has no
    // producer has nothing to flow through. Its `data()` would omit the
    // pass-through output and the dataflow engine would die with an
    // internal error when a consumer fetches it, so refuse it here with
    // a clean validation error naming the node and the missing producer.
    // Runs before fetchInputs, which is what would otherwise throw.
    {
        const incoming = new Set<string>();
        for (const connection of editor.getConnections()) {
            incoming.add(`${connection.target}:${connection.targetInput}`);
        }
        const problems: string[] = [];
        for (const nodeId of nodeArray) {
            const node = editor.getNode(nodeId) as OnshapeNode | undefined;
            if (node == null || node.muted !== true) continue;
            for (const key of Object.keys(node.outputs ?? {})) {
                if (!(key in (node.inputs ?? {}))) continue;
                if (incoming.has(`${nodeId}:${key}`)) continue;
                // Only invalid when something actually consumes the
                // pass-through output (a disconnected muted node is
                // pruned from nodeArray and emits nothing anyway).
                const consumed = editor.getConnections().some(
                    (connection) => connection.source === nodeId && connection.sourceOutput === key,
                );
                if (!consumed) continue;
                problems.push(
                    `Node "${node.type}" (title "${node.getTitle()}", id "${node.id}"): muted ` +
                        `pass-through input "${key}" has no producer; a muted pass-through node ` +
                        `must have its "${key}" input wired to a producer, or be unmuted/removed.`,
                );
            }
        }
        if (problems.length > 0) {
            throw new Error(`Graph validation failed:\n${problems.join("\n")}`);
        }
    }

    // First pass A: fetch data for all nodes (no symbol registration yet —
    // validation must run, and may refuse the graph, before any node
    // registers an output symbol; issues #43/#48).
    for (const nodeId of nodeArray) {
        const node = editor.getNode(nodeId);
        if (node == null) {
            console.warn(`Could not find node with id ${nodeId}`);
            continue;
        }
        const nodeInputs = await engine.fetchInputs(nodeId);
        if (!(nodeInputs && typeof nodeInputs === 'object')) {
            console.warn(`Node ${nodeId} did not return valid data`);
            continue;
        }
        nodeDataMap[nodeId] = nodeInputs as Record<string, VariablePointer>[];
    }

    const producersOf = (nodeId: string): Record<string, { nodeId: string; outputKey: string }> => {
        const producers: Record<string, { nodeId: string; outputKey: string }> = {};
        for (const [key, pointers] of Object.entries(nodeDataMap[nodeId] ?? {})) {
            const pointer = pointers?.[0];
            if (pointer != null) {
                producers[key] = { nodeId: pointer.id, outputKey: pointer.name };
            }
        }
        return producers;
    };

    // Build-time validation (issue #12, plus muted/empty rules for
    // #43/#48): iteration over a Query, unbounded loops, empty math
    // expressions, and consumers of muted value producers are refused
    // before any code — or any output symbol — is generated. Muted nodes
    // themselves are excluded (they emit nothing and are not validated);
    // `validateGraphNodes` checks their consumers separately.
    // Throws an error naming every offending node.
    const activeNodeArray = nodeArray.filter((nodeId) => {
        const node = editor.getNode(nodeId) as OnshapeNode | undefined;
        return node?.muted !== true;
    });
    validateGraphNodes(
        activeNodeArray.map((nodeId) => ({
            node: editor.getNode(nodeId) as OnshapeNode,
            producers: producersOf(nodeId),
        })),
        (id) => editor.getNode(id) as OnshapeNode | undefined,
    );

    // Muted-node pass-through (#43): a consumer wired to a muted node's
    // pass-through socket (output key also an input key, e.g. `context`)
    // resolves through the muted node to the node feeding it — the muted
    // statement emits nothing and its context flows on. Consumers of a
    // muted node's value outputs already failed validation above.
    for (const nodeId of activeNodeArray) {
        const data = nodeDataMap[nodeId];
        if (data == null) continue;
        for (const key of Object.keys(data)) {
            let pointer = data[key]?.[0];
            const seen = new Set<string>();
            while (pointer != null) {
                const producerNode = editor.getNode(pointer.id) as OnshapeNode | undefined;
                if (
                    producerNode?.muted !== true ||
                    !(pointer.name in (producerNode.inputs ?? {})) ||
                    seen.has(pointer.id)
                ) {
                    break;
                }
                seen.add(pointer.id);
                const through = nodeDataMap[pointer.id]?.[pointer.name]?.[0];
                if (through == null) break;
                pointer = through;
                data[key] = [pointer];
            }
        }
    }

    // First pass B: assign variable names to the outputs of non-muted
    // nodes only, so a muted node's output is never registered.
    for (const nodeId of activeNodeArray) {
        const node = editor.getNode(nodeId);
        if (node == null || nodeDataMap[nodeId] == null) {
            continue;
        }
        const topLevelVariables = node.getTopLevelVariables();
        const tLVEntries = Object.entries(topLevelVariables);
        if (tLVEntries.length > 0) {
            const tLVDefinitions: Record<string, TopLevelVariableDefintion> = {};
            for (const [symbol, featurescript] of tLVEntries) {
                const identifier = createLocalVariableIndentifier(symbol, nodeId);
                tLVDefinitions[symbol] = { identifier, featurescript };
            }
            topLevelVariablesMap[nodeId] = tLVDefinitions;
        }
        const nodeVariables = node.getVariableSymbols();
        for (const key of nodeVariables) {
            const actualName = createLocalVariableIndentifier(key, nodeId);
            console.log(`Node ${nodeId} output '${key}' assigned variable name: ${actualName}`);
        }
    }

    // Build the variable mapping for a node's inputs, plus the producing
    // node id per input key (issue #10: the expression IR's dependency
    // edges). Inputs from a value node resolve to its hoisted `let`
    // binding once `expressionBindings` is known; before that (the
    // expression pre-pass) they resolve to the first-pass identifier,
    // which value-node implementers must not bake into their template —
    // they reference inputs by placeholder + producer id instead.
    let expressionBindings = new Map<string, string>();
    const buildVariableMapping = (nodeId: string) => {
        const variableMapping: Record<string, string> = {};
        const inputProducers: Record<string, string> = {};
        const valueDependencies: string[] = [];

        const nodeData = nodeDataMap[nodeId];
        for (const key in nodeData) {
            const variablePointer = nodeData[key]?.[0];
            if (variablePointer == null) {
                continue;
            }
            inputProducers[key] = variablePointer.id;
            if (!valueDependencies.includes(variablePointer.id)) {
                valueDependencies.push(variablePointer.id);
            }
            const hoisted = expressionBindings.get(variablePointer.id);
            if (hoisted != null) {
                variableMapping[key] = hoisted;
                continue;
            }
            // Look up the variable name from the source node's output
            const allocated = localVariableAllocator.lookup(variablePointer.name, variablePointer.id);
            if (allocated != null) {
                // set variable name to unique identifier
                variableMapping[key] = allocated;
            } else {
                console.warn(`Could not find ${variablePointer.name} and ${variablePointer.id} in indentifiers`);
            }
        }

        // add top level variables' identifiers to variableMapping, for the consumers
        const tLVDefinitions = topLevelVariablesMap[nodeId];
        if (tLVDefinitions != null) {
            for (const [key, value] of Object.entries(tLVDefinitions)) {
                variableMapping[key] = value.identifier;
            }
        }
        return { variableMapping, inputProducers, valueDependencies };
    };

    // Expression pre-pass (issue #10): collect the IR from any value nodes
    // and plan their hoisted bindings, so statement consumers below can
    // reference the `let` names. `assembleFeatureScriptInfo` re-plans the
    // same expressions (a pure function of the list), so the names agree.
    const expressions = new Map<string, ValueExpression>();
    for (const nodeId of activeNodeArray) {
        const node = editor.getNode(nodeId);
        if (node == null || nodeDataMap[nodeId] == null) {
            continue;
        }
        const { variableMapping, inputProducers } = buildVariableMapping(nodeId);
        const expression = node.getExpressionInfo({ variableMapping, inputProducers });
        if (expression != null) {
            expressions.set(nodeId, expression);
        }
    }
    if (expressions.size > 0) {
        expressionBindings = planExpressionBindings([...expressions.values()]).bindings;
    }

    // Second pass: build variable mappings for each node's inputs and generate featurescript representation
    const pipelineNodes: PipelineNodeInfo[] = [];

    for (const nodeId of activeNodeArray) {
        const node = editor.getNode(nodeId);
        if (node == null) {
            continue;
        }

        const { variableMapping, valueDependencies } = buildVariableMapping(nodeId);

        const expression = expressions.get(nodeId);
        if (expression != null) {
            // Value node: no statement lines; the expression is hoisted by
            // `assembleFeatureScriptInfo`.
            pipelineNodes.push({
                id: nodeId,
                type: node.type,
                info: { line: '' },
                expression,
                valueDependencies,
                topLevelVariables: topLevelVariablesMap[nodeId],
            });
            console.log(`Generated expression for node ${nodeId}:`, expression);
            continue;
        }

        // Get the feature script info with the variable mapping
        const info = node.getFeatureScriptInfo(variableMapping);
        pipelineNodes.push({
            id: nodeId,
            type: node.type,
            info,
            valueDependencies,
            topLevelVariables: topLevelVariablesMap[nodeId],
        });
        console.log(`Generated feature script for node ${nodeId}:`, node);
    }

    const featureScriptInfo = assembleFeatureScriptInfo(pipelineNodes);

    console.log('Final featureScriptInfo array:', featureScriptInfo);

    const featureStudioGenerator = new FeatureStudioGenerator();

    return featureStudioGenerator.generateFeatureStudioCode(featureScriptInfo);
}

/**
 * What "Run" has to know about the generated feature in order to insert it into
 * a Part Studio: the FeatureScript identifier (`featureType`), a display name,
 * and a value for every parameter the `defineFeature` declares.
 */
export type GeneratedFeatureDescription =
    | { ok: true; featureType: string; featureName: string; parameters: ParameterValues }
    | { ok: false; message: string };

/**
 * Describe the custom feature the graph defines (#2), without touching Onshape.
 *
 * The generated Feature Studio declares exactly one feature — the
 * `define-feature` node's — and its parameters are that node's `precondition`
 * entries (`definition.<id> is <type>`). There is no per-parameter editor in the
 * graph yet, so each value is the type's neutral default (see
 * `defaultParameterValue`): the instance is inserted and then edited in Onshape.
 * A parameter whose spec has no mapping or no default is *not* guessed at; the
 * whole insert is refused naming that parameter, which is the same rule the
 * request builder applies.
 */
export function describeGeneratedFeature(nodes: readonly OnshapeNode[]): GeneratedFeatureDescription {
    const defineNodes = nodes.filter((node): node is DefineFeatureNode => node instanceof DefineFeatureNode);

    if (defineNodes.length === 0) {
        return { ok: false, message: 'Nothing to run: the graph has no Define Feature node.' };
    }
    if (defineNodes.length > 1) {
        return {
            ok: false,
            message:
                `The graph has ${defineNodes.length} Define Feature nodes, so it does not describe a single ` +
                'feature that can be inserted into a Part Studio.',
        };
    }

    const node = defineNodes[0];
    const featureName = node.getTitle();
    const featureType = camelize(featureName);
    if (featureType === '') {
        return { ok: false, message: 'Nothing to run: the Define Feature node has no feature type name.' };
    }

    const parameters: ParameterValues = {};
    for (const precondition of node.getPreconditions()) {
        const parameterId = precondition.annotation.value.replace(/\s+/g, '');
        if (parameterId === '') {
            return { ok: false, message: 'The Define Feature node declares a parameter with an empty name.' };
        }
        if (parameters[parameterId] !== undefined) {
            return {
                ok: false,
                message: `The Define Feature node declares the parameter "${parameterId}" twice.`,
            };
        }

        const parameterType = parameterTypeForSpec(precondition.btType);
        if (parameterType === undefined) {
            return {
                ok: false,
                message:
                    `Parameter "${parameterId}" declares ${precondition.btType ?? 'no btType'}, which has no ` +
                    'FeatureScript type mapping; Run cannot build its value.',
            };
        }

        const value = defaultParameterValue(parameterType);
        if (value === undefined) {
            return {
                ok: false,
                message:
                    `Parameter "${parameterId}" has type "${parameterType}", for which the graph has no value and ` +
                    'no default can be assumed; set it in Onshape after inserting, but Run needs a value to insert.',
            };
        }
        parameters[parameterId] = value;
    }

    return { ok: true, featureType, featureName, parameters };
}


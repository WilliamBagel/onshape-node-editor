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
    const nodeProcessor = new ReteOnshapeNodeProcessor(editor);
    const nodeArray = nodeProcessor.processNodes();

    if (!nodeArray) {
        console.warn('No nodes to process');
        return;
    }

    // Track local variables: {variableName: {nodeId: actualVariableName}}
    const localVariableIdentifiers: Record<string, Record<string, string>> = {};

    // Helper function to populate a unique variable name
    const createLocalVariableIndentifier = (desired: string, nodeId: string): string => {
        let identifier = desired;
        let counter = 0;

        // Check if this name already exists
        if (!localVariableIdentifiers[desired]) {
            localVariableIdentifiers[desired] = {};
        }

        // Check if identifier already exists
        if (localVariableIdentifiers[desired][nodeId]) {
            return localVariableIdentifiers[desired][nodeId]
        }

        // If the preferred name is taken, append a counter
        while (Object.values(localVariableIdentifiers[desired]).includes(identifier)) {
            identifier = `${desired}${counter}`;
            counter++;
        }

        // Store the mapping
        localVariableIdentifiers[desired][nodeId] = identifier;

        return identifier;
    };

    // map of consumer node id to map of input key and pointer to producer
    const nodeDataMap: Record<string, Record<string, VariablePointer>[]> = {};

    // map of consumer node id to map of input key and assigned identifier
    const topLevelVariablesMap: Record<string, Record<string, TopLevelVariableDefintion>> = {};

    // First pass: fetch data for all nodes and assign variable names to their outputs
    for (const nodeId of nodeArray) {
        const node = editor.getNode(nodeId);
        if (node == null) {
            console.warn(`Could not find node with id ${nodeId}`);
            continue;
        }

        // Fetch the node's inputs
        // Returns a Record<string, VariablePointer> for inputs to the node
        const nodeInputs = await engine.fetchInputs(nodeId);
        if (!(nodeInputs && typeof nodeInputs === 'object')) {
            console.warn(`Node ${nodeId} did not return valid data`);
            continue;
        }
        nodeDataMap[nodeId] = nodeInputs as Record<string, VariablePointer>[];

        // handle any top level variables the node declares and defines
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


        // Iterate over each output that defines a variable
        const nodeVariables = node.getVariableSymbols();
        for (const key of nodeVariables) {
            // Assign a unique variable name for this output
            const actualName = createLocalVariableIndentifier(key, nodeId);
            console.log(`Node ${nodeId} output '${key}' assigned variable name: ${actualName}`);
        }

    }

    // Second pass: build variable mappings for each node's inputs and generate featurescript representation
    const pipelineNodes: PipelineNodeInfo[] = [];

    for (const nodeId of nodeArray) {
        const node = editor.getNode(nodeId);
        if (node == null) {
            continue;
        }

        // Build the variable mapping for this node's inputs
        const variableMapping: Record<string, string> = {};

        // node data is currently the input to the node
        // need to check if node wants other variables like a default query
        // so join this with that array
        const nodeData = nodeDataMap[nodeId];
        for (const key in nodeData) {
            const variablePointer = nodeData[key]?.[0];
            // Look up the variable name from the source node's output
            const localVariableUsages = localVariableIdentifiers[variablePointer.name];
            if (localVariableUsages && localVariableUsages[variablePointer.id]) {
                // set variable name to unique identifier
                variableMapping[key] = localVariableUsages[variablePointer.id];
            } else {
                console.warn(`Could not find ${variablePointer.name} and ${variablePointer.id} in indentifiers:`, localVariableIdentifiers);
            }
        }

        // add top level variables' identifiers to variableMapping, for the consumers
        const tLVDefinitions = topLevelVariablesMap[nodeId];
        if (tLVDefinitions != null) {
            for (const [key, value] of Object.entries(tLVDefinitions)) {
                variableMapping[key] = value.identifier;
            }
        }
        // Get the feature script info with the variable mapping
        const info = node.getFeatureScriptInfo(variableMapping);
        pipelineNodes.push({
            id: nodeId,
            type: node.type,
            info,
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


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
import { FeatureStudioGenerator, NodeFeaturescriptInfo } from "../onshape-utils/featurestudiogenerator";
import { TopLevelVariableDefintion, VariablePointer } from "./nodes/onshapenode";

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
    const featureScriptInfo: NodeFeaturescriptInfo[] = [];

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
        featureScriptInfo.push(info);
        console.log(`Generated feature script for node ${nodeId}:`, node);
        if (node.type === 'define-feature') {
            // add top level variables after define feature
            for (const TopLevelVariableDefintion of Object.values(topLevelVariablesMap)) {
                for (const value of Object.values(TopLevelVariableDefintion)) {
                    featureScriptInfo.push({
                        line: `var ${value.identifier} = ${value.featurescript};`,
                        dependencies: [{path: "onshape/std/query.fs", version: "2770.0"}]
                    })
                }
            }
        }
    }

    console.log('Final featureScriptInfo array:', featureScriptInfo);

    const featureStudioGenerator = new FeatureStudioGenerator();

    return featureStudioGenerator.generateFeatureStudioCode(featureScriptInfo);
}

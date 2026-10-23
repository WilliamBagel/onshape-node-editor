import { NodeFeaturescriptInfo } from '../onshape-utils/featurestudiogenerator';
import { TopLevelVariableDefintion } from './nodes/onshapenode';

/**
 * One node of the flattened graph, ready to be turned into Feature Studio lines.
 *
 * This exists so the emission order and the once-only rules for top-level
 * variables can be unit tested without a DOM: `editorBase()` needs an iframe
 * container, a Vue injection context and Rete render plugins, none of which a
 * test can supply. Everything here is plain data.
 */
export interface PipelineNodeInfo {
    id: string;
    /** The node's `type` discriminator (`define-feature`, `custom-feature`, ...). */
    type: string;
    /** The FeatureScript lines this node contributes. */
    info: NodeFeaturescriptInfo;
    /** Top-level variables this node declares, keyed by symbol. */
    topLevelVariables?: Record<string, TopLevelVariableDefintion>;
}

/** A top-level `var` may reference a query, so the import has to be there. */
export const TOP_LEVEL_VARIABLE_DEPENDENCIES = [
    { path: "onshape/std/query.fs", version: "2770.0" }
];

/**
 * Turn the flattened node list into the ordered Feature Studio line list.
 *
 * A top-level variable has to be declared inside the feature body, i.e. after
 * the `defineFeature(...)` header that opens it, so the declarations are
 * emitted right after a define-feature node.
 */
export function assembleFeatureScriptInfo(nodes: PipelineNodeInfo[]): NodeFeaturescriptInfo[] {
    const featureScriptInfo: NodeFeaturescriptInfo[] = [];

    for (const node of nodes) {
        featureScriptInfo.push(node.info);

        if (node.type === 'define-feature') {
            // add top level variables after define feature
            for (const definitionSet of nodes.map((n) => n.topLevelVariables ?? {})) {
                for (const value of Object.values(definitionSet)) {
                    featureScriptInfo.push({
                        line: `var ${value.identifier} = ${value.featurescript};`,
                        dependencies: TOP_LEVEL_VARIABLE_DEPENDENCIES,
                    });
                }
            }
        }
    }

    return featureScriptInfo;
}

import { NodeFeaturescriptInfo } from '../onshape-utils/featurestudiogenerator';
import { assembleExpressionCode, ValueExpression } from '../onshape-utils/expressioncodegen';
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
    /**
     * Issue #10: when present, this node is a value node. It contributes no
     * statement lines (`info` is ignored); instead its expression is hoisted
     * into a `let` binding before the first statement that consumes it.
     */
    expression?: ValueExpression;
    /**
     * Issue #10: value node ids this (statement) node consumes, so their
     * hoisted bindings are emitted before it.
     */
    valueDependencies?: string[];
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
 * emitted right after a define-feature node -- once per generated Feature
 * Studio, not once per define-feature node: a graph with two define nodes used
 * to emit every top-level `var` twice.
 *
 * When any node carries an `expression` (issue #10), value nodes are
 * topologically ordered and hoisted into `let` bindings interleaved with the
 * statements (see `assembleExpressionCode`); statement nodes — including the
 * top-level `var` insertion — keep their relative order.
 */
export function assembleFeatureScriptInfo(nodes: PipelineNodeInfo[]): NodeFeaturescriptInfo[] {
    if (nodes.some((node) => node.expression != null)) {
        return assembleWithExpressions(nodes);
    }

    const featureScriptInfo: NodeFeaturescriptInfo[] = [];

    // Flattened node order, so emission does not depend on which define node
    // happens to come first.
    const topLevelVariables = nodes.flatMap((node) => Object.values(node.topLevelVariables ?? {}));
    let topLevelVariablesEmitted = false;

    for (const node of nodes) {
        featureScriptInfo.push(node.info);

        if (node.type === 'define-feature' && !topLevelVariablesEmitted) {
            for (const value of topLevelVariables) {
                featureScriptInfo.push({
                    line: `var ${value.identifier} = ${value.featurescript};`,
                    dependencies: TOP_LEVEL_VARIABLE_DEPENDENCIES,
                });
            }
            topLevelVariablesEmitted = true;
        }
    }

    return featureScriptInfo;
}

function assembleWithExpressions(nodes: PipelineNodeInfo[]): NodeFeaturescriptInfo[] {
    const valueNodes = nodes
        .filter((node) => node.expression != null)
        .map((node) => node.expression as ValueExpression);

    // Top-level `var`s are statements of their own, emitted right after the
    // define-feature statement, exactly as in the statement-only path. They
    // are spliced into the statement list so `assembleExpressionCode` keeps
    // them in place relative to the other statements.
    const topLevelVariables = nodes.flatMap((node) => Object.values(node.topLevelVariables ?? {}));
    let topLevelVariablesEmitted = false;

    const statements = nodes
        .filter((node) => node.expression == null)
        .flatMap((node) => {
            const list = [{
                nodeId: node.id,
                producer: node.type,
                info: node.info,
                consumes: node.valueDependencies ?? [],
            }];
            if (node.type === 'define-feature' && !topLevelVariablesEmitted) {
                topLevelVariablesEmitted = true;
                for (const value of topLevelVariables) {
                    list.push({
                        nodeId: `${node.id}:top-level:${value.identifier}`,
                        producer: 'top-level-variable',
                        info: {
                            line: `var ${value.identifier} = ${value.featurescript};`,
                            dependencies: TOP_LEVEL_VARIABLE_DEPENDENCIES,
                        } as NodeFeaturescriptInfo,
                        consumes: [] as string[],
                    });
                }
            }
            return list;
        });

    return assembleExpressionCode(valueNodes, statements);
}

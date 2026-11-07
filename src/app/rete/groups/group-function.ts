/**
 * #14 (user-confirmed): each group definition compiles to ONE reusable
 * FeatureScript function; each instance emits a call to it. This module
 * generates the function definitions. The call sites live on
 * {@link GroupNode} (see nodes/groupinstancenode.ts); the signature
 * planning shared by both lives in groupmodel.ts.
 *
 * Signature (see groupFunctionSignature):
 * - boundary inputs become parameters, in definition order, annotated
 *   `is <Type>` when the socket declares a known FeatureScript type
 *   (otherwise untyped, which FeatureScript allows);
 * - statement groups (any statement member, or a `context`/`id`
 *   boundary socket) take implicit `context is Context, id is Id`
 *   parameters first, so statement members run unchanged — statement
 *   functions in FeatureScript mutate the context in place, and the
 *   caller's `context`/`id` variables are the same objects;
 * - zero valued outputs: the function returns nothing;
 * - one valued output: `return <value>;`;
 * - several: `return { "<label>" : <value>, ... };` — an untyped map
 *   keyed by label; callers unpack with `result["<label>"]`.
 *   `context`/`id` boundary outputs are never returned (pass-through,
 *   see valuedBoundaryOutputs).
 *
 * Boundary defaults: an unconnected boundary input is passed its
 * `defaultLiteral` at the call site, so at the callee a parameter always
 * holds a value; an outer boundary default flows through the outer
 * function as a parameter value and so still wins over an inner default.
 *
 * Fallback: a definition whose members include a kind this compiler does
 * not support (anything beyond the kinds group-expand.ts can clone)
 * makes the whole graph fall back to inline expansion, which either
 * inlines correctly or refuses with its existing error. The fallback is
 * per graph, never per instance, so generated code is never a mix of
 * function calls and inlined copies of the same definition.
 */
import type { NodeEditor } from "rete";
import type { Schemes } from "../types";
import type { NodeFeaturescriptInfo } from "../../onshape-utils/featurestudiogenerator";
import {
    assembleExpressionCode,
    createStableNameAllocator,
    planExpressionBindings,
    type StatementNode,
    type ValueExpression,
} from "../../onshape-utils/expressioncodegen";
import { TOP_LEVEL_VARIABLE_DEPENDENCIES } from "../pipelineinfo";
import { GroupNode } from "../nodes/groupinstancenode";
import { OnshapeNode } from "../nodes/onshapenode";
import {
    defaultGroupFunctionName,
    escapeFsString,
    groupFunctionSignature,
    groupOutputKeys,
    groupResultVariable,
    groupUsesExpressionPath,
    sanitizeFsIdentifier,
    type GroupDefinition,
    type GroupFunctionSignature,
    type GroupSocketDefinition,
} from "./groupmodel";

/**
 * Member kinds the function compiler supports — exactly the kinds
 * group-expand.ts can clone, so the inline fallback accepts the same set
 * and there is no graph one path handles and the other refuses.
 */
const SUPPORTED_MEMBER_TYPES: ReadonlySet<string> = new Set([
    "function",
    "CustomFeature",
    "utility-statement",
    "math-expression",
    "group-instance",
    "array-literal",
    "array-concat",
    "array-index",
    "array-size",
    "map-array",
    "for-each",
    "bounded-for",
]);

export interface GroupFunctionPlan {
    /** False when any reachable definition uses an unsupported member kind (or cycles). */
    supported: boolean;
    /** Why the graph falls back to inline expansion, when `supported` is false. */
    unsupportedReason: string | null;
    /** Definitions to emit, innermost first (post-order), each once. */
    definitions: GroupDefinition[];
    /** Function name per definition id. */
    names: Map<string, string>;
}

/**
 * Collect the definitions reachable from the editor's non-muted group
 * instances, innermost first, and check every one is compilable to a
 * function. Muted instances (and muted nested members) emit no call, so
 * their definitions are neither emitted nor checked.
 */
export function planGroupFunctions(editor: NodeEditor<Schemes>, reachableIds?: Set<string>): GroupFunctionPlan {
    const instances = editor.getNodes().filter(
        (node): node is GroupNode =>
            node instanceof GroupNode &&
            !node.muted &&
            (reachableIds == null || reachableIds.has(node.id)),
    );
    const definitions: GroupDefinition[] = [];
    const seen = new Set<string>();
    let unsupportedReason: string | null = null;

    const visitMember = (member: OnshapeNode, trail: string[]): void => {
        if (unsupportedReason != null) {
            return;
        }
        if (!SUPPORTED_MEMBER_TYPES.has(member.type)) {
            unsupportedReason =
                `Group function compilation does not support member kind "${member.type}" ` +
                `(node "${member.getTitle()}", id "${member.id}"); falling back to inline expansion.`;
            return;
        }
        if (member instanceof GroupNode && !member.muted) {
            visitDefinition(member.getDefinition(), trail);
        }
    };

    const visitDefinition = (definition: GroupDefinition, trail: string[]): void => {
        if (unsupportedReason != null || seen.has(definition.id)) {
            return;
        }
        if (trail.includes(definition.id)) {
            unsupportedReason =
                `Group definitions form a cycle: ${[...trail, definition.id].join(" -> ")}; ` +
                `falling back to inline expansion.`;
            return;
        }
        seen.add(definition.id);
        for (const member of definition.nodes) {
            visitMember(member, [...trail, definition.id]);
        }
        definitions.push(definition);
    };

    for (const instance of instances) {
        visitDefinition(instance.getDefinition(), []);
    }

    const names = new Map<string, string>();
    if (unsupportedReason == null) {
        const used = new Set<string>();
        for (const definition of definitions) {
            const base = defaultGroupFunctionName(definition);
            let name = base;
            let counter = 0;
            while (used.has(name)) {
                name = `${base}${counter}`;
                counter += 1;
            }
            used.add(name);
            names.set(definition.id, name);
        }
    }

    return { supported: unsupportedReason == null, unsupportedReason, definitions, names };
}

/**
 * Record the planned function names on every reachable {@link GroupNode}
 * (top-level instances and nested members) so their call sites use the
 * disambiguated names. Transient codegen state; never serialized.
 */
export function assignGroupFunctionNames(editor: NodeEditor<Schemes>, plan: GroupFunctionPlan): void {
    const assign = (node: OnshapeNode): void => {
        if (node instanceof GroupNode) {
            const name = plan.names.get(node.definitionId);
            if (name != null) {
                node.codegenFunctionName = name;
            }
        }
    };
    for (const node of editor.getNodes()) {
        assign(node);
    }
    for (const definition of plan.definitions) {
        for (const member of definition.nodes) {
            assign(member);
        }
    }
}

/** The FeatureScript function definitions for a plan, innermost first. */
export function buildGroupFunctionInfos(plan: GroupFunctionPlan): NodeFeaturescriptInfo[] {
    const infos: NodeFeaturescriptInfo[] = [];
    for (const definition of plan.definitions) {
        const signature = groupFunctionSignature(definition);
        const name = plan.names.get(definition.id) ?? defaultGroupFunctionName(definition);
        const paramsText = signature.params
            .map((param) => (param.fsType != null ? `${param.name} is ${param.fsType}` : param.name))
            .join(", ");
        infos.push({ line: `// group: ${definition.name}` });
        infos.push({ line: `function ${name}(${paramsText}) {`, postindent: 1 });
        infos.push(...generateFunctionBody(definition, signature));
        infos.push({ line: "}", preindent: -1 });
    }
    return infos;
}

function topologicalMembers(definition: GroupDefinition): OnshapeNode[] {
    const members = definition.nodes;
    const byId = new Map(members.map((member) => [member.id, member]));
    const indegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();
    for (const member of members) {
        indegree.set(member.id, 0);
    }
    for (const connection of definition.connections) {
        if (connection.source === connection.target) {
            continue;
        }
        if (!byId.has(connection.source) || !byId.has(connection.target)) {
            continue;
        }
        indegree.set(connection.target, (indegree.get(connection.target) ?? 0) + 1);
        const list = dependents.get(connection.source) ?? [];
        list.push(connection.target);
        dependents.set(connection.source, list);
    }
    const ready = members.filter((member) => (indegree.get(member.id) ?? 0) === 0);
    const ordered: OnshapeNode[] = [];
    while (ready.length > 0) {
        const member = ready.shift() as OnshapeNode;
        ordered.push(member);
        for (const dependentId of dependents.get(member.id) ?? []) {
            const remaining = (indegree.get(dependentId) ?? 0) - 1;
            indegree.set(dependentId, remaining);
            if (remaining === 0) {
                const dependent = byId.get(dependentId);
                if (dependent != null) {
                    ready.push(dependent);
                }
            }
        }
    }
    if (ordered.length !== members.length) {
        throw new Error(
            `Group "${definition.id}" has a cycle between its member nodes; cannot order statements.`,
        );
    }
    return ordered;
}

function generateFunctionBody(
    definition: GroupDefinition,
    signature: GroupFunctionSignature,
): NodeFeaturescriptInfo[] {
    const members = definition.nodes;
    const byId = new Map(members.map((member) => [member.id, member]));
    const ordered = topologicalMembers(definition);

    // Internal connections by target member + input key.
    const incoming = new Map<string, { sourceId: string; sourceOutput: string }>();
    for (const connection of definition.connections) {
        incoming.set(`${connection.target}:${connection.targetInput}`, {
            sourceId: connection.source,
            sourceOutput: connection.sourceOutput,
        });
    }

    // Boundary input -> function parameter name.
    const paramNameFor = (memberId: string, inputKey: string): string | undefined => {
        const param = signature.params.find(
            (entry) => entry.socket != null && entry.socket.nodeId === memberId && entry.socket.socketKey === inputKey,
        );
        return param?.name;
    };

    // How a member input is fed: a member producer, a function parameter,
    // or nothing (the member's own literal/fallback applies). A muted
    // producer feeds nothing; a nested group input fed by a muted member
    // without an inner default is refused, mirroring inline expansion.
    type Feed = { kind: "member"; memberId: string; outputKey: string } | { kind: "param"; name: string } | { kind: "none" };
    const feedOf = (member: OnshapeNode, inputKey: string): Feed => {
        const connection = incoming.get(`${member.id}:${inputKey}`);
        if (connection != null) {
            const producer = byId.get(connection.sourceId);
            if (producer == null || producer.muted) {
                if (member instanceof GroupNode) {
                    const innerSocket = member
                        .getDefinition()
                        .inputs.find((socket) => socket.id === inputKey);
                    if (innerSocket?.defaultLiteral == null) {
                        throw new Error(
                            `Group function for "${definition.id}": nested group input "${inputKey}" ` +
                                `is wired to a muted member "${connection.sourceId}" which emits nothing, ` +
                                `and the boundary input has no defaultLiteral; unmute that member, remove the ` +
                                `connection, or set a default literal.`,
                        );
                    }
                }
                return { kind: "none" };
            }
            return { kind: "member", memberId: producer.id, outputKey: connection.sourceOutput };
        }
        const param = paramNameFor(member.id, inputKey);
        if (param != null) {
            return { kind: "param", name: param };
        }
        return { kind: "none" };
    };

    // Phase A: value expressions. inputProducers carries member ids for
    // internal feeds; parameter and literal feeds are external
    // identifiers, substituted verbatim by the expression planner.
    const valueExpressions: ValueExpression[] = [];
    const expressionsByMember = new Map<string, ValueExpression>();
    for (const member of ordered) {
        if (member.muted) {
            continue;
        }
        const inputProducers: Record<string, string> = {};
        const variableMapping: Record<string, string> = {};
        for (const inputKey of Object.keys(member.inputs)) {
            const feed = feedOf(member, inputKey);
            if (feed.kind === "member") {
                inputProducers[inputKey] = feed.memberId;
            } else if (feed.kind === "param") {
                variableMapping[inputKey] = feed.name;
            }
        }
        const expression = member.getExpressionInfo({ variableMapping, inputProducers });
        if (expression != null) {
            valueExpressions.push(expression);
            expressionsByMember.set(member.id, expression);
        }
    }

    // Top-level variables declared by members (e.g. a CustomFeature's
    // selection query) are emitted at the top of the function body.
    const reserved = new Set<string>(signature.params.map((param) => param.name));
    for (const member of ordered) {
        if (member instanceof GroupNode && !groupUsesExpressionPath(member.getDefinition())) {
            reserved.add(groupResultVariable(member.id));
        }
    }
    // The expression plan is computed once, before anything else needs
    // names: statement mappings below read its bindings, the top-level
    // variable allocator reserves its `let` names, and
    // assembleExpressionCode re-plans with the same reserved set, so all
    // three agree.
    const plan = planExpressionBindings(valueExpressions, reserved);
    const bindings = plan.bindings;
    const varAllocator = createStableNameAllocator([...reserved, ...plan.letNames.values()]);
    const topLevelLines: NodeFeaturescriptInfo[] = [];
    const topLevelIdentifiers = new Map<string, Record<string, string>>();
    for (const member of ordered) {
        if (member.muted) {
            continue;
        }
        const variables = member.getTopLevelVariables();
        const identifiers: Record<string, string> = {};
        for (const [symbol, featurescript] of Object.entries(variables)) {
            const identifier = varAllocator.allocate(sanitizeFsIdentifier(symbol, "variable"), member.id);
            identifiers[symbol] = identifier;
            topLevelLines.push({
                line: `var ${identifier} = ${featurescript};`,
                dependencies: TOP_LEVEL_VARIABLE_DEPENDENCIES,
            });
        }
        if (Object.keys(identifiers).length > 0) {
            topLevelIdentifiers.set(member.id, identifiers);
        }
    }

    // Statement members and statement-style nested group calls.
    // A value member that produced no expression cannot feed anything;
    // name it directly instead of failing on a later lookup.
    const barrenValueMembers = new Set(
        ordered
            .filter((member) => !member.muted && !(member instanceof GroupNode) && !expressionsByMember.has(member.id))
            .map((member) => member.id),
    );

    const outputIdentifier = (member: OnshapeNode, outputKey: string): string => {
        if (member instanceof GroupNode) {
            const inner = member.getDefinition();
            if (groupUsesExpressionPath(inner)) {
                const binding = bindings.get(member.id);
                if (binding == null) {
                    throw new Error(
                        `Group function for "${definition.id}": nested group "${member.id}" has no value binding.`,
                    );
                }
                return binding;
            }
            if (outputKey === "context" || outputKey === "id") {
                return outputKey;
            }
            const valuedIndex = inner.outputs.findIndex((socket) => socket.id === outputKey);
            const keys = groupOutputKeys(inner);
            const key = valuedIndex >= 0 ? keys[valuedIndex] : undefined;
            if (key == null) {
                throw new Error(
                    `Group "${definition.id}" boundary output references "${member.id}.${outputKey}", ` +
                        `which is not a valued output of the nested group.`,
                );
            }
            const result = groupResultVariable(member.id);
            return `${result}["${escapeFsString(key)}"]`;
        }
        const binding = bindings.get(member.id);
        if (binding != null) {
            return binding;
        }
        if (barrenValueMembers.has(member.id)) {
            throw new Error(
                `Group "${definition.id}" member "${member.id}" (${member.type}) produced no value expression; ` +
                    `its output "${outputKey}" cannot be used inside the group function.`,
            );
        }
        // Statement members pass `context`/`id` through by name: their
        // outputs mutate the function's own parameters in place.
        if (outputKey === "context" || outputKey === "id") {
            return outputKey;
        }
        throw new Error(
            `Group "${definition.id}" boundary output references "${member.id}.${outputKey}", ` +
                `which has no generated identifier (statement members only pass context/id through).`,
        );
    };

    const statements: StatementNode[] = [];
    for (const member of ordered) {
        if (member.muted || expressionsByMember.has(member.id)) {
            continue;
        }
        const variableMapping: Record<string, string> = { ...(topLevelIdentifiers.get(member.id) ?? {}) };
        const consumes: string[] = [];
        for (const inputKey of Object.keys(member.inputs)) {
            const feed = feedOf(member, inputKey);
            if (feed.kind === "member") {
                const producer = byId.get(feed.memberId) as OnshapeNode;
                variableMapping[inputKey] = outputIdentifier(producer, feed.outputKey);
                if (expressionsByMember.has(feed.memberId) && !consumes.includes(feed.memberId)) {
                    consumes.push(feed.memberId);
                }
            } else if (feed.kind === "param") {
                variableMapping[inputKey] = feed.name;
            }
        }
        statements.push({
            nodeId: member.id,
            producer: member.type,
            info: member.getFeatureScriptInfo(variableMapping),
            consumes,
        });
    }

    const lines = [
        ...topLevelLines,
        ...assembleExpressionCode(valueExpressions, statements, reserved),
    ];

    // Return the boundary outputs (context/id pass-throughs excluded).
    const returnIdentifier = (socket: GroupSocketDefinition): string => {
        const member = byId.get(socket.nodeId);
        if (member == null || member.muted) {
            throw new Error(
                `Group "${definition.id}" boundary output "${socket.id}" is fed by a muted or missing member; ` +
                    `it cannot be returned.`,
            );
        }
        return outputIdentifier(member, socket.socketKey);
    };
    if (signature.valuedOutputs.length === 1) {
        lines.push({ line: `return ${returnIdentifier(signature.valuedOutputs[0])};` });
    } else if (signature.valuedOutputs.length > 1) {
        const entries = signature.valuedOutputs.map(
            (socket, index) => `"${escapeFsString(signature.outputKeys[index])}" : ${returnIdentifier(socket)}`,
        );
        lines.push({ line: `return { ${entries.join(", ")} };` });
    }
    return lines;
}

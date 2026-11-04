/**
 * Expression-based codegen with let-hoisting (issue #10).
 *
 * The statement generator (`featurestudiogenerator.ts`) only knows lines:
 * each node appends `{ line, dependencies, preindent, postindent }`. That
 * cannot express a nested pure expression such as
 * `transform(cross(vector(...), vector(...)))`, which is what every
 * vector / matrix / transform node needs. This module is the expression
 * layer on top of it:
 *
 * - {@link ValueExpression} is the IR: one value node returns an expression
 *   template, the node ids its inputs come from, and its inferred
 *   {@link ValueType}. It never emits a statement itself.
 * - {@link planExpressionBindings} topologically orders the value nodes,
 *   deduplicates identical pure subexpressions, and assigns stable,
 *   collision-free `let` names (`v0`, `v1`, ...) through
 *   {@link createStableNameAllocator} — the same disambiguation rule the
 *   graph driver used for local variables (`desired`, then `desired0`,
 *   `desired1`, ...), extracted here so both paths share it.
 * - {@link assembleExpressionCode} interleaves the hoisted `let` bindings
 *   with statement nodes: a binding is emitted (with its own dependencies,
 *   in topological order) immediately before the first statement that
 *   consumes it, so statement order is preserved exactly and a value is
 *   never evaluated before a statement it depends on. Bindings nothing
 *   consumes are emitted last, in topological order.
 *
 * Evaluation-order rules for deduplication: an expression is only merged
 * with an identical earlier one when it is pure (`pure !== false`). A pure
 * expression has no observable effect, so evaluating it at its first
 * occurrence instead of its own position cannot change the program; an
 * impure expression is never deduplicated, because its position relative
 * to statements is observable.
 */

import { NodeFeaturescriptInfo } from "./featurestudiogenerator";
import { ValueType, valueTypeLabel } from "./valuetypes";

/** A FeatureScript dependency (an `import(...)` the generator will add). */
export type ExpressionDependency = { path: string; version: string };

/**
 * The expression IR for one value node.
 *
 * `expression` is a template: `{inputKey}` placeholders are replaced with
 * the hoisted binding of the producing node (see `inputs`), or with the
 * external identifier verbatim when the input is not a value node.
 */
export interface ValueExpression {
    /** Stable node id; also the identity used for dependencies and naming. */
    nodeId: string;
    /** Producer label (node type or title), used for the grouping comment. */
    producer: string;
    /** Expression template, e.g. `cross({a}, {b})`. */
    expression: string;
    /**
     * Input bindings: placeholder key -> source node id, or -> an external
     * identifier (a parameter, `context`, a literal name) when the value
     * does not come from another value node. A value that matches a known
     * `nodeId` is a dependency; anything else is external.
     */
    inputs?: Record<string, string>;
    /** Inferred type of the value this expression produces. */
    valueType: ValueType;
    /**
     * Whether the expression is pure (no side effects, deterministic).
     * Defaults to `true`; only pure expressions may be deduplicated.
     */
    pure?: boolean;
    /** Statement node ids that must be emitted before this binding. */
    statementDependencies?: string[];
    /** FeatureScript imports this expression needs. */
    dependencies?: ExpressionDependency[];
}

/** One statement node, in the order it must appear in the feature body. */
export interface StatementNode {
    nodeId: string;
    producer: string;
    info: NodeFeaturescriptInfo;
    /** Value node ids this statement consumes; their bindings precede it. */
    consumes?: string[];
}

/** The result of planning the value nodes. */
export interface ExpressionPlan {
    /** Value nodes in topological (evaluation) order, after dedupe. */
    ordered: ValueExpression[];
    /** Every value node id -> the binding it reads through (dedupe alias). */
    bindings: Map<string, string>;
    /** Representative node ids -> their `let` name, in emission order. */
    letNames: Map<string, string>;
    /** Node ids removed by deduplication (aliased to a representative). */
    deduped: string[];
}

/**
 * Stable, collision-free variable names.
 *
 * The rule is the one the graph driver used inline for local variables:
 * the first request for `desired` gets `desired`; a further request from a
 * different node gets `desired0`, then `desired1`, ... Re-requesting the
 * same `(desired, nodeId)` pair returns the same name, so rebuilding the
 * same graph yields the same names. Names in `reserved` (statement-level
 * variables, keywords) are taken before anything is allocated.
 */
export interface StableNameAllocator {
    allocate(desired: string, nodeId: string): string;
    /** The name already allocated for `(desired, nodeId)`, if any. */
    lookup(desired: string, nodeId: string): string | undefined;
}

export function createStableNameAllocator(reserved: Iterable<string> = []): StableNameAllocator {
    // desired -> nodeId -> name, plus the set of names already in use.
    const byDesired = new Map<string, Map<string, string>>();
    const taken = new Set<string>(reserved);

    return {
        allocate(desired: string, nodeId: string): string {
            let perNode = byDesired.get(desired);
            if (perNode == null) {
                perNode = new Map<string, string>();
                byDesired.set(desired, perNode);
            }
            const existing = perNode.get(nodeId);
            if (existing != null) {
                return existing;
            }
            let identifier = desired;
            let counter = 0;
            while (taken.has(identifier)) {
                identifier = `${desired}${counter}`;
                counter++;
            }
            taken.add(identifier);
            perNode.set(nodeId, identifier);
            return identifier;
        },
        lookup(desired: string, nodeId: string): string | undefined {
            return byDesired.get(desired)?.get(nodeId);
        },
    };
}

/** Node ids a value expression depends on (inputs that are value nodes). */
export function expressionDependencies(
    expr: ValueExpression,
    knownIds: ReadonlySet<string>
): string[] {
    const deps: string[] = [];
    for (const source of Object.values(expr.inputs ?? {})) {
        if (knownIds.has(source) && !deps.includes(source)) {
            deps.push(source);
        }
    }
    return deps;
}

/**
 * Kahn topological sort of the value nodes. Ready nodes are taken in
 * node-id order, so the result — and therefore every generated name — is
 * stable across rebuilds of the same graph regardless of input order.
 * Throws naming the nodes involved when the dependencies form a cycle.
 */
export function topologicalOrder(nodes: readonly ValueExpression[]): ValueExpression[] {
    const byId = new Map(nodes.map((n) => [n.nodeId, n]));
    const knownIds = new Set(byId.keys());
    const indegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();
    for (const node of nodes) {
        const deps = expressionDependencies(node, knownIds);
        indegree.set(node.nodeId, deps.length);
        for (const dep of deps) {
            const list = dependents.get(dep) ?? [];
            list.push(node.nodeId);
            dependents.set(dep, list);
        }
    }

    const ready = nodes
        .filter((n) => (indegree.get(n.nodeId) ?? 0) === 0)
        .map((n) => n.nodeId)
        .sort();
    const ordered: ValueExpression[] = [];
    while (ready.length > 0) {
        const id = ready.shift() as string;
        ordered.push(byId.get(id) as ValueExpression);
        for (const dependent of dependents.get(id) ?? []) {
            const next = (indegree.get(dependent) ?? 0) - 1;
            indegree.set(dependent, next);
            if (next === 0) {
                // Insert keeping `ready` sorted by node id.
                let at = ready.findIndex((r) => r > dependent);
                if (at === -1) at = ready.length;
                ready.splice(at, 0, dependent);
            }
        }
    }

    if (ordered.length !== nodes.length) {
        const stuck = nodes
            .filter((n) => (indegree.get(n.nodeId) ?? 0) > 0)
            .map((n) => n.nodeId);
        throw new Error(
            `Expression codegen: dependency cycle among value nodes: ${stuck.join(", ")}`
        );
    }
    return ordered;
}

/**
 * Canonical key of an expression after substituting its dependencies'
 * canonical keys. Two nodes are duplicates exactly when their substituted
 * expressions and inferred types are identical, which is what makes
 * merging them evaluation-order safe for pure expressions.
 */
function canonicalKey(
    expr: ValueExpression,
    knownIds: ReadonlySet<string>,
    keys: Map<string, string>
): string {
    const inputs = Object.entries(expr.inputs ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, source]) => {
            const depKey = knownIds.has(source) ? (keys.get(source) ?? source) : source;
            return `${key}=${depKey}`;
        })
        .join(",");
    return `${expr.producer}|${expr.expression}|${inputs}|${valueTypeLabel(expr.valueType)}`;
}

/**
 * Topologically order the value nodes, deduplicate identical pure
 * subexpressions, and assign each surviving node a stable `let` name
 * (`v0`, `v1`, ... in topological order). Duplicate pure nodes alias to
 * the representative's binding; impure nodes are never merged.
 */
export function planExpressionBindings(
    nodes: readonly ValueExpression[],
    reservedNames: Iterable<string> = []
): ExpressionPlan {
    const orderedAll = topologicalOrder(nodes);
    const knownIds = new Set(nodes.map((n) => n.nodeId));
    const keys = new Map<string, string>();
    const representativeOf = new Map<string, string>();
    const firstByKey = new Map<string, string>();

    for (const node of orderedAll) {
        const key = canonicalKey(node, knownIds, keys);
        keys.set(node.nodeId, key);
        if (node.pure !== false && firstByKey.has(key)) {
            representativeOf.set(node.nodeId, firstByKey.get(key) as string);
        } else {
            representativeOf.set(node.nodeId, node.nodeId);
            if (node.pure !== false) {
                firstByKey.set(key, node.nodeId);
            }
        }
    }

    const allocator = createStableNameAllocator(reservedNames);
    const letNames = new Map<string, string>();
    const bindings = new Map<string, string>();
    const ordered: ValueExpression[] = [];
    let index = 0;
    for (const node of orderedAll) {
        const rep = representativeOf.get(node.nodeId) as string;
        if (rep !== node.nodeId) {
            bindings.set(node.nodeId, letNames.get(rep) as string);
            continue;
        }
        const name = allocator.allocate(`v${index}`, node.nodeId);
        index++;
        letNames.set(node.nodeId, name);
        bindings.set(node.nodeId, name);
        ordered.push(node);
    }

    return {
        ordered,
        bindings,
        letNames,
        deduped: orderedAll.filter((n) => representativeOf.get(n.nodeId) !== n.nodeId).map((n) => n.nodeId),
    };
}

/** Substitute `{key}` placeholders with bindings (or external names). */
export function substituteExpression(expr: ValueExpression, plan: ExpressionPlan): string {
    const knownIds = new Set(plan.bindings.keys());
    return expr.expression.replace(/\{([^{}]+)\}/g, (_match, key: string) => {
        const source = expr.inputs?.[key];
        if (source == null) {
            return `{${key}}`;
        }
        if (knownIds.has(source)) {
            return plan.bindings.get(source) as string;
        }
        return source;
    });
}

/** The transitive value-node dependencies of a node, in topological order. */
function transitiveDependencies(
    roots: readonly string[],
    plan: ExpressionPlan,
    nodesById: Map<string, ValueExpression>
): string[] {
    const wanted = new Set<string>();
    const visit = (id: string) => {
        const node = nodesById.get(id);
        if (node == null || wanted.has(id)) return;
        wanted.add(id);
        for (const dep of expressionDependencies(node, new Set(nodesById.keys()))) {
            visit(dep);
        }
    };
    for (const root of roots) visit(root);
    return plan.ordered.filter((n) => wanted.has(n.nodeId)).map((n) => n.nodeId);
}

function letLine(node: ValueExpression, plan: ExpressionPlan): NodeFeaturescriptInfo {
    return {
        line: `let ${plan.letNames.get(node.nodeId)} = ${substituteExpression(node, plan)};`,
        dependencies: node.dependencies,
    };
}

function producerComment(node: ValueExpression): NodeFeaturescriptInfo {
    return { line: `// ${node.producer}` };
}

/**
 * Assemble the full ordered line list: hoisted `let` bindings interleaved
 * with statement nodes. A binding is emitted immediately before the first
 * statement that (transitively) consumes it, and only after every
 * statement in its `statementDependencies`; bindings nothing consumes
 * come last. Throws when a binding's statement dependency does not
 * precede its first consumer — emitting it earlier would read a variable
 * that does not exist yet, and later would be too late.
 */
export function assembleExpressionCode(
    valueNodes: readonly ValueExpression[],
    statements: readonly StatementNode[],
    reservedNames: Iterable<string> = []
): NodeFeaturescriptInfo[] {
    const plan = planExpressionBindings(valueNodes, reservedNames);
    const nodesById = new Map(valueNodes.map((n) => [n.nodeId, n]));
    const statementIndex = new Map(statements.map((s, i) => [s.nodeId, i]));
    const emitted = new Set<string>();
    const out: NodeFeaturescriptInfo[] = [];

    const emitBinding = (nodeId: string) => {
        if (emitted.has(nodeId)) return;
        const node = nodesById.get(nodeId);
        if (node == null) return;
        emitted.add(nodeId);
        // Deduped nodes have no `let` of their own; the representative's
        // binding is emitted through its own entry in `plan.ordered`.
        if (plan.letNames.has(nodeId)) {
            out.push(producerComment(node), letLine(node, plan));
        }
    };

    statements.forEach((statement, index) => {
        // Validate statement dependencies of every binding we are about
        // to emit: each must already have been emitted (or be this
        // statement's own predecessors, which the loop guarantees by
        // checking positions).
        const needed = transitiveDependencies(statement.consumes ?? [], plan, nodesById);
        for (const nodeId of needed) {
            const node = nodesById.get(nodeId);
            if (node == null) continue;
            for (const dep of node.statementDependencies ?? []) {
                const depIndex = statementIndex.get(dep);
                if (depIndex == null || depIndex >= index) {
                    throw new Error(
                        `Expression codegen: value node "${nodeId}" (${node.producer}) depends on ` +
                            `statement "${dep}", which is not emitted before its first consumer ` +
                            `"${statement.nodeId}". Reorder the graph or remove the dependency.`
                    );
                }
            }
        }
        for (const nodeId of needed) emitBinding(nodeId);
        out.push(statement.info);
    });

    // Bindings nothing consumes (e.g. a graph that ends in a value).
    for (const node of plan.ordered) {
        emitBinding(node.nodeId);
    }

    return out;
}

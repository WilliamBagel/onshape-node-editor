/**
 * Issue #12 — array and iteration nodes.
 *
 * Value nodes (expression IR, issue #10):
 *  - {@link ArrayLiteralNode}  — `[ {e0}, {e1}, … ]`
 *  - {@link ArrayConcatNode}   — `concatenateArrays({a}, {b})`
 *  - {@link ArrayIndexNode}    — `({array})[{index}]`
 *  - {@link ArraySizeNode}     — `size({array})`
 *  - {@link MapArrayNode}      — `mapArray({array}, function(item) { return …; })`
 *
 * Statement nodes (for-body is a template; `{item}`/ `{index}` are substituted):
 *  - {@link ForEachNode}       — `for (var index = 0; index < size({array}); …) { … }`
 *  - {@link BoundedForNode}    — `for (var index = 0; index < {count}; index += 1) { … }`
 *
 * Guard rails (see {@link OnshapeNode.validateGraph}): iterating over a
 * `Query`, and a `for` with no bound, are refused at build time rather than
 * generating code that hangs or misbehaves in Onshape.
 *
 * Body templates: the graph has no subgraph/closure concept, so the loop
 * body is an editable template string (serialized with the node). The
 * `mapArray` callback body may reference `{item}`; the `for` bodies may
 * reference `{item}` (= `({array})[index]`, forEach only) and `{index}`.
 * Anything else is written verbatim. Templates are therefore scaffolding
 * for the per-item FeatureScript body until the UI can edit them.
 */
import { ClassicPreset } from "rete";
import { OnshapeNode, GraphValidationContext } from "./onshapenode";
import { OnshapeSocket } from "../onshapesockets";
import { OnshapeOutput } from "../inputoutput/onshapeoutput";
import { NodeFeaturescriptInfo } from "../../onshape-utils/featurestudiogenerator";
import type { ValueExpression } from "../../onshape-utils/expressioncodegen";
import {
    ValueType,
    checkCompatibility,
    valueTypeLabel,
} from "../../onshape-utils/valuetypes";
import type {
    SerializedArrayConcatNode,
    SerializedArrayIndexNode,
    SerializedArrayLiteralNode,
    SerializedArraySizeNode,
    SerializedBoundedForNode,
    SerializedForEachNode,
    SerializedMapArrayNode,
    SerializedNodeBase,
} from "../serialization/graph-schema-types";

/**
 * Hard cap on a literal loop bound. A `for` whose bound exceeds this is
 * refused (guard rail), so a stray literal cannot generate code that runs
 * effectively forever in Onshape.
 */
export const MAX_LOOP_BOUND = 10000;

export type ArrayNodeVariant =
    | "array-literal"
    | "array-concat"
    | "array-index"
    | "array-size"
    | "map-array"
    | "for-each"
    | "bounded-for";

function arrayType(element: ValueType): ValueType {
    return { name: "array", element };
}

/** Socket for an input; unwired inputs fall back to a literal in codegen. */
function input(key: string, label: string, valueType: ValueType) {
    return new ClassicPreset.Input(new OnshapeSocket(key, valueType), label);
}

function output(valueType: ValueType) {
    return new OnshapeOutput(new OnshapeSocket("return", valueType), valueTypeLabel(valueType));
}

function contextInput() {
    return new ClassicPreset.Input(new OnshapeSocket("Context"), "Context");
}

function contextOutput() {
    return new OnshapeOutput(new OnshapeSocket("Context"), "Context");
}

/** Build the expression inputs map + input placeholders for a node. */
function expressionFor(
    nodeId: string,
    producer: string,
    expression: string,
    inputProducers: Record<string, string>,
    valueType: ValueType,
): ValueExpression {
    return {
        nodeId,
        producer,
        expression,
        inputs: Object.keys(inputProducers).length > 0 ? inputProducers : undefined,
        valueType,
    };
}

/** Type of the value feeding `inputKey`, or null when it is not wired. */
function fedType(node: OnshapeNode, inputKey: string, ctx: GraphValidationContext): ValueType | null {
    const ref = ctx.producers[inputKey];
    if (ref == null) return null;
    const producer = ctx.getNode(ref.nodeId);
    if (producer == null) return null;
    const socket = producer.outputs[ref.outputKey]?.socket as OnshapeSocket | undefined;
    return socket?.valueType ?? null;
}

/** Refuse iteration when the array input is fed a `Query` (not an array). */
function iterateOverQuery(node: OnshapeNode, inputKey: string, ctx: GraphValidationContext): string | null {
    const fed = fedType(node, inputKey, ctx);
    if (fed != null && fed.name === "Query") {
        return `cannot iterate over a Query (input "${inputKey}" is fed Query by node "${ctx.producers[inputKey].nodeId}"); iterate over an array<T> instead.`;
    }
    return null;
}

/* ------------------------------------------------------------------ */
/*  Array literal                                                     */
/* ------------------------------------------------------------------ */

export class ArrayLiteralNode extends OnshapeNode {
    public readonly elementType: ValueType;
    public readonly count: number;

    constructor(elementType: ValueType = { name: "unknown" }, count: number = 2) {
        super("array-literal", "Array Literal");
        this.elementType = elementType;
        this.count = Math.max(0, Math.floor(count));
        for (let i = 0; i < this.count; i++) {
            this.addInput(`e${i}`, input(`e${i}`, `element ${i}`, elementType));
        }
        this.addOutput("return", output(arrayType(elementType)));
    }

    public getVariableSymbols(): string[] {
        return ["return"];
    }

    public getExpressionInfo(ctx: {
        variableMapping: Record<string, string>;
        inputProducers: Record<string, string>;
    }): ValueExpression {
        const parts: string[] = [];
        for (let i = 0; i < this.count; i++) {
            parts.push(ctx.inputProducers[`e${i}`] != null ? `{e${i}}` : "null");
        }
        return expressionFor(
            this.id,
            "array-literal",
            `[${parts.join(", ")}]`,
            Object.fromEntries(
                Object.entries(ctx.inputProducers).filter(([k]) => /^e\d+$/.test(k)),
            ),
            arrayType(this.elementType),
        );
    }

    public toJSON(): SerializedArrayLiteralNode {
        return {
            ...(super.toJSON() as SerializedNodeBase),
            kind: "array-literal",
            element: this.elementType,
            count: this.count,
        };
    }

    public static fromJSON(data: SerializedArrayLiteralNode): ArrayLiteralNode {
        const node = new ArrayLiteralNode(data.element ?? { name: "unknown" }, data.count ?? 2);
        node.applySerializedBase(data);
        return node;
    }
}

/* ------------------------------------------------------------------ */
/*  Concatenation                                                     */
/* ------------------------------------------------------------------ */

export class ArrayConcatNode extends OnshapeNode {
    public readonly elementType: ValueType;

    constructor(elementType: ValueType = { name: "unknown" }) {
        super("array-concat", "Array Concat");
        this.elementType = elementType;
        this.addInput("a", input("a", "lhs", arrayType(elementType)));
        this.addInput("b", input("b", "rhs", arrayType(elementType)));
        this.addOutput("return", output(arrayType(elementType)));
    }

    public getVariableSymbols(): string[] {
        return ["return"];
    }

    public getExpressionInfo(ctx: {
        variableMapping: Record<string, string>;
        inputProducers: Record<string, string>;
    }): ValueExpression {
        const lhs = ctx.inputProducers["a"] != null ? "{a}" : "[]";
        const rhs = ctx.inputProducers["b"] != null ? "{b}" : "[]";
        return expressionFor(
            this.id,
            "concatenateArrays",
            `concatenateArrays(${lhs}, ${rhs})`,
            ctx.inputProducers,
            arrayType(this.elementType),
        );
    }

    public toJSON(): SerializedArrayConcatNode {
        return {
            ...(super.toJSON() as SerializedNodeBase),
            kind: "array-concat",
            element: this.elementType,
        };
    }

    public static fromJSON(data: SerializedArrayConcatNode): ArrayConcatNode {
        const node = new ArrayConcatNode(data.element ?? { name: "unknown" });
        node.applySerializedBase(data);
        return node;
    }
}

/* ------------------------------------------------------------------ */
/*  Index                                                             */
/* ------------------------------------------------------------------ */

export class ArrayIndexNode extends OnshapeNode {
    public readonly elementType: ValueType;

    constructor(elementType: ValueType = { name: "unknown" }) {
        super("array-index", "Array Index");
        this.elementType = elementType;
        this.addInput("array", input("array", "array", arrayType(elementType)));
        this.addInput("index", input("index", "index", { name: "number" }));
        this.addOutput("return", output(elementType));
    }

    public getVariableSymbols(): string[] {
        return ["return"];
    }

    public getExpressionInfo(ctx: {
        variableMapping: Record<string, string>;
        inputProducers: Record<string, string>;
    }): ValueExpression {
        const arr = ctx.inputProducers["array"] != null ? "{array}" : "[]";
        const idx = ctx.inputProducers["index"] != null ? "{index}" : "0";
        return expressionFor(
            this.id,
            "array-index",
            `(${arr})[${idx}]`,
            ctx.inputProducers,
            this.elementType,
        );
    }

    public toJSON(): SerializedArrayIndexNode {
        return {
            ...(super.toJSON() as SerializedNodeBase),
            kind: "array-index",
            element: this.elementType,
        };
    }

    public static fromJSON(data: SerializedArrayIndexNode): ArrayIndexNode {
        const node = new ArrayIndexNode(data.element ?? { name: "unknown" });
        node.applySerializedBase(data);
        return node;
    }
}

/* ------------------------------------------------------------------ */
/*  Size                                                              */
/* ------------------------------------------------------------------ */

export class ArraySizeNode extends OnshapeNode {
    constructor() {
        super("array-size", "Array Size");
        this.addInput("array", input("array", "array", arrayType({ name: "unknown" })));
        this.addOutput("return", output({ name: "number" }));
    }

    public getVariableSymbols(): string[] {
        return ["return"];
    }

    public getExpressionInfo(ctx: {
        variableMapping: Record<string, string>;
        inputProducers: Record<string, string>;
    }): ValueExpression {
        const arr = ctx.inputProducers["array"] != null ? "{array}" : "[]";
        return expressionFor(this.id, "size", `size(${arr})`, ctx.inputProducers, { name: "number" });
    }

    public toJSON(): SerializedArraySizeNode {
        return { ...(super.toJSON() as SerializedNodeBase), kind: "array-size" };
    }

    public static fromJSON(data: SerializedArraySizeNode): ArraySizeNode {
        const node = new ArraySizeNode();
        node.applySerializedBase(data);
        return node;
    }
}

/* ------------------------------------------------------------------ */
/*  mapArray                                                          */
/* ------------------------------------------------------------------ */

export class MapArrayNode extends OnshapeNode {
    public readonly elementType: ValueType;
    public readonly resultElementType: ValueType;
    public bodyTemplate: string;

    constructor(
        elementType: ValueType = { name: "unknown" },
        resultElementType: ValueType = { name: "unknown" },
        bodyTemplate: string = "{item}",
    ) {
        super("map-array", "Map Array");
        this.elementType = elementType;
        this.resultElementType = resultElementType;
        this.bodyTemplate = bodyTemplate;
        this.addInput("array", input("array", "array", arrayType(elementType)));
        this.addOutput("return", output(arrayType(resultElementType)));
    }

    public getVariableSymbols(): string[] {
        return ["return"];
    }

    public getExpressionInfo(ctx: {
        variableMapping: Record<string, string>;
        inputProducers: Record<string, string>;
    }): ValueExpression {
        const arr = ctx.inputProducers["array"] != null ? "{array}" : "[]";
        const body = this.bodyTemplate.replaceAll("{item}", "item");
        return expressionFor(
            this.id,
            "mapArray",
            `mapArray(${arr}, function(item) { return ${body}; })`,
            ctx.inputProducers,
            arrayType(this.resultElementType),
        );
    }

    public validateGraph(ctx: GraphValidationContext): string | null {
        return iterateOverQuery(this, "array", ctx);
    }

    public toJSON(): SerializedMapArrayNode {
        return {
            ...(super.toJSON() as SerializedNodeBase),
            kind: "map-array",
            element: this.elementType,
            resultElement: this.resultElementType,
            body: this.bodyTemplate,
        };
    }

    public static fromJSON(data: SerializedMapArrayNode): MapArrayNode {
        const node = new MapArrayNode(
            data.element ?? { name: "unknown" },
            data.resultElement ?? { name: "unknown" },
            data.body ?? "{item}",
        );
        node.applySerializedBase(data);
        return node;
    }
}

/* ------------------------------------------------------------------ */
/*  forEach (bounded for over size(array))                             */
/* ------------------------------------------------------------------ */

export class ForEachNode extends OnshapeNode {
    public bodyTemplate: string;

    constructor(bodyTemplate: string = "") {
        super("for-each", "For Each");
        this.bodyTemplate = bodyTemplate;
        this.addInput("context", contextInput());
        this.addInput("array", input("array", "array", arrayType({ name: "unknown" })));
        this.addOutput("context", contextOutput());
    }

    public validateGraph(ctx: GraphValidationContext): string | null {
        return iterateOverQuery(this, "array", ctx);
    }

    public getFeatureScriptInfo(variableMapping: Record<string, string>): NodeFeaturescriptInfo {
        const arr = variableMapping["array"] ?? "[]";
        const body = this.bodyTemplate
            .replaceAll("{item}", `(${arr})[index]`)
            .replaceAll("{index}", "index");
        return {
            line: `for (var index = 0; index < size(${arr}); index += 1) {\n${body}\n}`,
            postindent: 0,
        };
    }

    public toJSON(): SerializedForEachNode {
        return {
            ...(super.toJSON() as SerializedNodeBase),
            kind: "for-each",
            body: this.bodyTemplate,
        };
    }

    public static fromJSON(data: SerializedForEachNode): ForEachNode {
        const node = new ForEachNode(data.body ?? "");
        node.applySerializedBase(data);
        return node;
    }
}

/* ------------------------------------------------------------------ */
/*  Bounded for                                                       */
/* ------------------------------------------------------------------ */

export class BoundedForNode extends OnshapeNode {
    public readonly indexVar: string;
    public readonly bound: number | undefined;
    public bodyTemplate: string;

    constructor(bound?: number, bodyTemplate: string = "", indexVar: string = "index") {
        super("bounded-for", "Bounded For");
        this.bound = bound;
        this.bodyTemplate = bodyTemplate;
        this.indexVar = /^\w+$/.test(indexVar) ? indexVar : "index";
        this.addInput("context", contextInput());
        this.addInput("count", input("count", "count", { name: "number" }));
        this.addOutput("context", contextOutput());
    }

    public validateGraph(ctx: GraphValidationContext): string | null {
        const countProducer = ctx.producers["count"];
        if (countProducer == null && this.bound == null) {
            return (
                `unbounded for loop: wire the "count" input or set the literal bound ` +
                `(must be an integer between 0 and ${MAX_LOOP_BOUND}).`
            );
        }
        if (countProducer != null) {
            const fed = fedType(this, "count", ctx);
            if (fed != null && fed.name === "Query") {
                return `cannot use a Query as the loop bound; wire a number.`;
            }
        }
        if (this.bound != null) {
            return BoundedForNode.checkBound(this.bound);
        }
        return null;
    }

    public static checkBound(bound: number): string | null {
        if (!Number.isInteger(bound) || bound < 0) {
            return `loop bound ${bound} must be a non-negative integer.`;
        }
        if (bound > MAX_LOOP_BOUND) {
            return (
                `loop bound ${bound} exceeds the maximum of ${MAX_LOOP_BOUND} ` +
                `(guard rail against generated code that hangs Onshape).`
            );
        }
        return null;
    }

    public getFeatureScriptInfo(variableMapping: Record<string, string>): NodeFeaturescriptInfo {
        const count = variableMapping["count"] ?? String(this.bound ?? 0);
        const body = this.bodyTemplate.replaceAll("{index}", this.indexVar);
        return {
            line: `for (var ${this.indexVar} = 0; ${this.indexVar} < ${count}; ${this.indexVar} += 1) {\n${body}\n}`,
            postindent: 0,
        };
    }

    public toJSON(): SerializedBoundedForNode {
        return {
            ...(super.toJSON() as SerializedNodeBase),
            kind: "bounded-for",
            ...(this.bound != null ? { bound: this.bound } : {}),
            indexVar: this.indexVar,
            body: this.bodyTemplate,
        };
    }

    public static fromJSON(data: SerializedBoundedForNode): BoundedForNode {
        const node = new BoundedForNode(data.bound, data.body ?? "", data.indexVar ?? "index");
        node.applySerializedBase(data);
        return node;
    }
}

/* ------------------------------------------------------------------ */
/*  Factory (coordinate with catalog-node-factory)                    */
/* ------------------------------------------------------------------ */

export const ARRAY_NODE_VARIANTS: readonly ArrayNodeVariant[] = [
    "array-literal",
    "array-concat",
    "array-index",
    "array-size",
    "map-array",
    "for-each",
    "bounded-for",
];

/**
 * Create an array/iteration node by variant — same role that
 * `createNodeFromCatalogEntry` plays for catalog entries, for nodes that
 * are not in the catalog. Element/result types default to `unknown`
 * (permissive) so callers can reconfigure before wiring.
 */
export function createArrayNode(
    variant: ArrayNodeVariant,
    options: { elementType?: ValueType; resultElementType?: ValueType; bound?: number; body?: string } = {},
): OnshapeNode {
    switch (variant) {
        case "array-literal":
            return new ArrayLiteralNode(options.elementType);
        case "array-concat":
            return new ArrayConcatNode(options.elementType);
        case "array-index":
            return new ArrayIndexNode(options.elementType);
        case "array-size":
            return new ArraySizeNode();
        case "map-array":
            return new MapArrayNode(
                options.elementType,
                options.resultElementType ?? options.elementType,
                options.body,
            );
        case "for-each":
            return new ForEachNode(options.body);
        case "bounded-for":
            return new BoundedForNode(options.bound, options.body);
    }
}

/** True when `source` (a socket type) may feed `target` (another socket type). */
export function arraySocketCompatible(source: ValueType, target: ValueType): boolean {
    return checkCompatibility(source, target).compatible;
}

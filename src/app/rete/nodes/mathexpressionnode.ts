/**
 * MathExpressionNode (issue #20): a Desmos-style text-first math node.
 *
 * The node owns a plain-text `source` (e.g. `2 * PI * r`). Free variables
 * in the source become named input sockets automatically; builtin
 * constants (`PI`) stay inline and never get a socket. The single
 * `return` output is typed by the compiled expression's inferred type.
 *
 * State is derived, never stored twice: `setSource` re-parses (via #21's
 * `compileMathExpression`), re-syncs sockets, and records diagnostics. A
 * parse/type failure marks the node invalid (`isValid === false`,
 * `validateGraph` refuses the build naming this node) but keeps the source
 * and the last good sockets, so editing never destroys content.
 *
 * Persistence (DR-006): only `source` + variable `bindings` are serialized.
 * Typeset markup, diagnostics and inferred types are re-derived on load.
 */
import { ClassicPreset } from 'rete';
import { OnshapeNode, GraphValidationContext } from './onshapenode';
import { OnshapeSocket } from '../onshapesockets';
import { OnshapeOutput } from '../inputoutput/onshapeoutput';
import { NodeFeaturescriptInfo } from '../../onshape-utils/featurestudiogenerator';
import type { ValueExpression } from '../../onshape-utils/expressioncodegen';
import {
    BUILTIN_CONSTANTS,
    compileMathExpression,
    isKnownFunction,
    toLatex,
    toValueExpression,
    type CompileResult,
    type MathDiagnostic,
    type MathExprNode,
    type Span,
} from '../../onshape-utils/mathexpr';
import { valueTypeLabel, type ValueType } from '../../onshape-utils/valuetypes';
import type {
    SerializedMathExpressionNode,
    SerializedNodeBase,
} from '../serialization/graph-schema-types';

const UNKNOWN: ValueType = { name: 'unknown' };

/** Free variables of a parsed expression: identifiers minus constants/functions. */
export function freeVariables(ast: MathExprNode): string[] {
    const names: string[] = [];
    const seen = new Set<string>();
    const visit = (node: MathExprNode): void => {
        switch (node.kind) {
            case 'identifier':
                if (!(node.name in BUILTIN_CONSTANTS) && !seen.has(node.name)) {
                    seen.add(node.name);
                    names.push(node.name);
                }
                return;
            case 'unary': visit(node.operand); return;
            case 'binary': visit(node.left); visit(node.right); return;
            case 'call': node.args.forEach(visit); return;
            case 'array': node.elements.forEach(visit); return;
            case 'index': visit(node.target); visit(node.index); return;
            case 'number': return;
        }
    };
    visit(ast);
    return names;
}

export class MathExpressionNode extends OnshapeNode {
    /** Plain-text expression source. The only persisted content (+ bindings). */
    public source = '';
    /** Persisted per-variable type bindings, keyed by variable name. */
    public bindings: Record<string, ValueType> = {};
    /** Diagnostics from the last compile; empty means valid. */
    public diagnostics: MathDiagnostic[] = [];
    /** Collapsed nodes show the typeset expression as their title. */
    public collapsed = false;
    private compiled: CompileResult | undefined;
    private outputType: ValueType = UNKNOWN;

    constructor(source = '') {
        super('math-expression', source);
        this.addOutput('return', new OnshapeOutput(new OnshapeSocket('return', UNKNOWN), 'return'));
        if (source !== '') this.setSource(source);
    }

    /** Last compile result (undefined before any source is set). */
    public getCompiled(): CompileResult | undefined {
        return this.compiled;
    }

    public get isValid(): boolean {
        return this.diagnostics.length === 0;
    }

    /** Error span for the editor's underline decoration, if any. */
    public get errorSpan(): Span | undefined {
        return this.diagnostics[0]?.span;
    }

    /** Hover message for the error span. */
    public get errorMessage(): string | undefined {
        return this.diagnostics[0]?.message;
    }

    /** Free variables currently exposed as input sockets. */
    public getFreeVariables(): string[] {
        return Object.keys(this.inputs);
    }

    /** Compile, sync sockets, retype the output. Never throws. */
    public setSource(source: string): void {
        this.source = source;
        if (source.trim() === '') {
            this.compiled = undefined;
            this.diagnostics = [];
            this.syncSockets([]);
            this.retypeOutput(UNKNOWN);
            return;
        }
        const free = guessFreeVariables(source);
        const env: Record<string, ValueType> = {};
        for (const name of free) env[name] = this.bindings[name] ?? UNKNOWN;
        const result = compileMathExpression(source, env);
        this.compiled = result;
        if (result.ok) {
            this.diagnostics = [];
            this.syncSockets(freeVariables(result.ast));
            this.retypeOutput(result.valueType);
        } else {
            // Invalid: keep content and last good sockets; only diagnostics change.
            this.diagnostics = result.diagnostics;
        }
    }

    /** LaTeX for the typeset preview/title, or undefined when unparseable. */
    public getLatex(): string | undefined {
        const compiled = this.compiled;
        return compiled?.ok ? toLatex(compiled.ast) : undefined;
    }

    /**
     * Collapsed-title decision: a collapsed node is titled by its typeset
     * expression (LaTeX), so a canvas stays readable at a glance; an
     * expanded node keeps the plain `Math expression` title.
     */
    public getTitle(): string {
        if (this.collapsed) return this.getLatex() ?? this.source;
        return 'Math expression';
    }

    public setCollapsed(collapsed: boolean): void {
        this.collapsed = collapsed;
    }

    /** Bind a variable to a value type (persisted; reapplied on recompile). */
    public setBinding(name: string, valueType: ValueType): void {
        this.bindings[name] = valueType;
        this.setSource(this.source);
    }

    private syncSockets(free: string[]): void {
        for (const key of Object.keys(this.inputs)) {
            if (!free.includes(key)) this.removeInput(key);
        }
        for (const name of free) {
            if (this.inputs[name] == null) {
                const type = this.bindings[name] ?? UNKNOWN;
                this.addInput(name, new ClassicPreset.Input(new OnshapeSocket(name, type), name));
            }
        }
    }

    private retypeOutput(valueType: ValueType): void {
        if (valueTypeLabel(valueType) === valueTypeLabel(this.outputType)) return;
        this.outputType = valueType;
        this.removeOutput('return');
        this.addOutput('return', new OnshapeOutput(new OnshapeSocket('return', valueType), valueTypeLabel(valueType)));
    }

    public getVariableSymbols(): string[] {
        return ['return'];
    }

    public getExpressionInfo(context: {
        variableMapping: Record<string, string>;
        inputProducers: Record<string, string>;
    }): ValueExpression | undefined {
        const compiled = this.compiled;
        if (compiled == null || !compiled.ok) return undefined;
        const value = toValueExpression(compiled, { nodeId: this.id, producer: 'math-expression' });
        // Wire producer ids through where a variable socket is connected.
        for (const [key, producer] of Object.entries(context.inputProducers)) {
            if (key in value.inputs) value.inputs[key] = producer;
        }
        return value;
    }

    public getFeaturescript(_variableMapping: Record<string, string>): string {
        const compiled = this.compiled;
        return compiled?.ok ? compiled.code : '';
    }

    public getFeatureScriptInfo(variableMapping: Record<string, string>): NodeFeaturescriptInfo {
        return { line: this.getFeaturescript(variableMapping), postindent: 0, dependencies: [] };
    }

    public validateGraph(_context: GraphValidationContext): string | null {
        if (this.diagnostics.length === 0) return null;
        const first = this.diagnostics[0];
        return `Math expression "${this.source}" is invalid: ${first.message}`;
    }

    public toJSON(): SerializedMathExpressionNode {
        return {
            ...(super.toJSON() as SerializedNodeBase),
            kind: 'math-expression',
            source: this.source,
            ...(Object.keys(this.bindings).length > 0 ? { bindings: { ...this.bindings } } : {}),
            ...(this.collapsed ? { collapsed: true } : {}),
        } as SerializedMathExpressionNode;
    }

    public static fromJSON(data: SerializedMathExpressionNode): MathExpressionNode {
        const node = new MathExpressionNode();
        node.bindings = { ...(data.bindings ?? {}) };
        node.setSource(data.source ?? '');
        node.setCollapsed(data.collapsed ?? false);
        node.applySerializedBase(data);
        // Restore the (derived) title override to the serialized base title
        // only if present; getTitle() derives from source/collapsed anyway.
        return node;
    }
}

/**
 * Best-effort free-variable guess for the type environment, used before a
 * successful parse exists. Identifiers that are constants or known
 * function names are excluded; on a parse failure the sockets are left
 * untouched, so this only feeds the compiler's environment.
 */
function guessFreeVariables(source: string): string[] {
    const names: string[] = [];
    const seen = new Set<string>();
    for (const match of source.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
        const name = match[0];
        if (name in BUILTIN_CONSTANTS || isKnownFunction(name) || seen.has(name)) continue;
        seen.add(name);
        names.push(name);
    }
    return names;
}

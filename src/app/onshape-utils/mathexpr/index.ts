/**
 * Public entry point for the math expression language (issue #21).
 *
 * Pure modules only — no UI. The typical flow:
 *
 *   const result = compileMathExpression('sqrt(x^2 + y^2)', { x: QTY, y: QTY });
 *   if (result.ok) use result.code;      // FeatureScript source
 *   else show result.diagnostics;        // complete sentences with spans
 *
 * `toValueExpression` adapts a compiled expression to the expression IR
 * from #10 (`../expressioncodegen.ts`): the emitted FeatureScript becomes
 * the node's `expression`, identifiers stay external inputs, and the
 * inferred type is carried through. The math node UI (#20) will call
 * `compileMathExpression` and store only `{ source, variables }` per DR-006.
 */
import { MathDiagnostic, MathExprError, MathExprNode } from './ast';
import { emitFeatureScript } from './emitter';
import { BUILTIN_CONSTANTS } from './functions';
import { inferType, TypeEnvironment } from './typecheck';
import { parseMathExpression } from './parser';
import { ValueType } from '../valuetypes';
import { ValueExpression } from '../expressioncodegen';

export * from './ast';
export * from './lexer';
export * from './parser';
export * from './typecheck';
export * from './emitter';
export * from './units';
export * from './functions';
export { toLatex } from './latex';

export type CompileResult =
    | {
          ok: true;
          ast: MathExprNode;
          valueType: ValueType;
          /** FeatureScript source for the expression. */
          code: string;
          diagnostics: [];
      }
    | {
          ok: false;
          ast?: undefined;
          valueType?: undefined;
          code?: undefined;
          diagnostics: MathDiagnostic[];
      };

/**
 * Parse, type-check, and emit one math expression. Never throws for a
 * malformed or ill-typed expression: failures come back as diagnostics,
 * each a complete sentence with a source span.
 */
export function compileMathExpression(
    source: string,
    env: TypeEnvironment = {}
): CompileResult {
    let ast: MathExprNode;
    try {
        ast = parseMathExpression(source);
    } catch (error) {
        if (error instanceof MathExprError) {
            return { ok: false, diagnostics: [error.diagnostic] };
        }
        throw error;
    }

    const { valueType, diagnostics } = inferType(ast, env);
    if (diagnostics.length > 0) {
        return { ok: false, diagnostics };
    }
    return { ok: true, ast, valueType, code: emitFeatureScript(ast), diagnostics: [] };
}

/**
 * Adapt a compiled math expression to the #10 expression IR: one pure
 * {@link ValueExpression} whose `expression` is the emitted FeatureScript
 * with every free identifier replaced by a `{name}` placeholder, so
 * `substituteExpression` can substitute the hoisted binding of the wired
 * producer (issue #41). Identifiers that are not free variables — builtin
 * constants (`PI`), function names and unit names (the latter are not
 * identifier nodes at all) — are emitted verbatim and never become
 * placeholders.
 */
export function toValueExpression(
    compiled: Extract<CompileResult, { ok: true }>,
    options: { nodeId?: string; producer?: string } = {}
): ValueExpression {
    const inputs: Record<string, string> = {};
    collectIdentifiers(compiled.ast, inputs);
    return {
        nodeId: options.nodeId ?? 'math',
        producer: options.producer ?? 'math-expression',
        expression: emitFeatureScript(compiled.ast, (name) =>
            name in BUILTIN_CONSTANTS ? name : `{${name}}`
        ),
        inputs,
        valueType: compiled.valueType,
        pure: true,
    };
}

function collectIdentifiers(node: MathExprNode, out: Record<string, string>): void {
    switch (node.kind) {
        case 'identifier':
            // Builtin constants (PI) are not external inputs.
            if (!(node.name in BUILTIN_CONSTANTS) && !(node.name in out)) out[node.name] = node.name;
            return;
        case 'unary':
            collectIdentifiers(node.operand, out);
            return;
        case 'binary':
            collectIdentifiers(node.left, out);
            collectIdentifiers(node.right, out);
            return;
        case 'call':
            for (const arg of node.args) collectIdentifiers(arg, out);
            return;
        case 'array':
            for (const el of node.elements) collectIdentifiers(el, out);
            return;
        case 'index':
            collectIdentifiers(node.target, out);
            collectIdentifiers(node.index, out);
            return;
        case 'number':
            return;
    }
}

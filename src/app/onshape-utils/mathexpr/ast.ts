/**
 * AST and diagnostics for the math expression language (issue #21).
 *
 * The AST is a pure expression tree (never statements) so it can be consumed
 * by the expression-codegen layer from #10: see `toValueExpression` in
 * `index.ts`. Every node carries a `span` (0-based offsets into the original
 * source, end exclusive) so a UI can underline precisely, including after
 * unicode normalization (normalization never changes source offsets: `π`
 * and `√` are lexed as single tokens spanning one source character).
 *
 * Grammar (lowest to highest precedence):
 *
 *   comparison       := additive (('=='|'!='|'<'|'<='|'>'|'>=') additive)*
 *   additive         := multiplicative (('+'|'-'|'~') multiplicative)*
 *   multiplicative   := unary (('*'|'/'|'%'| <implicit>) unary)*
 *   unary            := ('-'|'+') unary | power
 *   power            := postfix ('^' unary)?          // right-associative
 *   postfix          := primary ('[' expression ']')*
 *   primary          := number [unit] | identifier | call | array
 *                     | '(' expression ')' | '√' primary-ish | 'π'
 *
 * Because `unary` wraps `power`, `-x^2` parses as `-(x^2)`, as in standard
 * mathematics. `(-x)^2` needs explicit parentheses.
 *
 * Implicit multiplication triggers when a primary-start token follows a
 * complete factor with no operator: `2x`, `2(x+1)`, `(a)(b)`, `2 sin(x)`.
 * It is left-associative with `*`, `/` and `%`.
 *
 * Documented ambiguities (chosen once, here):
 *
 * 1. Unit suffix vs implicit multiplication: after a number, a known unit
 *    name is consumed as a unit (`2 mm`, `2mm`); a single-letter identifier
 *    or a known function name is implicit multiplication (`2x`, `2 sin(x)`);
 *    any other multi-letter identifier is rejected as an unknown unit with
 *    a suggestion. So `2 total` is an error — write `2 * total`.
 * 2. Bare function application: a known unary function may be applied
 *    without parentheses (`sin x`), binding only to the following primary
 *    (with postfix indexing), so `sin x^2` means `(sin x)^2`. Prefer
 *    parentheses. `√` behaves the same way.
 * 3. `π` is the constant `PI`; a user variable literally named `PI` cannot
 *    be referenced.
 */

/** A source span: 0-based offsets into the original source, end exclusive. */
export interface Span {
    start: number;
    end: number;
}

export function spanOf(start: number, end: number): Span {
    return { start, end };
}

export function spanFrom(a: Span, b: Span): Span {
    return { start: a.start, end: b.end };
}

export type BinaryOperator =
    | '+'
    | '-'
    | '*'
    | '/'
    | '%'
    | '^'
    | '~'
    | '=='
    | '!='
    | '<'
    | '<='
    | '>'
    | '>=';

export type MathExprNode =
    | NumberNode
    | IdentifierNode
    | UnaryNode
    | BinaryNode
    | CallNode
    | ArrayNode
    | IndexNode;

export interface NumberNode {
    kind: 'number';
    /** Numeric value (JS number). */
    value: number;
    /** Raw source text of the number, e.g. `1.5e3`. */
    raw: string;
    /** Canonical FeatureScript unit name, e.g. `inch`, when a unit suffix was given. */
    unit?: string;
    /** Raw unit suffix as written, e.g. `in`. */
    rawUnit?: string;
    span: Span;
}

export interface IdentifierNode {
    kind: 'identifier';
    name: string;
    span: Span;
}

export interface UnaryNode {
    kind: 'unary';
    operator: '-' | '+';
    operand: MathExprNode;
    span: Span;
}

export interface BinaryNode {
    kind: 'binary';
    operator: BinaryOperator;
    left: MathExprNode;
    right: MathExprNode;
    /** True when the `*` came from implicit multiplication (no operator token). */
    implicit?: boolean;
    span: Span;
}

export interface CallNode {
    kind: 'call';
    /** Function name as written (for `√`, the name is `sqrt`). */
    name: string;
    args: MathExprNode[];
    span: Span;
}

export interface ArrayNode {
    kind: 'array';
    elements: MathExprNode[];
    span: Span;
}

export interface IndexNode {
    kind: 'index';
    target: MathExprNode;
    index: MathExprNode;
    span: Span;
}

/** One precise, user-facing diagnostic. Always a complete sentence. */
export interface MathDiagnostic {
    message: string;
    span: Span;
}

/** Thrown by the lexer/parser for the first fatal error; carries exactly one diagnostic. */
export class MathExprError extends Error {
    readonly diagnostic: MathDiagnostic;

    constructor(diagnostic: MathDiagnostic) {
        super(diagnostic.message);
        this.name = 'MathExprError';
        this.diagnostic = diagnostic;
    }
}

/** Throw a complete-sentence diagnostic naming the token and the expectation. */
export function fail(span: Span, message: string): never {
    throw new MathExprError({ message, span });
}

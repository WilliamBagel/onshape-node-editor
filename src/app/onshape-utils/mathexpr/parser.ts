/**
 * Recursive-descent parser for the math expression language (issue #21).
 *
 * Produces the AST from `ast.ts`; see that file for the grammar, the
 * precedence table, and the documented ambiguities. The parser knows the
 * function names from `functions.ts` only to decide call vs variable and
 * unit suffix vs implicit multiplication — arity and typing live in
 * `typecheck.ts`. Every failure is a {@link MathExprError} whose message
 * is a complete sentence naming the offending token and what was expected.
 */
import {
    BinaryNode,
    BinaryOperator,
    CallNode,
    fail,
    IndexNode,
    MathExprNode,
    NumberNode,
    Span,
    spanFrom,
    UnaryNode,
} from './ast';
import { describeToken, Token, tokenize } from './lexer';
import { isKnownFunction } from './functions';
import { canonicalUnit, isUnitSuffix, suggestUnit } from './units';

const COMPARISONS: ReadonlySet<string> = new Set(['==', '!=', '<', '<=', '>', '>=']);

export class Parser {
    private readonly tokens: Token[];
    private pos = 0;

    constructor(source: string) {
        this.tokens = tokenize(source);
    }

    parse(): MathExprNode {
        if (this.peek().kind === 'eof') {
            fail(this.peek().span, 'Expected an expression, but found the end of the expression: type a number, a variable, or a function call.');
        }
        const expr = this.parseComparison();
        const extra = this.peek();
        if (extra.kind !== 'eof') {
            fail(extra.span, `Unexpected ${describeToken(extra)} after the expression: expected the end of the expression, or an operator such as '+' or '*'.`);
        }
        return expr;
    }

    private peek(): Token {
        return this.tokens[this.pos];
    }

    private next(): Token {
        const token = this.tokens[this.pos];
        if (this.pos < this.tokens.length - 1) this.pos++;
        return token;
    }

    private atOperator(...ops: string[]): boolean {
        const token = this.peek();
        return token.kind === 'operator' && ops.includes(token.text);
    }

    private atPunctuation(text: string): boolean {
        const token = this.peek();
        return token.kind === 'punctuation' && token.text === text;
    }

    private expectPunctuation(text: string, expectation: string): Token {
        const token = this.peek();
        if (!this.atPunctuation(text)) {
            fail(token.span, `Expected '${text}' ${expectation}, but found ${describeToken(token)}.`);
        }
        return this.next();
    }

    private parseComparison(): MathExprNode {
        let left = this.parseAdditive();
        while (this.peek().kind === 'operator' && COMPARISONS.has(this.peek().text)) {
            const op = this.next();
            const right = this.parseAdditive();
            left = this.binary(op.text as BinaryOperator, left, right, op.span);
        }
        return left;
    }

    private parseAdditive(): MathExprNode {
        let left = this.parseMultiplicative();
        while (this.atOperator('+', '-', '~')) {
            const op = this.next();
            const right = this.parseMultiplicative();
            left = this.binary(op.text as BinaryOperator, left, right, op.span);
        }
        return left;
    }

    private parseMultiplicative(): MathExprNode {
        let left = this.parseUnary();
        for (;;) {
            if (this.atOperator('*', '/', '%')) {
                const op = this.next();
                const right = this.parseUnary();
                left = this.foldQuantity(left, op.text, right);
            } else if (this.startsPrimary(this.peek())) {
                // Implicit multiplication: `2x`, `2(x+1)`, `(a)(b)`, `2 sin(x)`.
                const right = this.parseUnary();
                left = this.foldQuantity(left, '*', right, true);
            } else {
                return left;
            }
        }
    }

    private parseUnary(): MathExprNode {
        if (this.atOperator('-', '+')) {
            const op = this.next();
            const operand = this.parseUnary();
            const node: UnaryNode = {
                kind: 'unary',
                operator: op.text as '-' | '+',
                operand,
                span: spanFrom(op.span, operand.span),
            };
            return node;
        }
        return this.parsePower();
    }

    private parsePower(): MathExprNode {
        const base = this.parsePostfix();
        if (this.atOperator('^')) {
            const op = this.next();
            // Right-associative: parse the exponent as a unary expression so
            // `a^b^c` is `a^(b^c)` and `2^-3` works. Unary minus sits above
            // power, so `-x^2` is `-(x^2)` (see ast.ts).
            const exponent = this.parseUnary();
            return this.binary('^', base, exponent, op.span);
        }
        return base;
    }

    private parsePostfix(): MathExprNode {
        let expr = this.parsePrimary();
        while (this.atPunctuation('[')) {
            this.next();
            const index = this.parseComparison();
            const close = this.expectPunctuation(']', 'to close the index expression');
            const node: IndexNode = {
                kind: 'index',
                target: expr,
                index,
                span: spanFrom(expr.span, close.span),
            };
            expr = node;
        }
        return expr;
    }

    private parsePrimary(): MathExprNode {
        const token = this.peek();

        if (token.kind === 'number') {
            return this.parseNumberWithUnit();
        }

        if (token.kind === 'sqrt') {
            this.next();
            const arg = this.parseCallArgument(token);
            const node: CallNode = {
                kind: 'call',
                name: 'sqrt',
                args: [arg],
                span: spanFrom(token.span, arg.span),
            };
            return node;
        }

        if (token.kind === 'identifier') {
            return this.parseIdentifierOrCall();
        }

        if (this.atPunctuation('(')) {
            this.next();
            const inner = this.parseComparison();
            this.expectPunctuation(')', 'to close the parenthesized expression');
            return inner;
        }

        if (this.atPunctuation('[')) {
            return this.parseArrayLiteral();
        }

        fail(token.span, `Expected a number, a variable, a function call, or '(' but found ${describeToken(token)}.`);
    }

    private parseIdentifierOrCall(): MathExprNode {
        const token = this.next(); // identifier
        const name = token.text;

        if (this.atPunctuation('(')) {
            // Any identifier followed by '(' is a call; the type checker
            // reports unknown functions with their signature list.
            return this.parseCall(name, token.span);
        }

        if (isKnownFunction(name)) {
            // Bare application `sin x`: only when a primary follows.
            if (this.startsPrimary(this.peek())) {
                const arg = this.parseCallArgument(token);
                const node: CallNode = {
                    kind: 'call',
                    name,
                    args: [arg],
                    span: spanFrom(token.span, arg.span),
                };
                return node;
            }
        }

        // A bare unit name is the quantity "one of that unit" (`in` alone is
        // `1 * inch`), so `3 * mm` and `x * millimeter` work. Unit names
        // therefore shadow same-named variables (documented in ast.ts).
        if (isUnitSuffix(name)) {
            const node: NumberNode = {
                kind: 'number',
                value: 1,
                raw: '1',
                unit: canonicalUnit(name),
                rawUnit: name,
                span: token.span,
            };
            return node;
        }

        return { kind: 'identifier', name, span: token.span };
    }

    private parseCall(name: string, nameSpan: Span): CallNode {
        this.expectPunctuation('(', `to start the arguments of '${name}(...)'`);
        const args: MathExprNode[] = [];
        if (!this.atPunctuation(')')) {
            for (;;) {
                args.push(this.parseComparison());
                if (this.atPunctuation(',')) {
                    this.next();
                    continue;
                }
                break;
            }
        }
        const close = this.expectPunctuation(')', `to close the arguments of '${name}(...)'`);
        return { kind: 'call', name, args, span: spanFrom(nameSpan, close.span) };
    }

    /** Argument for bare application (`sin x`, `√x`): a primary with indexing. */
    private parseCallArgument(nameToken: Token): MathExprNode {
        const token = this.peek();
        if (!this.startsPrimary(token)) {
            fail(token.span, `Expected an argument after '${nameToken.text}', but found ${describeToken(token)}.`);
        }
        return this.parsePostfix();
    }

    private parseArrayLiteral(): MathExprNode {
        const open = this.expectPunctuation('[', 'to start an array literal');
        const elements: MathExprNode[] = [];
        if (!this.atPunctuation(']')) {
            for (;;) {
                elements.push(this.parseComparison());
                if (this.atPunctuation(',')) {
                    this.next();
                    continue;
                }
                break;
            }
        }
        const close = this.expectPunctuation(']', 'to close the array literal');
        return { kind: 'array', elements, span: spanFrom(open.span, close.span) };
    }

    private parseNumberWithUnit(): MathExprNode {
        const token = this.next(); // number
        const value = Number(token.text);
        const node: NumberNode = {
            kind: 'number',
            value,
            raw: token.text,
            span: token.span,
        };

        const nextToken = this.peek();
        if (nextToken.kind === 'identifier') {
            const suffix = nextToken.text;
            if (isUnitSuffix(suffix)) {
                node.unit = canonicalUnit(suffix);
                node.rawUnit = suffix;
                node.span = spanFrom(token.span, nextToken.span);
                this.next();
                return node;
            }
            if (suffix.length > 1 && !isKnownFunction(suffix) && suffix !== 'PI') {
                // Documented ambiguity (ast.ts): a multi-letter identifier
                // after a number reads as a unit, so an unknown one is an
                // error here rather than implicit multiplication.
                const suggestion = suggestUnit(suffix);
                const hint = suggestion != null
                    ? ` Did you mean '${suggestion}'?`
                    : ' Known units include mm, cm, m, in, ft, deg, rad, s, kg, and g.';
                fail(nextToken.span, `Unknown unit '${suffix}' after number '${token.text}': expected a known unit such as 'mm', 'in', or 'deg', or an operator.${hint}`);
            }
            // Single letter or known function: implicit multiplication, handled
            // by the multiplicative loop (`2x`, `2 sin(x)`).
        }
        return node;
    }

    private startsPrimary(token: Token): boolean {
        return (
            token.kind === 'number' ||
            token.kind === 'identifier' ||
            token.kind === 'sqrt' ||
            (token.kind === 'punctuation' && (token.text === '(' || token.text === '['))
        );
    }

    /**
     * Fold `number * unit` (e.g. `3 * mm`, `2 * in`) into one quantity node
     * so it emits as `3 * millimeter` rather than `3 * 1 * millimeter`.
     * Everything else becomes an ordinary binary node.
     */
    private foldQuantity(
        left: MathExprNode,
        operator: string,
        right: MathExprNode,
        implicit = false
    ): MathExprNode {
        if (
            operator === '*' &&
            left.kind === 'number' &&
            left.unit == null &&
            right.kind === 'number' &&
            right.unit != null &&
            right.value === 1
        ) {
            const folded: NumberNode = {
                kind: 'number',
                value: left.value,
                raw: left.raw,
                unit: right.unit,
                rawUnit: right.rawUnit,
                span: spanFrom(left.span, right.span),
            };
            return folded;
        }
        return this.binary(operator as BinaryOperator, left, right, right.span, implicit);
    }

    private binary(
        operator: BinaryOperator,
        left: MathExprNode,
        right: MathExprNode,
        opSpan: Span,
        implicit = false
    ): BinaryNode {
        return {
            kind: 'binary',
            operator,
            left,
            right,
            implicit,
            span: spanFrom(left.span, right.span),
        };
    }
}

/** Parse `source` into an expression AST, or throw {@link MathExprError}. */
export function parseMathExpression(source: string): MathExprNode {
    return new Parser(source).parse();
}

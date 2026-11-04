/**
 * FeatureScript emitter for the math expression language (issue #21).
 *
 * Emits FeatureScript *source* (not a parameter expression), so unit
 * suffixes are expanded here: a quantity `2 in` emits `2 * inch`. `^` is
 * retained because FeatureScript uses `^` for exponentiation. Parentheses
 * are added only where precedence requires them, and formatting is stable
 * (single spaces around binary operators, `, ` between arguments) so
 * golden tests compare byte-for-byte.
 *
 * Precedence (mirrors the parser, so re-parsing emitted output yields the
 * same AST):
 *
 *   comparisons (1) < additive/concat `+ - ~` (2) < multiplicative `* / %` (3)
 *   < unary (4) < power `^` (5) < postfix index (6) < primary (7)
 *
 * `^` is right-associative: its right child needs no parentheses at equal
 * precedence, its left child does. Unary minus binds looser than `^`, so
 * `-(x^2)` emits `-x^2` and `(-x)^2` keeps its parentheses.
 */
import { MathExprNode } from './ast';

const COMPARISON_PRECEDENCE = 1;
const ADDITIVE_PRECEDENCE = 2;
const MULTIPLICATIVE_PRECEDENCE = 3;
const UNARY_PRECEDENCE = 4;
const POWER_PRECEDENCE = 5;
const POSTFIX_PRECEDENCE = 6;

function precedenceOf(node: MathExprNode): number {
    switch (node.kind) {
        case 'number':
            // A quantity emits as a product (`2 * inch`), so its effective
            // precedence is multiplicative: `(2 * inch) ^ 2` needs parens.
            return node.unit != null ? MULTIPLICATIVE_PRECEDENCE : 7;
        case 'binary':
            if (['==', '!=', '<', '<=', '>', '>='].includes(node.operator)) return COMPARISON_PRECEDENCE;
            if (['+', '-', '~'].includes(node.operator)) return ADDITIVE_PRECEDENCE;
            if (['*', '/', '%'].includes(node.operator)) return MULTIPLICATIVE_PRECEDENCE;
            return POWER_PRECEDENCE; // '^'
        case 'unary':
            return UNARY_PRECEDENCE;
        case 'index':
            return POSTFIX_PRECEDENCE;
        default:
            return 7;
    }
}

/** Stable number formatting: integers print without a decimal point. */
export function formatNumber(value: number): string {
    if (Object.is(value, -0)) return '0';
    if (Number.isInteger(value) && Math.abs(value) < 1e21) return String(value);
    return String(value);
}

/** Emit FeatureScript source for an expression AST. */
export function emitFeatureScript(node: MathExprNode): string {
    return emit(node, 0);
}

function emit(node: MathExprNode, contextPrecedence: number): string {
    const precedence = precedenceOf(node);
    let text: string;

    switch (node.kind) {
        case 'number': {
            const number = formatNumber(node.value);
            text = node.unit != null ? `${number} * ${node.unit}` : number;
            break;
        }
        case 'identifier':
            text = node.name;
            break;
        case 'unary': {
            const operand = emit(node.operand, UNARY_PRECEDENCE + 1);
            text = node.operator === '-' ? `-${operand}` : `+${operand}`;
            break;
        }
        case 'binary': {
            if (node.operator === '^') {
                // Right-associative: left child at equal precedence needs
                // parentheses, right child does not. The right child may be
                // a unary expression (`2 ^ -3`), so its context is unary.
                const left = emit(node.left, POWER_PRECEDENCE + 1);
                const right = emit(node.right, UNARY_PRECEDENCE);
                text = `${left} ^ ${right}`;
            } else {
                const left = emit(node.left, precedence);
                const right = emit(node.right, precedence + 1);
                text = `${left} ${node.operator} ${right}`;
            }
            break;
        }
        case 'call':
            text = `${node.name}(${node.args.map((arg) => emit(arg, 0)).join(', ')})`;
            break;
        case 'array':
            text = `[${node.elements.map((el) => emit(el, 0)).join(', ')}]`;
            break;
        case 'index': {
            const target = emit(node.target, POSTFIX_PRECEDENCE);
            text = `${target}[${emit(node.index, 0)}]`;
            break;
        }
    }

    return precedence < contextPrecedence ? `(${text})` : text;
}

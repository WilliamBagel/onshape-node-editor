/**
 * AST -> LaTeX (issue #20). Pure and DOM-free: the renderer
 * (`../../rete/nodes/math-renderer.ts`) turns this string into typeset
 * output. Precedence mirrors `ast.ts`; parentheses are emitted only where
 * the AST needs them, so `-(x^2)` stays `-(x^{2})` and `(-x)^2` keeps its
 * parentheses.
 */
import type { MathExprNode } from './ast';

const PRECEDENCE: Record<string, number> = {
    '==': 1, '!=': 1, '<': 1, '<=': 1, '>': 1, '>=': 1,
    '+': 2, '-': 2, '~': 2,
    '*': 3, '/': 3, '%': 3,
    '^': 4,
};

const TEX_FUNCTIONS: Record<string, string> = {
    sin: '\\sin', cos: '\\cos', tan: '\\tan',
    asin: '\\arcsin', acos: '\\arccos', atan: '\\arctan',
    log: '\\log', exp: '\\exp', abs: '\\lvert', sqrt: '\\sqrt',
};

function latexOf(node: MathExprNode): string {
    switch (node.kind) {
        case 'number': {
            const base = node.raw;
            return node.unit != null ? `${base}\\,\\mathrm{${node.unit}}` : base;
        }
        case 'identifier':
            return node.name === 'PI' || node.name === 'π' ? '\\pi' : node.name;
        case 'unary':
            return node.operator === '-' ? `-${wrap(node.operand, 4)}` : wrap(node.operand, 4);
        case 'binary':
            return binary(node);
        case 'call':
            return call(node);
        case 'array':
            return `\\begin{bmatrix} ${node.elements.map(latexOf).join(' & ')} \\end{bmatrix}`;
        case 'index':
            return `${wrap(node.target, 5)}_{${latexOf(node.index)}}`;
    }
}

function wrap(node: MathExprNode, parentPrecedence: number): string {
    const text = latexOf(node);
    if (node.kind === 'binary' && (PRECEDENCE[node.operator] ?? 0) < parentPrecedence) {
        return `\\left(${text}\\right)`;
    }
    if (node.kind === 'unary' && parentPrecedence > 3) return `\\left(${text}\\right)`;
    return text;
}

function binary(node: Extract<MathExprNode, { kind: 'binary' }>): string {
    const prec = PRECEDENCE[node.operator] ?? 0;
    const left = wrap(node.left, prec);
    if (node.operator === '/') return `\\frac{${latexOf(node.left)}}{${wrap(node.right, prec + 1)}}`;
    if (node.operator === '^') return `${wrap(node.left, prec + 1)}^{${latexOf(node.right)}}`;
    if (node.operator === '*') {
        const sep = node.implicit ? '\\,' : ' \\cdot ';
        return `${left}${sep}${wrap(node.right, prec + 1)}`;
    }
    const op = node.operator === '~' ? '\\mathbin{\\sim}' : node.operator;
    return `${left} ${op} ${wrap(node.right, prec + 1)}`;
}

function call(node: Extract<MathExprNode, { kind: 'call' }>): string {
    if (node.name === 'sqrt') return `\\sqrt{${node.args.map(latexOf).join(', ')}}`;
    if (node.name === 'abs') return `\\lvert ${node.args.map(latexOf).join(', ')} \\rvert`;
    const fn = TEX_FUNCTIONS[node.name] ?? `\\operatorname{${node.name}}`;
    return `${fn}\\left(${node.args.map(latexOf).join(', ')}\\right)`;
}

/** Typeset form of a parsed expression. Throws only on an unknown AST kind. */
export function toLatex(node: MathExprNode): string {
    return latexOf(node);
}

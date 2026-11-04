import { describe, expect, it, vi } from 'vitest';
import {
    CachedMathRenderer,
    KatexRenderer,
    debounce,
    renderCacheKey,
    type MathRenderer,
} from '../nodes/math-renderer';
import { toLatex } from '../../onshape-utils/mathexpr/latex';
import { parseMathExpression } from '../../onshape-utils/mathexpr/parser';

describe('KaTeX renderer', () => {
    it('renders typeset HTML with embedded MathML from the AST', () => {
        const renderer = new KatexRenderer();
        const latex = toLatex(parseMathExpression('2 * PI * r'));
        expect(latex).toContain('\\pi');
        const rendered = renderer.render(latex);
        expect(rendered.html).toContain('katex');
        expect(rendered.mathml).toContain('<math');
        expect(rendered.html).toContain(rendered.mathml.slice(0, 20));
    });

    it('handles fractions, powers and functions', () => {
        const renderer = new KatexRenderer();
        const latex = toLatex(parseMathExpression('sqrt(x^2 + 1) / (2 * y)'));
        const rendered = renderer.render(latex);
        expect(rendered.html).toContain('katex');
        expect(rendered.mathml).toContain('<math');
    });
});

describe('render cache', () => {
    it('does not re-render on repeat calls (pan/zoom only moves DOM)', () => {
        const inner: MathRenderer = {
            name: 'spy',
            render: (latex) => ({ html: `H:${latex}`, mathml: '', latex }),
        };
        const cached = new CachedMathRenderer(inner);
        cached.render('a+b');
        cached.render('a+b');
        cached.render('a+b');
        expect(cached.renders).toBe(1);
        expect(cached.hits).toBe(2);
        cached.render('a-b');
        expect(cached.renders).toBe(2);
    });

    it('cache key includes the macro set', () => {
        expect(renderCacheKey('x', { macros: { '\\R': 'R' } })).not.toBe(renderCacheKey('x'));
        expect(renderCacheKey('x', { macros: { '\\R': 'R' } })).toBe(
            renderCacheKey('x', { macros: { '\\R': 'R' } }),
        );
    });
});

describe('debounce', () => {
    it('coalesces rapid calls and flush runs the last one', () => {
        vi.useFakeTimers();
        const fn = vi.fn();
        const debounced = debounce(fn, 150);
        debounced('a');
        debounced('b');
        debounced('c');
        expect(fn).not.toHaveBeenCalled();
        debounced.flush();
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith('c');
        vi.useRealTimers();
    });
});

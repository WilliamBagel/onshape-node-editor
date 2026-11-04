import { describe, expect, it } from 'vitest';
import {
    compileMathExpression,
    emitFeatureScript,
    inferType,
    parseMathExpression,
    toValueExpression,
    TypeEnvironment,
} from '../index';
import { ValueType } from '../../valuetypes';

const NUMBER: ValueType = { name: 'number' };
const MM: ValueType = { name: 'ValueWithUnits', units: 'millimeter' };
const VECTOR: ValueType = { name: 'Vector' };
const ANGLE: ValueType = { name: 'ValueWithUnits', units: 'degree' };

const ENV: TypeEnvironment = {
    x: MM,
    y: MM,
    r: NUMBER,
    i: NUMBER,
    a: VECTOR,
    b: VECTOR,
    theta: ANGLE,
    label: { name: 'string' },
    other: { name: 'string' },
    total: NUMBER,
};

interface GoldenCase {
    source: string;
    code: string;
    type: string;
    env?: TypeEnvironment;
}

describe('golden parse -> type-check -> emit', () => {
    const cases: GoldenCase[] = [
        // Every FeatureScript binary operator.
        { source: '1 + 2', code: '1 + 2', type: 'number' },
        { source: '5 - 3', code: '5 - 3', type: 'number' },
        { source: '2 * 3', code: '2 * 3', type: 'number' },
        { source: '7 / 2', code: '7 / 2', type: 'number' },
        { source: '7 % 3', code: '7 % 3', type: 'number' },
        { source: '2 ^ 3', code: '2 ^ 3', type: 'number' },
        { source: 'label ~ other', code: 'label ~ other', type: 'string' },
        { source: '1 < 2', code: '1 < 2', type: 'boolean' },
        { source: '1 <= 2', code: '1 <= 2', type: 'boolean' },
        { source: '1 > 2', code: '1 > 2', type: 'boolean' },
        { source: '1 >= 2', code: '1 >= 2', type: 'boolean' },
        { source: '1 == 2', code: '1 == 2', type: 'boolean' },
        { source: '1 != 2', code: '1 != 2', type: 'boolean' },
        // Precedence and parenthesization.
        { source: '1 + 2 * 3', code: '1 + 2 * 3', type: 'number' },
        { source: '(1 + 2) * 3', code: '(1 + 2) * 3', type: 'number' },
        { source: '1 - (2 - 3)', code: '1 - (2 - 3)', type: 'number' },
        { source: '8 / (4 / 2)', code: '8 / (4 / 2)', type: 'number' },
        { source: '2 ^ 3 ^ 2', code: '2 ^ 3 ^ 2', type: 'number' },
        { source: '(2 ^ 3) ^ 2', code: '(2 ^ 3) ^ 2', type: 'number' },
        { source: '-x', code: '-x', type: 'ValueWithUnits (millimeter)' },
        { source: '-x^2', code: '-x ^ 2', type: 'ValueWithUnits (millimeter^2)' },
        { source: '(-x)^2', code: '(-x) ^ 2', type: 'ValueWithUnits (millimeter^2)' },
        { source: '2^-3', code: '2 ^ -3', type: 'number' },
        // Implicit multiplication.
        { source: '2x', code: '2 * x', type: 'ValueWithUnits (millimeter)' },
        { source: '2(x + 1 * mm)', code: '2 * (x + 1 * millimeter)', type: 'ValueWithUnits (millimeter)' },
        { source: '(x)(y)', code: 'x * y', type: 'ValueWithUnits (millimeter^2)' },
        { source: '2 sin(theta)', code: '2 * sin(theta)', type: 'number' },
        { source: '2PI r', code: '2 * PI * r', type: 'number' },
        // Numbers: decimal and exponent forms.
        { source: '2.5', code: '2.5', type: 'number' },
        { source: '.5', code: '0.5', type: 'number' },
        { source: '1e3', code: '1000', type: 'number' },
        { source: '1.5E-3', code: '0.0015', type: 'number' },
        // Unit expansion to FeatureScript.
        { source: '2 in', code: '2 * inch', type: 'ValueWithUnits (inch)' },
        { source: '2mm', code: '2 * millimeter', type: 'ValueWithUnits (millimeter)' },
        { source: '2 in + 3 mm', code: '2 * inch + 3 * millimeter', type: 'ValueWithUnits (inch)' },
        { source: '30 deg', code: '30 * degree', type: 'ValueWithUnits (degree)' },
        { source: '30°', code: '30 * degree', type: 'ValueWithUnits (degree)' },
        { source: '1 kg', code: '1 * kilogram', type: 'ValueWithUnits (kilogram)' },
        { source: '5 s', code: '5 * second', type: 'ValueWithUnits (second)' },
        // Functions and signatures.
        { source: 'sin(theta)', code: 'sin(theta)', type: 'number' },
        { source: 'cos(30 deg)', code: 'cos(30 * degree)', type: 'number' },
        { source: 'asin(0.5)', code: 'asin(0.5)', type: 'ValueWithUnits (radian)' },
        { source: 'atan2(1, 2)', code: 'atan2(1, 2)', type: 'ValueWithUnits (radian)' },
        { source: 'sqrt(4 mm^2)', code: 'sqrt((4 * millimeter) ^ 2)', type: 'ValueWithUnits' },
        { source: 'cross(a, b)', code: 'cross(a, b)', type: 'Vector' },
        { source: 'dot(a, b)', code: 'dot(a, b)', type: 'number' },
        { source: 'normalize(a)', code: 'normalize(a)', type: 'Vector' },
        { source: 'abs(-3)', code: 'abs(-3)', type: 'number' },
        { source: 'min(1, 2)', code: 'min(1, 2)', type: 'number' },
        { source: 'max(3 mm, 2 in)', code: 'max(3 * millimeter, 2 * inch)', type: 'ValueWithUnits (millimeter)' },
        { source: 'floor(7, 2)', code: 'floor(7, 2)', type: 'number' },
        { source: 'log(10)', code: 'log(10)', type: 'number' },
        { source: 'exp(1)', code: 'exp(1)', type: 'number' },
        { source: 'vector(1, 2, 3)', code: 'vector(1, 2, 3)', type: 'Vector' },
        { source: 'matrix([1, 2])', code: 'matrix([1, 2])', type: 'Matrix' },
        { source: 'sin theta', code: 'sin(theta)', type: 'number' },
        // Arrays and indexing.
        { source: '[1, 2, 3]', code: '[1, 2, 3]', type: 'array<number>' },
        { source: '[1, 2, 3][i]', code: '[1, 2, 3][i]', type: 'number' },
        { source: '[1, 2, 3][0]', code: '[1, 2, 3][0]', type: 'number' },
        // Constants and identifiers.
        { source: 'PI', code: 'PI', type: 'number' },
        { source: 'v_1', code: 'v_1', type: 'number', env: { v_1: NUMBER } },
        // Unicode normalization.
        { source: '2 × 3', code: '2 * 3', type: 'number' },
        { source: '2 · x', code: '2 * x', type: 'ValueWithUnits (millimeter)' },
        { source: '5 − 3', code: '5 - 3', type: 'number' },
        { source: 'π', code: 'PI', type: 'number' },
        { source: '√(4 mm^2)', code: 'sqrt((4 * millimeter) ^ 2)', type: 'ValueWithUnits' },
        { source: '2 ÷ 4', code: '2 / 4', type: 'number' },
        // The five acceptance expressions from issue #21.
        { source: '(3 * mm + 2 * in)^2', code: '(3 * millimeter + 2 * inch) ^ 2', type: 'ValueWithUnits (millimeter^2)' },
        { source: 'sqrt(x^2 + y^2)', code: 'sqrt(x ^ 2 + y ^ 2)', type: 'ValueWithUnits' },
        { source: 'cross(a, b)', code: 'cross(a, b)', type: 'Vector' },
        { source: '2 * PI * r', code: '2 * PI * r', type: 'number' },
        { source: '[1, 2, 3][i]', code: '[1, 2, 3][i]', type: 'number' },
    ];

    for (const testCase of cases) {
        it(`${testCase.source}  ->  ${testCase.code}`, () => {
            const result = compileMathExpression(testCase.source, testCase.env ?? ENV);
            expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
            if (!result.ok) return;
            expect(result.code).toBe(testCase.code);
            // Stable formatting: emitting twice and re-parsing is a fixed point.
            expect(emitFeatureScript(parseMathExpression(result.code))).toBe(result.code);
            expect(result.valueType.name).toBe(testCase.type.split(' ')[0].replace('array<number>', 'array'));
            if (testCase.type.includes(' (')) {
                expect(result.valueType.units).toBe(testCase.type.match(/\((.*)\)/)?.[1]);
            }
        });
    }
});

describe('spans', () => {
    it('puts a span on every AST node, covering the source', () => {
        const source = 'sqrt(x^2 + 2 mm)';
        const ast = parseMathExpression(source);
        const check = (node: unknown): void => {
            const n = node as { span: { start: number; end: number } };
            expect(n.span.start).toBeGreaterThanOrEqual(0);
            expect(n.span.end).toBeLessThanOrEqual(source.length);
            expect(n.span.end).toBeGreaterThan(n.span.start);
            for (const value of Object.values(n)) {
                if (Array.isArray(value)) value.forEach(check);
                else if (value != null && typeof value === 'object' && 'kind' in value) check(value);
            }
        };
        check(ast);
    });

    it('points unitless-trig diagnostics at the argument', () => {
        const result = compileMathExpression('sin(30)', ENV);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.diagnostics[0].span).toEqual({ start: 4, end: 6 });
    });
});

describe('diagnostics', () => {
    const cases: Array<{ source: string; pattern: RegExp; env?: TypeEnvironment }> = [
        { source: '', pattern: /Expected an expression/ },
        { source: '2 +', pattern: /Expected a number, a variable, a function call, or '\('/ },
        { source: '2 + * 3', pattern: /Expected a number/ },
        { source: '(1 + 2', pattern: /Expected '\)' to close the parenthesized expression/ },
        { source: '1 2 +', pattern: /Expected a number/ },
        { source: 'foo(1)', pattern: /Unknown function 'foo'/ },
        { source: 'sin()', pattern: /expects 1 argument\(s\)/ },
        { source: 'cross(a)', pattern: /expects 2 argument\(s\)/ },
        { source: 'cross(a, b, a)', pattern: /expects 2 argument\(s\)/ },
        { source: 'unknownVar + 1', pattern: /Unknown identifier 'unknownVar'/ },
        { source: 'sin(30)', pattern: /unitless number.*30 deg/s },
        { source: 'tan(1)', pattern: /must be a quantity with units/ },
        { source: 'sqrt(4)', pattern: /must be a quantity with units/ },
        { source: 'sin(3 mm)', pattern: /must be an angle quantity/ },
        { source: '1 + 2 mm', pattern: /cannot combine number with ValueWithUnits/ },
        { source: '3 mm + 2 s', pattern: /same dimension of units/ },
        { source: '2 ^ (1 mm)', pattern: /exponent of '\^' must be a unitless number/ },
        { source: '[1, 2 mm]', pattern: /does not match the earlier element type/ },
        { source: 'x[0]', pattern: /Cannot index ValueWithUnits/ },
        { source: '[1, 2][x]', pattern: /Array index must be a number/ },
        { source: '2 mmm', pattern: /Unknown unit 'mmm'.*Did you mean 'mm'\?/ },
        { source: '2 qq', pattern: /Unknown unit 'qq'/ },
        { source: '1 ~ 2', pattern: /Operator '~' concatenates strings/ },
        { source: '1 < 2 mm', pattern: /Cannot compare/ },
        { source: '~a', pattern: /Expected a number/ },
        { source: '2 @ 3', pattern: /Unexpected character '@'/ },
        { source: 'sin 2', pattern: /must be a quantity with units/ },
    ];

    for (const testCase of cases) {
        it(`rejects ${JSON.stringify(testCase.source)}`, () => {
            const result = compileMathExpression(testCase.source, testCase.env ?? ENV);
            expect(result.ok).toBe(false);
            if (result.ok) return;
            expect(result.diagnostics.length).toBeGreaterThan(0);
            for (const diagnostic of result.diagnostics) {
                // Every diagnostic is a complete sentence with a span.
                expect(diagnostic.message).toMatch(/[.?]$/);
                expect(diagnostic.span.end).toBeGreaterThanOrEqual(diagnostic.span.start);
                expect(diagnostic.span.start).toBeGreaterThanOrEqual(0);
                expect(diagnostic.span.end).toBeLessThanOrEqual(testCase.source.length);
            }
            expect(result.diagnostics[0].message).toMatch(testCase.pattern);
        });
    }

    it('names the token and the expectation', () => {
        const result = compileMathExpression('2 mmm', ENV);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.diagnostics[0].message).toContain("'mmm'");
        expect(result.diagnostics[0].message).toContain('Did you mean');
    });

    it('never throws on malformed input', () => {
        for (const source of [')', '][', '(((', 'sin(', '2^^3', ',', '√', '2 total']) {
            const result = compileMathExpression(source, ENV);
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.diagnostics[0].message).toMatch(/[.?]$/);
        }
    });
});

describe('type inference details', () => {
    it('infers area units from ^, and number from equal-unit division', () => {
        expect(inferType(parseMathExpression('x * y'), ENV).valueType.units).toBe('millimeter^2');
        expect(inferType(parseMathExpression('x / y'), ENV).valueType.name).toBe('number');
        expect(inferType(parseMathExpression('x^2'), ENV).valueType.units).toBe('millimeter^2');
        expect(inferType(parseMathExpression('x^3'), ENV).valueType.units).toBe('millimeter^3');
    });

    it('treats unknown variables permissively', () => {
        const result = compileMathExpression('mystery + 1', { mystery: { name: 'unknown' } });
        expect(result.ok).toBe(true);
    });
});

describe('expression IR bridge (#10)', () => {
    it('produces a ValueExpression consumable by expressioncodegen', () => {
        const result = compileMathExpression('sqrt(x^2 + y^2)', ENV);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const value = toValueExpression(result, { nodeId: 'n1', producer: 'hypotenuse' });
        expect(value.expression).toBe('sqrt(x ^ 2 + y ^ 2)');
        expect(value.inputs).toEqual({ x: 'x', y: 'y' });
        expect(value.valueType.name).toBe('ValueWithUnits');
        expect(value.pure).toBe(true);
    });
});

/**
 * Type inference for the math expression language (issue #21, scope item 3).
 *
 * Types come from the value-type model of #9 (`../valuetypes.ts`):
 * numbers are `number`, quantities are `ValueWithUnits` carrying their
 * (canonical) units, `Vector`/`Matrix`/`Transform` come from variables and
 * the function signatures in `functions.ts`. `unknown` (untyped variables)
 * is permissive, matching `valuetypes.ts`: an unknown operand never
 * produces a type error, because the checker cannot know better.
 *
 * Unit algebra: quantities carry a small unit map internally
 * (`meter^2`, `meter/second`, ...). `+`/`-`/`%` require identical units;
 * `*`/`/` combine them; `^` with an integer literal exponent scales them,
 * which is how `(3 * mm + 2 * in)^2` gets area units naturally. A
 * non-integer power of a quantity yields a `ValueWithUnits` of unknown
 * units. The formatted unit string is stored on the returned `ValueType`
 * so `valueTypeLabel` shows it.
 *
 * UNIT-LESS TRIG: see the decision documented in `functions.ts` — a bare
 * `number` passed to `sin`/`cos`/`tan` (and to `sqrt`) is a type error;
 * the user must write an explicit angle/length quantity.
 */
import {
    BinaryNode,
    CallNode,
    IndexNode,
    MathDiagnostic,
    MathExprNode,
    Span,
} from './ast';
import { isArrayValueType, ValueType, valueTypeLabel } from '../valuetypes';
import {
    BUILTIN_CONSTANTS,
    checkFunctionArgs,
    FUNCTION_SIGNATURES,
} from './functions';
import { sameDimension } from './units';

export type TypeEnvironment = Readonly<Record<string, ValueType>>;

export interface TypeCheckResult {
    /** Inferred type of the whole expression (meaningful when no diagnostics). */
    valueType: ValueType;
    diagnostics: MathDiagnostic[];
}

const UNKNOWN: ValueType = { name: 'unknown' };

/** Internal unit algebra: unit name -> exponent. */
type UnitMap = Map<string, number>;

function unitsOf(t: ValueType): UnitMap | undefined {
    if (t.name !== 'ValueWithUnits') return undefined;
    if (t.units == null) return new Map();
    const map: UnitMap = new Map();
    for (const part of t.units.split('*')) {
        const [name, expText] = part.split('^');
        map.set(name, expText != null ? Number(expText) : 1);
    }
    return map;
}

function formatUnits(map: UnitMap): string | undefined {
    const positive: string[] = [];
    const negative: string[] = [];
    for (const [name, exp] of [...map.entries()].sort()) {
        if (exp === 0) continue;
        const text = exp === 1 ? name : `${name}^${Math.abs(exp)}`;
        (exp > 0 ? positive : negative).push(text);
    }
    if (positive.length === 0 && negative.length === 0) return undefined;
    let result = positive.join('*');
    if (negative.length > 0) {
        result = result === '' ? `1/${negative.join('*')}` : `${result}/${negative.join('*')}`;
    }
    return result;
}

function combineUnits(a: UnitMap, b: UnitMap, sign: 1 | -1): UnitMap {
    const result: UnitMap = new Map(a);
    for (const [name, exp] of b) {
        result.set(name, (result.get(name) ?? 0) + sign * exp);
    }
    return result;
}

function scaleUnits(a: UnitMap, factor: number): UnitMap {
    const result: UnitMap = new Map();
    for (const [name, exp] of a) result.set(name, exp * factor);
    return result;
}

function quantityWith(map: UnitMap): ValueType {
    const units = formatUnits(map);
    return units != null ? { name: 'ValueWithUnits', units } : { name: 'ValueWithUnits' };
}

export function inferType(node: MathExprNode, env: TypeEnvironment): TypeCheckResult {
    const diagnostics: MathDiagnostic[] = [];
    const valueType = visit(node, env, diagnostics);
    return { valueType, diagnostics };
}

function visit(node: MathExprNode, env: TypeEnvironment, diagnostics: MathDiagnostic[]): ValueType {
    switch (node.kind) {
        case 'number':
            return node.unit != null
                ? { name: 'ValueWithUnits', units: node.unit }
                : { name: 'number' };
        case 'identifier': {
            const known = env[node.name] ?? BUILTIN_CONSTANTS[node.name];
            if (known != null) return known;
            diagnostics.push({
                message: `Unknown identifier '${node.name}': expected a variable from the environment, or a constant such as 'PI'.`,
                span: node.span,
            });
            return UNKNOWN;
        }
        case 'unary': {
            const operand = visit(node.operand, env, diagnostics);
            if (operand.name === 'number' || operand.name === 'ValueWithUnits' ||
                operand.name === 'Vector' || operand.name === 'Matrix' || operand.name === 'unknown') {
                return operand;
            }
            diagnostics.push({
                message: `Cannot apply unary '${node.operator}' to ${valueTypeLabel(operand)}: expected a number, a quantity, a Vector, or a Matrix.`,
                span: node.span,
            });
            return UNKNOWN;
        }
        case 'binary':
            return visitBinary(node, env, diagnostics);
        case 'call':
            return visitCall(node, env, diagnostics);
        case 'array': {
            let element: ValueType = UNKNOWN;
            for (const item of node.elements) {
                const itemType = visit(item, env, diagnostics);
                if (element.name === 'unknown') {
                    element = itemType;
                } else if (itemType.name !== 'unknown' && itemType.name !== element.name) {
                    diagnostics.push({
                        message: `Array element of type ${valueTypeLabel(itemType)} does not match the earlier element type ${valueTypeLabel(element)}: expected all array elements to have the same type.`,
                        span: item.span,
                    });
                }
            }
            return { name: 'array', element };
        }
        case 'index': {
            const target = visit(node.target, env, diagnostics);
            const index = visit(node.index, env, diagnostics);
            if (index.name !== 'number' && index.name !== 'unknown') {
                diagnostics.push({
                    message: `Array index must be a number, but got ${valueTypeLabel(index)}: expected an integer-valued number.`,
                    span: node.index.span,
                });
            }
            if (isArrayValueType(target)) return target.element;
            if (target.name === 'unknown') return UNKNOWN;
            diagnostics.push({
                message: `Cannot index ${valueTypeLabel(target)}: expected an array value, such as 'arr[0]'.`,
                span: node.target.span,
            });
            return UNKNOWN;
        }
    }
}

function visitBinary(node: BinaryNode, env: TypeEnvironment, diagnostics: MathDiagnostic[]): ValueType {
    const left = visit(node.left, env, diagnostics);
    const right = visit(node.right, env, diagnostics);
    const op = node.operator;
    const span = node.span;

    if (left.name === 'unknown' || right.name === 'unknown') return UNKNOWN;

    if (op === '~') {
        if (left.name === 'string' && right.name === 'string') return { name: 'string' };
        diagnostics.push({
            message: `Operator '~' concatenates strings, but got ${valueTypeLabel(left)} and ${valueTypeLabel(right)}: expected two string values.`,
            span,
        });
        return UNKNOWN;
    }

    if (['==', '!=', '<', '<=', '>', '>='].includes(op)) {
        if (left.name !== right.name) {
            diagnostics.push({
                message: `Cannot compare ${valueTypeLabel(left)} with ${valueTypeLabel(right)} using '${op}': expected two values of the same kind.`,
                span,
            });
            return UNKNOWN;
        }
        if (left.name === 'ValueWithUnits' && right.name === 'ValueWithUnits') {
            if (!sameDimension(left.units, right.units)) {
                diagnostics.push({
                    message: `Cannot compare quantities in '${left.units}' with quantities in '${right.units}': expected both sides to use the same dimension of units.`,
                    span,
                });
                return UNKNOWN;
            }
        }
        return { name: 'boolean' };
    }

    if (op === '^') {
        if (right.name !== 'number') {
            diagnostics.push({
                message: `The exponent of '^' must be a unitless number, but got ${valueTypeLabel(right)}: expected a number such as '2'.`,
                span: node.right.span,
            });
            return UNKNOWN;
        }
        if (left.name === 'number') return { name: 'number' };
        if (left.name === 'ValueWithUnits') {
            const exponent = integerLiteral(node.right);
            const units = unitsOf(left);
            if (exponent != null && units != null) return quantityWith(scaleUnits(units, exponent));
            return { name: 'ValueWithUnits' };
        }
        diagnostics.push({
            message: `Cannot raise ${valueTypeLabel(left)} to a power: expected a number or a quantity as the base of '^'.`,
            span: node.left.span,
        });
        return UNKNOWN;
    }

    if (op === '+' || op === '-' || op === '%') {
        if (left.name === 'number' && right.name === 'number') return { name: 'number' };
        if (left.name === 'ValueWithUnits' && right.name === 'ValueWithUnits') {
            if (!sameDimension(left.units, right.units)) {
                diagnostics.push({
                    message: `Operator '${op}' cannot combine '${left.units}' with '${right.units}': expected both operands to use the same dimension of units.`,
                    span,
                });
                return UNKNOWN;
            }
            return { name: 'ValueWithUnits', units: left.units ?? right.units };
        }
        // Geometric overloads (issue #21 context): Vector/Matrix support + and -.
        if ((op === '+' || op === '-') && left.name === right.name &&
            (left.name === 'Vector' || left.name === 'Matrix' || left.name === 'Transform')) {
            return left;
        }
        diagnostics.push({
            message: `Operator '${op}' cannot combine ${valueTypeLabel(left)} with ${valueTypeLabel(right)}: expected two numbers, or two quantities in the same units.`,
            span,
        });
        return UNKNOWN;
    }

    // '*' and '/'
    if (left.name === 'number' && right.name === 'number') return { name: 'number' };
    if (left.name === 'ValueWithUnits' && right.name === 'number') return left;
    if (left.name === 'number' && right.name === 'ValueWithUnits' && op === '*') return right;
    if (left.name === 'ValueWithUnits' && right.name === 'ValueWithUnits') {
        const lu = unitsOf(left);
        const ru = unitsOf(right);
        if (lu != null && ru != null) {
            const combined = combineUnits(lu, ru, op === '*' ? 1 : -1);
            const units = formatUnits(combined);
            return units != null ? { name: 'ValueWithUnits', units } : { name: 'number' };
        }
        return { name: 'ValueWithUnits' };
    }
    diagnostics.push({
        message: `Operator '${op}' cannot combine ${valueTypeLabel(left)} with ${valueTypeLabel(right)}: expected numbers and quantities.`,
        span,
    });
    return UNKNOWN;
}

function integerLiteral(node: MathExprNode): number | undefined {
    if (node.kind === 'number' && node.unit == null && Number.isInteger(node.value)) {
        return node.value;
    }
    if (node.kind === 'unary' && node.operator === '-') {
        const inner = integerLiteral(node.operand);
        return inner != null ? -inner : undefined;
    }
    return undefined;
}

function visitCall(node: CallNode, env: TypeEnvironment, diagnostics: MathDiagnostic[]): ValueType {
    const signature = FUNCTION_SIGNATURES[node.name];
    const argTypes = node.args.map((arg) => visit(arg, env, diagnostics));

    if (signature == null) {
        diagnostics.push({
            message: `Unknown function '${node.name}': expected one of ${Object.keys(FUNCTION_SIGNATURES).join(', ')}.`,
            span: node.span,
        });
        return UNKNOWN;
    }

    if (argTypes.length !== signature.params.length) {
        diagnostics.push({
            message: `Function '${node.name}' expects ${signature.params.length} argument(s) (${signature.label}), but got ${argTypes.length}: expected ${signature.label}.`,
            span: node.span,
        });
        return UNKNOWN;
    }

    for (let i = 0; i < argTypes.length; i++) {
        const expected = signature.params[i];
        const actual = argTypes[i];
        if (expected.name === 'unknown' || actual.name === 'unknown') continue;
        if (expected.name === 'array' && isArrayValueType(actual)) continue;
        if (expected.name !== actual.name) {
            diagnostics.push({
                message: wrongKindMessage(node.name, i, expected, actual, node.args[i].span),
                span: node.args[i].span,
            });
        } else if (
            expected.name === 'ValueWithUnits' &&
            expected.units != null && actual.units != null && !sameDimension(expected.units, actual.units)
        ) {
            diagnostics.push({
                message: `Argument ${i + 1} of '${node.name}' must be an angle quantity in '${expected.units}', but got '${actual.units}': expected an angle quantity such as '30 deg' or '30 rad'.`,
                span: node.args[i].span,
            });
        }
    }

    const extra = checkFunctionArgs(node.name, argTypes);
    if (extra != null) {
        diagnostics.push({ message: `In '${node.name}(...)': ${extra}.`, span: node.span });
    }

    return typeof signature.returns === 'function'
        ? signature.returns(argTypes)
        : signature.returns;
}

function wrongKindMessage(
    name: string,
    index: number,
    expected: ValueType,
    actual: ValueType,
    span: Span
): string {
    void span;
    if (expected.name === 'ValueWithUnits' && actual.name === 'number') {
        return `Argument ${index + 1} of '${name}' must be a quantity with units, but got a unitless number: expected a value with units such as '30 deg' or '30 rad' (a bare number is not accepted here).`;
    }
    return `Argument ${index + 1} of '${name}' must be ${valueTypeLabel(expected)}, but got ${valueTypeLabel(actual)}: expected ${valueTypeLabel(expected)}.`;
}

/**
 * Curated math function signatures (issue #21, scope item 3).
 *
 * Source: the scraped FeatureScript library
 * (`src/app/onshape/featurescript-library-organized.json`, `byName`), read
 * for each entry below, plus the curated type map in
 * `src/app/onshape/catalog/typemap.ts`. Scraped rows whose parameter types
 * are generic scraper junk (`value`, `x`, ...) are curated by hand here —
 * the same rule `typemap.ts` applies — and the decision is written down per
 * entry so it can be re-checked against the docs, not guessed.
 *
 * Scraped facts used:
 * - `sin`/`cos`/`tan`: `(value is ValueWithUnits) -> number` (angle in,
 *   unitless ratio out).
 * - `asin`/`acos`/`atan`: `(value is number) -> ValueWithUnits` (angle out,
 *   in radians).
 * - `atan2`: `(y is number, x is number) -> ValueWithUnits`.
 * - `sqrt`: `(value is ValueWithUnits) -> ValueWithUnits`.
 * - `cross`: `(Vector, Vector) -> Vector`; `dot`: `(Vector, Vector) ->`
 *   (empty return type in the scrape; the description says "dot product",
 *   curated here as `number`).
 * - `norm`: `(m is Matrix) -> number`; `normalize`: `(Vector) -> Vector`.
 * - `matrix`: `(value is array) -> Matrix`; `vector`: `(x, y, z) -> Vector`
 *   with untyped components, curated as numeric components.
 * - `log`/`exp`: `(value is number) -> number` (empty scraped return type,
 *   curated as `number` per their descriptions).
 * - `abs`, `floor`, `ceil`, `round`, `min`, `max` are scraped untyped
 *   generics. Curated semantics: `abs` preserves its operand type;
 *   `floor`/`ceil`/`round(value, multiple)` require `multiple` to match
 *   `value` and preserve `value`'s type; `min`/`max` require comparable
 *   same-kind arguments and preserve the argument type.
 *
 * UNIT-LESS TRIG DECISION (explicit, per the issue — not a guess):
 * `sin(30)` with a bare `number` is a TYPE ERROR. There is no silent
 * coercion of a unitless number to radians, because in CAD that silent
 * default is exactly how a degrees-vs-radians geometry bug ships; the
 * diagnostic tells the user to write `sin(30 deg)` or `sin(30 rad)`.
 * FeatureScript itself requires `ValueWithUnits` here, so strictness keeps
 * this checker aligned with what the emitter produces. The same rule
 * applies to `sqrt`: a bare number is rejected; write a quantity.
 */
import type { ValueType } from '../valuetypes';
import { sameDimension } from './units';

/** Argument/return type pattern for one function. */
export interface FunctionSignature {
    /** Expected argument types, in order. `unknown` accepts anything. */
    params: ValueType[];
    /** Return type, or a function of the argument types for generic functions. */
    returns: ValueType | ((args: ValueType[]) => ValueType);
    /** Human-readable signature for diagnostics, e.g. `sin(angle)`. */
    label: string;
}

const NUMBER: ValueType = { name: 'number' };
const QUANTITY: ValueType = { name: 'ValueWithUnits' };
const ANGLE: ValueType = { name: 'ValueWithUnits', units: 'radian' };
const VECTOR: ValueType = { name: 'Vector' };
const MATRIX: ValueType = { name: 'Matrix' };
const UNKNOWN: ValueType = { name: 'unknown' };

/** A numeric component: a bare number or a quantity. */
export const NUMERIC: ValueType = { name: 'unknown' };

function isNumeric(t: ValueType): boolean {
    return t.name === 'number' || t.name === 'ValueWithUnits' || t.name === 'unknown';
}

export const FUNCTION_SIGNATURES: Readonly<Record<string, FunctionSignature>> = {
    sin: { params: [ANGLE], returns: NUMBER, label: 'sin(angle)' },
    cos: { params: [ANGLE], returns: NUMBER, label: 'cos(angle)' },
    tan: { params: [ANGLE], returns: NUMBER, label: 'tan(angle)' },
    asin: { params: [NUMBER], returns: ANGLE, label: 'asin(number)' },
    acos: { params: [NUMBER], returns: ANGLE, label: 'acos(number)' },
    atan: { params: [NUMBER], returns: ANGLE, label: 'atan(number)' },
    atan2: { params: [NUMBER, NUMBER], returns: ANGLE, label: 'atan2(y, x)' },
    sqrt: { params: [QUANTITY], returns: QUANTITY, label: 'sqrt(value)' },
    cross: { params: [VECTOR, VECTOR], returns: VECTOR, label: 'cross(vector, vector)' },
    dot: { params: [VECTOR, VECTOR], returns: NUMBER, label: 'dot(vector, vector)' },
    norm: { params: [MATRIX], returns: NUMBER, label: 'norm(matrix)' },
    normalize: { params: [VECTOR], returns: VECTOR, label: 'normalize(vector)' },
    vector: {
        params: [NUMERIC, NUMERIC, NUMERIC],
        returns: VECTOR,
        label: 'vector(x, y, z)',
    },
    matrix: {
        params: [{ name: 'array', element: UNKNOWN }],
        returns: MATRIX,
        label: 'matrix(array)',
    },
    abs: { params: [UNKNOWN], returns: (args) => args[0] ?? UNKNOWN, label: 'abs(value)' },
    floor: {
        params: [UNKNOWN, UNKNOWN],
        returns: (args) => args[0] ?? UNKNOWN,
        label: 'floor(value, multiple)',
    },
    ceil: {
        params: [UNKNOWN, UNKNOWN],
        returns: (args) => args[0] ?? UNKNOWN,
        label: 'ceil(value, multiple)',
    },
    round: {
        params: [UNKNOWN, UNKNOWN],
        returns: (args) => args[0] ?? UNKNOWN,
        label: 'round(value, multiple)',
    },
    min: {
        params: [UNKNOWN, UNKNOWN],
        returns: (args) => args[0] ?? UNKNOWN,
        label: 'min(value1, value2)',
    },
    max: {
        params: [UNKNOWN, UNKNOWN],
        returns: (args) => args[0] ?? UNKNOWN,
        label: 'max(value1, value2)',
    },
    log: { params: [NUMBER], returns: NUMBER, label: 'log(number)' },
    exp: { params: [NUMBER], returns: NUMBER, label: 'exp(number)' },
};

export function isKnownFunction(name: string): boolean {
    return name in FUNCTION_SIGNATURES;
}

/** Builtin constants recognised as identifiers. */
export const BUILTIN_CONSTANTS: Readonly<Record<string, ValueType>> = {
    PI: NUMBER,
};

/** Extra per-function argument checks beyond the signature table. */
export function checkFunctionArgs(
    name: string,
    args: ValueType[]
): string | undefined {
    switch (name) {
        case 'vector':
            for (const arg of args) {
                if (!isNumeric(arg)) {
                    return 'each component of vector(...) must be a number or a quantity';
                }
            }
            return undefined;
        case 'floor':
        case 'ceil':
        case 'round':
        case 'min':
        case 'max': {
            const [a, b] = args;
            if (a != null && b != null && a.name !== 'unknown' && b.name !== 'unknown') {
                if (a.name !== b.name) {
                    return `both arguments of ${name}(...) must have the same kind, but got ${a.name} and ${b.name}`;
                }
                if (
                    a.name === 'ValueWithUnits' &&
                    !sameDimension(a.units, b.units)
                ) {
                    return `both arguments of ${name}(...) must use the same dimension of units, but got '${a.units}' and '${b.units}'`;
                }
            }
            return undefined;
        }
        default:
            return undefined;
    }
}

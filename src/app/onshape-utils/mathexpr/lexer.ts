/**
 * Lexer for the math expression language (issue #21).
 *
 * Unicode normalization is done by the lexer itself, one source character
 * at a time, so token spans always point into the ORIGINAL source:
 *
 *   `×` (U+00D7) and `·` (U+00B7)  -> `*`
 *   `−` (U+2212, U+2013, U+2014)    -> `-`
 *   `÷` (U+00F7)                    -> `/`
 *   `π` (U+03C0)                    -> identifier `PI`
 *   `√` (U+221A)                    -> `sqrt` prefix token
 *   `°` (U+00B0)                    -> unit suffix `deg`
 *
 * Numbers: decimal and exponent forms (`2`, `2.5`, `.5`, `1e3`, `1.5E-3`).
 * Identifiers: `[A-Za-z_][A-Za-z0-9_]*`, so `v_1` style names work.
 */
import { fail, Span } from './ast';

export type TokenKind =
    | 'number'
    | 'identifier'
    | 'operator'
    | 'punctuation'
    | 'sqrt'
    | 'eof';

export interface Token {
    kind: TokenKind;
    /** Normalized text (`*` for `×`, `PI` for `π`, ...). */
    text: string;
    /** Original source text for this token. */
    raw: string;
    span: Span;
}

const MULTIPLICATION_SIGNS = new Set(['×', '·', '⋅', '∙']);
const MINUS_SIGNS = new Set(['−', '–', '—']);
const WHITESPACE = new Set([' ', '\t', '\n', '\r', '\u00a0', '\u2009']);

function isDigit(ch: string): boolean {
    return ch >= '0' && ch <= '9';
}

function isIdentifierStart(ch: string): boolean {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
}

function isIdentifierPart(ch: string): boolean {
    return isIdentifierStart(ch) || isDigit(ch);
}

export function tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    const push = (kind: TokenKind, text: string, start: number, end: number) => {
        tokens.push({ kind, text, raw: source.slice(start, end), span: { start, end } });
    };

    while (i < source.length) {
        const ch = source[i];
        if (WHITESPACE.has(ch)) {
            i++;
            continue;
        }
        const start = i;

        // Unicode normalization (single source char -> single token).
        if (MULTIPLICATION_SIGNS.has(ch)) {
            push('operator', '*', start, start + 1);
            i++;
            continue;
        }
        if (MINUS_SIGNS.has(ch)) {
            push('operator', '-', start, start + 1);
            i++;
            continue;
        }
        if (ch === '÷') {
            push('operator', '/', start, start + 1);
            i++;
            continue;
        }
        if (ch === 'π') {
            push('identifier', 'PI', start, start + 1);
            i++;
            continue;
        }
        if (ch === '√') {
            push('sqrt', 'sqrt', start, start + 1);
            i++;
            continue;
        }
        if (ch === '°') {
            push('identifier', 'deg', start, start + 1);
            i++;
            continue;
        }

        // Number: digits, optional fraction, optional exponent.
        if (isDigit(ch) || (ch === '.' && isDigit(source[i + 1] ?? ''))) {
            let j = i;
            while (j < source.length && isDigit(source[j])) j++;
            if (source[j] === '.') {
                j++;
                while (j < source.length && isDigit(source[j])) j++;
            }
            if (source[j] === 'e' || source[j] === 'E') {
                let k = j + 1;
                if (source[k] === '+' || source[k] === '-') k++;
                if (k < source.length && isDigit(source[k])) {
                    j = k;
                    while (j < source.length && isDigit(source[j])) j++;
                }
            }
            push('number', source.slice(i, j), start, j);
            i = j;
            continue;
        }

        if (isIdentifierStart(ch)) {
            let j = i + 1;
            while (j < source.length && isIdentifierPart(source[j])) j++;
            push('identifier', source.slice(i, j), start, j);
            i = j;
            continue;
        }

        // Multi-character operators.
        const two = source.slice(i, i + 2);
        if (two === '==' || two === '!=' || two === '<=' || two === '>=') {
            push('operator', two, start, start + 2);
            i += 2;
            continue;
        }
        if ('+-*/%^~<>'.includes(ch)) {
            push('operator', ch, start, start + 1);
            i++;
            continue;
        }
        if ('()[],'.includes(ch)) {
            push('punctuation', ch, start, start + 1);
            i++;
            continue;
        }

        fail({ start, end: start + 1 }, `Unexpected character '${ch}': expected a number, an identifier, or an operator.`);
    }

    tokens.push({ kind: 'eof', text: '', raw: '', span: { start: source.length, end: source.length } });
    return tokens;
}

/** Human description of a token for diagnostics, e.g. `identifier 'x'`. */
export function describeToken(token: Token): string {
    switch (token.kind) {
        case 'eof':
            return 'the end of the expression';
        case 'number':
            return `number '${token.text}'`;
        case 'identifier':
            return `identifier '${token.text}'`;
        case 'operator':
            return `operator '${token.text}'`;
        case 'punctuation':
            return `'${token.text}'`;
        case 'sqrt':
            return `'√'`;
    }
}

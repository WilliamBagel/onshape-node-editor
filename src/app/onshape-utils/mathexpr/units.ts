/**
 * Unit suffixes (issue #21, scope item 2).
 *
 * Unit abbreviations exist in Onshape only inside feature *parameter*
 * expressions, where Onshape preprocesses `2 in` to `2 * inch`. We emit
 * FeatureScript *source*, so this module performs that expansion up front:
 * every key maps an accepted suffix (abbreviation or full name) to the
 * canonical FeatureScript unit identifier used by the emitter.
 *
 * Canonical names follow the repo's existing quantity model
 * (`onshape-types-utils/quantityutil.ts` TYPE_UNITS and `unitutil.ts`):
 * `millimeter`, `centimeter`, `meter`, `inch`, `foot`, `yard`, `degree`,
 * `radian`, `gram`, `kilogram`, `ounce`, `pound`, plus `second` /
 * `millisecond` for time and `kilometer` / `milligram` for completeness.
 */

export const UNIT_SUFFIX_TO_FEATURESCRIPT: Readonly<Record<string, string>> = {
    mm: 'millimeter',
    millimeter: 'millimeter',
    millimeters: 'millimeter',
    cm: 'centimeter',
    centimeter: 'centimeter',
    centimeters: 'centimeter',
    m: 'meter',
    meter: 'meter',
    meters: 'meter',
    km: 'kilometer',
    kilometer: 'kilometer',
    kilometers: 'kilometer',
    in: 'inch',
    inch: 'inch',
    inches: 'inch',
    ft: 'foot',
    foot: 'foot',
    feet: 'foot',
    yd: 'yard',
    yard: 'yard',
    yards: 'yard',
    deg: 'degree',
    degree: 'degree',
    degrees: 'degree',
    rad: 'radian',
    radian: 'radian',
    radians: 'radian',
    s: 'second',
    sec: 'second',
    second: 'second',
    seconds: 'second',
    ms: 'millisecond',
    millisecond: 'millisecond',
    milliseconds: 'millisecond',
    g: 'gram',
    gram: 'gram',
    grams: 'gram',
    kg: 'kilogram',
    kilogram: 'kilogram',
    kilograms: 'kilogram',
    mg: 'milligram',
    milligram: 'milligram',
    milligrams: 'milligram',
    lb: 'pound',
    pound: 'pound',
    pounds: 'pound',
    oz: 'ounce',
    ounce: 'ounce',
    ounces: 'ounce',
};

/** Canonical FeatureScript unit name for a suffix, or undefined if unknown. */
export function canonicalUnit(suffix: string): string | undefined {
    return UNIT_SUFFIX_TO_FEATURESCRIPT[suffix];
}

export function isUnitSuffix(suffix: string): boolean {
    return suffix in UNIT_SUFFIX_TO_FEATURESCRIPT;
}

function editDistance(a: string, b: string): number {
    const rows = a.length + 1;
    const cols = b.length + 1;
    const d: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
    for (let i = 0; i < rows; i++) d[i][0] = i;
    for (let j = 0; j < cols; j++) d[0][j] = j;
    for (let i = 1; i < rows; i++) {
        for (let j = 1; j < cols; j++) {
            d[i][j] = Math.min(
                d[i - 1][j] + 1,
                d[i][j - 1] + 1,
                d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
        }
    }
    return d[a.length][b.length];
}

/**
 * Closest known unit suffix to `suffix`, for "did you mean ...?" suggestions.
 * Returns undefined when nothing is close (edit distance > 2), so the
 * diagnostic does not suggest a wildly wrong unit.
 */
export function suggestUnit(suffix: string): string | undefined {
    let best: string | undefined;
    let bestDistance = Infinity;
    for (const candidate of Object.keys(UNIT_SUFFIX_TO_FEATURESCRIPT)) {
        const distance = editDistance(suffix, candidate);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = candidate;
        }
    }
    return bestDistance <= 2 ? best : undefined;
}

export const KNOWN_UNIT_SUFFIXES: readonly string[] = Object.keys(UNIT_SUFFIX_TO_FEATURESCRIPT);

/**
 * Base dimension of a canonical unit name. FeatureScript quantities are
 * comparable/convertible within a dimension: `3 * millimeter + 2 * inch`
 * is legal because both are lengths, while `3 * meter + 2 * second` is not.
 */
const UNIT_DIMENSION: Readonly<Record<string, string>> = {
    millimeter: 'length',
    centimeter: 'length',
    meter: 'length',
    kilometer: 'length',
    inch: 'length',
    foot: 'length',
    yard: 'length',
    degree: 'angle',
    radian: 'angle',
    gram: 'mass',
    kilogram: 'mass',
    milligram: 'mass',
    ounce: 'mass',
    pound: 'mass',
    second: 'time',
    millisecond: 'time',
};

/**
 * Dimension signature of a `ValueType.units` string such as
 * `meter^2` or `meter/second`: dimension name -> exponent. Returns
 * undefined when the units are unknown or not dimensioned quantities.
 */
export function dimensionOfUnits(units: string | undefined): Map<string, number> | undefined {
    if (units == null) return undefined;
    const result = new Map<string, number>();
    const [head, ...tail] = units.split('/');
    const parts: Array<[string, 1 | -1]> = [
        ...head.split('*').map((p): [string, 1 | -1] => [p, 1]),
        ...tail.flatMap((seg) => seg.split('*').map((p): [string, 1 | -1] => [p, -1])),
    ];
    for (const [part, sign] of parts) {
        if (part === '' || part === '1') continue;
        const [name, expText] = part.split('^');
        const dimension = UNIT_DIMENSION[name];
        if (dimension == null) return undefined;
        const exp = expText != null ? Number(expText) : 1;
        if (Number.isNaN(exp)) return undefined;
        result.set(dimension, (result.get(dimension) ?? 0) + sign * exp);
    }
    return result;
}

/** True when two unit strings share a dimension (or either is unknown). */
export function sameDimension(a: string | undefined, b: string | undefined): boolean {
    const da = dimensionOfUnits(a);
    const db = dimensionOfUnits(b);
    if (da == null || db == null) return true;
    if (da.size !== db.size) return false;
    for (const [dimension, exp] of da) {
        if (db.get(dimension) !== exp) return false;
    }
    return true;
}

/**
 * Curated utility-node ports (#11) over the scraped library.
 *
 * The scrape is not a typing source: overloads that share name+descriptor
 * collapse to the first occurrence (see spec-catalog.ts), and parameter
 * types are frequently scraper junk (`x`, `Description`, generic `array`).
 * That leaves the vector/matrix/transform family not node-able. The
 * `UTILITY_OVERRIDES` below replace the ports of the scraped entries with
 * the signatures verified against `featurescript-library.json`, keeping the
 * scraped category/file/description for auditing. `INSTANCE_ON_POINTS` has
 * no scraped entry — FeatureScript has no geometry-nodes instancing
 * concept — so it is registered as a synthetic catalog entry by
 * spec-catalog.ts.
 *
 * Signatures verified against the scraped library:
 * - vector(x,y,z) -> Vector; cross(vector1, vector2) -> Vector;
 *   normalize(vector) -> Vector; perpendicularVector(vec) -> Vector
 * - matrix(value array) -> Matrix; identityMatrix(size number) -> Matrix;
 *   diagonalMatrix(diagonalValues array) -> Matrix;
 *   rotationMatrix3d(axis Vector, angle ValueWithUnits) -> Matrix
 *   (the from/to overload is not this node's form)
 * - transform(linear Matrix, translation Vector) -> Transform
 * - opTransform(context, id, { bodies, transform })
 * - opPattern(context, id, { entities, transforms, instanceNames })
 */
import type { CatalogEntry, CatalogKind, CatalogPort } from './types';

export interface UtilityOverride {
    utilityId: string;
    /** Display title (overloads make the bare FS name ambiguous). */
    displayName: string;
    kind: CatalogKind;
    inputs: CatalogPort[];
    outputs: CatalogPort[];
    /** Expression template for value nodes; omitted means `fsName(args)`. */
    template?: string;
    /** One-line tooltip; always names the FeatureScript function mapped to. */
    tooltip: string;
}

const port = (
    name: string,
    valueType: CatalogPort['valueType'],
    description: string,
    defaultLiteral?: string,
    scrapedType?: string,
): CatalogPort => ({ name, valueType, scrapedType: scrapedType ?? valueType, description, defaultLiteral });

export const UTILITY_OVERRIDES: Readonly<Record<string, UtilityOverride>> = {
    'vector::': {
        utilityId: 'vector',
        displayName: 'vector',
        kind: 'value',
        inputs: [
            port('x', 'ValueWithUnits', 'X component (length).', '0 * mm', 'x'),
            port('y', 'ValueWithUnits', 'Y component (length).', '0 * mm', 'y'),
            port('z', 'ValueWithUnits', 'Z component (length).', '0 * mm', 'z'),
        ],
        outputs: [port('return', 'Vector', 'Constructed 3D vector.')],
        tooltip: 'Maps to FeatureScript vector(x, y, z) (Math/vector).',
    },
    'cross::': {
        utilityId: 'cross',
        displayName: 'cross',
        kind: 'value',
        inputs: [port('vector1', 'Vector', 'First vector.'), port('vector2', 'Vector', 'Second vector.')],
        outputs: [port('return', 'Vector', 'Cross product of vector1 and vector2.')],
        tooltip: 'Maps to FeatureScript cross(vector1, vector2) (Math/vector).',
    },
    'normalize::': {
        utilityId: 'normalize',
        displayName: 'normalize',
        kind: 'value',
        inputs: [port('vector', 'Vector', 'Vector to normalize (throws if zero-length).')],
        outputs: [port('return', 'Vector', 'Unitless normalized vector.')],
        tooltip: 'Maps to FeatureScript normalize(vector) (Math/vector).',
    },
    'perpendicularVector::': {
        utilityId: 'perpendicularVector',
        displayName: 'perpendicularVector',
        kind: 'value',
        inputs: [port('vec', 'Vector', 'Input vector.')],
        outputs: [port('return', 'Vector', 'A perpendicular vector (arbitrary but consistent choice).')],
        tooltip: 'Maps to FeatureScript perpendicularVector(vec) (Math/vector).',
    },
    'matrix::': {
        utilityId: 'matrix',
        displayName: 'matrix',
        kind: 'value',
        inputs: [port('value', 'array', 'Two-dimensional array cast to a matrix.', '[[1, 0, 0], [0, 1, 0], [0, 0, 1]]', 'array')],
        outputs: [port('return', 'Matrix', 'Matrix built from the array.')],
        tooltip: 'Maps to FeatureScript matrix(value) (Math/matrix).',
    },
    'identityMatrix::': {
        utilityId: 'identityMatrix',
        displayName: 'identityMatrix',
        kind: 'value',
        inputs: [port('size', 'number', 'Dimension of the identity matrix.', '3')],
        outputs: [port('return', 'Matrix', 'Identity matrix of the given dimension.')],
        tooltip: 'Maps to FeatureScript identityMatrix(size) (Math/matrix).',
    },
    'diagonalMatrix::': {
        utilityId: 'diagonalMatrix',
        displayName: 'diagonalMatrix',
        kind: 'value',
        inputs: [port('diagonalValues', 'array', 'Diagonal values; builds an n x n matrix.', '[1, 1, 1]', 'array')],
        outputs: [port('return', 'Matrix', 'Diagonal matrix.')],
        tooltip: 'Maps to FeatureScript diagonalMatrix(diagonalValues) (Math/matrix).',
    },
    'rotationMatrix3d::': {
        utilityId: 'rotationMatrix3d',
        displayName: 'rotationMatrix3d',
        kind: 'value',
        inputs: [
            port('axis', 'Vector', 'Rotation axis.'),
            port('angle', 'ValueWithUnits', 'Counterclockwise rotation angle about the axis.', '0 * radian'),
        ],
        outputs: [port('return', 'Matrix', '3D rotation matrix (axis-angle overload).')],
        tooltip:
            'Maps to FeatureScript rotationMatrix3d(axis, angle) (Math/vector, axis-angle overload; ' +
            'the from/to Vector overload is a different node form).',
    },
    'transform::': {
        utilityId: 'transform',
        displayName: 'transform',
        kind: 'value',
        inputs: [
            port('linear', 'Matrix', 'Rotation/scaling matrix.', 'identityMatrix(3)'),
            port('translation', 'Vector', 'Translation vector.', 'vector(0 * mm, 0 * mm, 0 * mm)'),
        ],
        outputs: [port('return', 'Transform', 'Constructed transform.')],
        tooltip: 'Maps to FeatureScript transform(linear, translation) (Math/transform).',
    },
    'opTransform::': {
        utilityId: 'opTransform',
        displayName: 'opTransform',
        kind: 'statement',
        inputs: [
            port('bodies', 'QueryList', 'Bodies to transform.', 'qNothing()', 'Query'),
            port('transform', 'Transform', 'The transform to apply.'),
        ],
        outputs: [port('context', 'Context', 'The context after the transform.')],
        tooltip: 'Maps to FeatureScript opTransform(context, id, { bodies, transform }) (Modeling/geomOperations).',
    },
};

/**
 * The "Instance on points" node. There is no geometry-nodes instancing in
 * FeatureScript: this node copies one body to every transform in an array
 * via opPattern (the opPattern/applyPattern pair). `instanceNames` must
 * have one entry per transform; `addInstance`/`Utilities/instantiator` is
 * not a substitute (it instantiates a whole part studio, not local bodies).
 */
export const INSTANCE_ON_POINTS: UtilityOverride = {
    utilityId: 'instanceOnPoints',
    displayName: 'Instance on points',
    kind: 'statement',
    inputs: [
        port('body', 'QueryList', 'Bodies to copy at each transform.', 'qNothing()', 'Query'),
        port('transforms', 'array', 'One Transform per copy; length = copy count.', '[identityTransform()]', 'array'),
        port('instanceNames', 'array', 'One distinct non-empty name per transform (must match transforms length).', '["instance0"]', 'array'),
    ],
    outputs: [port('context', 'Context', 'The context after patterning.')],
    tooltip:
        'Instance on points — NOT a Blender geometry-nodes analogue: FeatureScript has no instancing concept. ' +
        'Implemented via opPattern(context, id, { entities, transforms, instanceNames }) ' +
        '(Modeling/geomOperations); applyPattern is the split-out form.',
};

export const TRANSFORM_ARRAY: UtilityOverride = {
    utilityId: 'transformArray',
    displayName: 'Transform array',
    kind: 'value',
    inputs: [
        port('item0', 'Transform', 'First transform (identity when unconnected).', 'identityTransform()'),
        port('item1', 'Transform', 'Second transform (identity when unconnected).', 'identityTransform()'),
    ],
    outputs: [port('return', 'array', 'Array of the connected transforms.', undefined, 'array')],
    template: '[{item0}, {item1}]',
    tooltip: 'Builds an array of Transforms for opPattern — a FeatureScript array literal, not a library function.',
};

export const UTILITY_BY_ID: Readonly<Record<string, UtilityOverride>> = Object.fromEntries([
    ...Object.values(UTILITY_OVERRIDES),
    INSTANCE_ON_POINTS,
    TRANSFORM_ARRAY,
].map((o) => [o.utilityId, o]));

/** Synthetic catalog entry for `INSTANCE_ON_POINTS` (no scraped entry exists). */
export function instanceOnPointsEntry(): CatalogEntry {
    return {
        key: 'instanceOnPoints::utility',
        name: 'instanceOnPoints',
        category: 'Utility',
        file: 'instanceOnPoints',
        descriptor: 'utility',
        signature: 'opPattern(context, id, { entities, transforms, instanceNames })',
        description: INSTANCE_ON_POINTS.tooltip,
        kind: 'statement',
        nodeable: true,
        utilityId: 'instanceOnPoints',
        inputs: INSTANCE_ON_POINTS.inputs.map((p) => ({ ...p })),
        outputs: INSTANCE_ON_POINTS.outputs.map((p) => ({ ...p })),
    };
}

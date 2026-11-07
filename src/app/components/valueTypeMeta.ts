/**
 * Shared value-type metadata for the config panels (feature + group).
 *
 * The type *name* is always rendered in dark ink on a white chip/panel
 * background (contrast > 4.5:1 — see the TypePicker checks); the socket
 * colour is carried only by a small swatch/dot, never as low-contrast
 * coloured text.
 *
 * `objectValue` ordering matches the long-standing GroupConfigPanel list,
 * with `numberValueWithUnits` inserted so the longest label exercises the
 * picker's width handling.
 */
export const VALUE_TYPE_OPTIONS: readonly string[] = [
  'unknown',
  'numberValueWithUnits',
  'number',
  'ValueWithUnits',
  'boolean',
  'string',
  'Query',
  'Id',
  'Context',
  'Vector',
  'Matrix',
  'Transform',
  'CoordSystem',
  'map',
  'Enum',
  'array',
]

/** Socket data-colour per value type, from the --socket-* tokens (common.css). */
export const SOCKET_COLORS: Readonly<Record<string, string>> = {
  Query: 'var(--socket-query)',
  QueryList: 'var(--socket-query)',
  Id: 'var(--socket-id)',
  ValueWithUnits: 'var(--socket-quantity)',
  numberValueWithUnits: 'var(--socket-quantity)',
  Enum: 'var(--socket-enum)',
  Boolean: 'var(--socket-boolean)',
  boolean: 'var(--socket-boolean)',
  String: 'var(--socket-string)',
  string: 'var(--socket-string)',
  Vector: 'var(--socket-vector)',
  Matrix: 'var(--socket-matrix)',
  Transform: 'var(--socket-transform)',
  CoordSystem: 'var(--socket-coordsystem)',
  number: 'var(--socket-number)',
  map: 'var(--socket-map)',
  Context: 'var(--socket-context)',
}

export function socketColorFor(valueType: string | undefined): string {
  return SOCKET_COLORS[valueType ?? 'unknown'] ?? 'var(--socket-ink)'
}

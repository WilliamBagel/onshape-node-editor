export class StyleSettings {

    // Port fills are DATA ENCODING, not chrome: each value family keeps one
    // bright, distinguishable hue from the --socket-* tokens in
    // src/app/common.css (STYLE_GUIDE.md "Port colours: data-encoding
    // exception"), informed by the pre-#33 hues but tuned to read on the
    // white node surface. Brighter than the muted page tokens by design.
    private default: string = 'var(--socket-context)'

    private values: { [type: string]: string } = {
        "Context": "var(--socket-context)",
        "Id": "var(--socket-id)",
        "BTParameterSpecQuery-174": "var(--socket-query)",
        "BTParameterSpecEnum-171": "var(--socket-enum)",
        "BTParameterSpecQuantity-173": "var(--socket-quantity)",
        "BTParameterSpecString-170_Concat": "var(--socket-string)",
        "BTParameterSpecBoolean-170": "var(--socket-boolean)",
        "BTParameterSpecString-175": "var(--socket-string)",
        "QueryList": "var(--socket-query)",
        "Enum": "var(--socket-enum)",
        "ValueWithUnits": "var(--socket-quantity)",
        "Boolean": "var(--socket-boolean)",
        "String": "var(--socket-string)",
        // Value types from the typed-socket model (issue #9).
        "Vector": "var(--socket-vector)",
        "Matrix": "var(--socket-matrix)",
        "Transform": "var(--socket-transform)",
        "CoordSystem": "var(--socket-coordsystem)",
        "number": "var(--socket-number)",
        "boolean": "var(--socket-boolean)",
        "string": "var(--socket-string)",
        "Query": "var(--socket-query)",
        "map": "var(--socket-map)"
    }

    public getStyle(socket: string): string {
        return this.values[socket] ?? this.default;
    }
}

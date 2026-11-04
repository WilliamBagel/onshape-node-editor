export class StyleSettings {

    private default: string = 'var(--flow-teal)'

    private values: { [type: string]: string } = {
        "Context": "var(--flow-teal)",
        "Id": "var(--socket-ink)",
        "BTParameterSpecQuery-174": "var(--accent-steel)",
        "BTParameterSpecEnum-171": "var(--accent-steel)",
        "BTParameterSpecQuantity-173": "var(--flow-teal-soft)",
        "BTParameterSpecString-170_Concat": "var(--socket-ink)",
        "BTParameterSpecBoolean-170": "var(--accent-steel)",
        "BTParameterSpecString-175": "var(--socket-ink)",
        "QueryList": "var(--accent-steel)",
        "Enum": "var(--accent-steel)",
        "ValueWithUnits": "var(--flow-teal-soft)",
        "Boolean": "var(--accent-steel)",
        "String": "var(--socket-ink)",
        // Value types from the typed-socket model (issue #9), mapped onto the
        // canonical token palette from STYLE_GUIDE.md (issue #33).
        "Vector": "var(--flow-teal)",
        "Matrix": "var(--flow-teal-soft)",
        "Transform": "var(--accent-steel)",
        "CoordSystem": "var(--socket-ink)",
        "number": "var(--flow-teal-soft)",
        "boolean": "var(--accent-steel)",
        "string": "var(--socket-ink)",
        "Query": "var(--accent-steel)",
        "map": "var(--hairline-strong)"
    }

    public getStyle(socket: string): string {
        return this.values[socket] ?? this.default;
    }
}

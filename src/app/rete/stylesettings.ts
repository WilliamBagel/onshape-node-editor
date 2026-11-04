export class StyleSettings {

    private default: string = 'rgb(30, 110, 27)'

    private values: { [type: string]: string } = {
        "Context": "#4EC9B0",
        "Id": "#266356",
        "BTParameterSpecQuery-174": "#B2DDF6",
        "BTParameterSpecEnum-171": "#4FC1FF",
        "BTParameterSpecQuantity-173": "#B5CEA8",
        "BTParameterSpecString-170_Concat": "#718368",
        "BTParameterSpecBoolean-170": "#4e94ce",
        "BTParameterSpecString-175": "#CE9178",
        "QueryList": "#B2DDF6",
        "Enum": "#4FC1FF",
        "ValueWithUnits": "#B5CEA8",
        "Boolean": "#4e94ce",
        "String": "#CE9178",
        // Value types from the typed-socket model (issue #9). Muted, chosen
        // alongside the palette above — no new hues beyond the teal family.
        "Vector": "#2a8f82",
        "Matrix": "#a08c5b",
        "Transform": "#4a6b7c",
        "CoordSystem": "#6b7c4a",
        "number": "#9db38f",
        "boolean": "#4e94ce",
        "string": "#CE9178",
        "Query": "#B2DDF6",
        "map": "#8c8c86"
    }

    public getStyle(socket: string): string {
        return this.values[socket] ?? this.default;
    }
}
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
        "String": "#CE9178"
    }

    public getStyle(socket: string): string {
        return this.values[socket] ?? this.default;
    }
}
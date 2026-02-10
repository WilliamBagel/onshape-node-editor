export class StyleSettings {

    private default: string = 'rgb(30, 110, 27)'

    private values: { [type: string]: string } = {
        "context": "rgb(79, 182, 70)",
        "BTParameterSpecQuery-174": "#B2DDF6",
        "BTParameterSpecEnum-171": "rgb(218, 123, 255)",
        "BTParameterSpecQuantity-173": "rgb(252, 199, 25)",
        "BTParameterSpecBoolean-170": "white"
    }

    public getStyle(socket: string): string {
        return this.values[socket] ?? this.default;
    }
}
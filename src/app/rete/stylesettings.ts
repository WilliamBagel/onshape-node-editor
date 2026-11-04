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
        "String": "var(--socket-ink)"
    }

    public getStyle(socket: string): string {
        return this.values[socket] ?? this.default;
    }
}
import { ClassicPreset } from "rete";

export class OnshapeInputControl<T> extends ClassicPreset.Control {
    private btType: string;
    public visible: boolean = true;
    private currentValue: any;

    constructor(btType: string) {
        super();
        this.btType = btType;
    }

    /**
     * Method for visual, vue, components to access the current value
     * @returns 
     */
    public getCurrentValue(): T {
        return this.currentValue;
    }

    /**
     * Should be only be called by data representation of nodes
     * @param value 
     */
    public setValue(value: T): void {
        this.currentValue = value;
    }
}


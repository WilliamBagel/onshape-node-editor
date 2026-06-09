import { ClassicPreset } from "rete";
import { OnshapeType } from "../../onshape-utils/featurescripttypes";

export class OnshapeInputControl<T extends OnshapeType<any>> extends ClassicPreset.Control {
    private _type: string;
    private _spec: T;
    public visible: boolean = true;
    private currentValue: any;

    constructor(type: string, spec: T, public readonly label: string = "label") {
        super();
        this._type = type;
        this._spec = spec;

        this.currentValue = spec.value;
    }

    /**
     * Method for visual, vue, components to access the current value
     * @returns 
     */
    public getCurrentValue(): T["value"] {
        return this.currentValue;
    }

    /**
     * Should be only be called by data representation of nodes
     * @param value 
     */
    public setValue(value: T["value"]): void {
        this.currentValue = value;
    }

    public getHasError(): boolean {
        return false;
    }

    /**
     * Get information about the type
     */

    public getSpec(): T {
        return this._spec;
    }

    public get type(): string {
        return this._type;
    }
}


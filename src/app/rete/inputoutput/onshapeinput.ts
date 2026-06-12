import { ClassicPreset } from "rete";
import { OnshapeInputControl } from "../controls/onshapeinputcontrol";
import { OnshapeOutput } from "./onshapeoutput";
import { OnshapeSelectionType, OnshapeType } from "../../onshape-utils/featurescripttypes";

export class OnshapeInput<T extends OnshapeType<any>> extends ClassicPreset.Input<ClassicPreset.Socket> {
    public connections: OnshapeOutput[] = [];
    private _type: string;
    declare public control: OnshapeInputControl<any>;
    public showControl: boolean = true;
    public showLabel: boolean = true;
    public connectedValue: string | null = null;

    // expanded for map types
    public expanded: boolean = true;

    constructor(socket: ClassicPreset.Socket, label: string, type: string, spec?: T) {
        super(socket, label);

        // Store parameter spec info
        if (type === 'map') {
            // const control = new OnshapeInputControl<T>(this.type, { value: "NaM" } as T);
            // this.addControl(control);
        } else if (type === 'QueryList') {
            // create a control with type selection
            const selectionSpec = Object.assign({}, spec) as OnshapeSelectionType;
            selectionSpec.type = "Selection";
            selectionSpec.value = [
                {
                selectionID: 'JHF',
                entityType: "",
                occurencePath: [],
                selectionType: "",
                workspaceMicroversionId: ""
            }
        ];
            const control = new OnshapeInputControl<OnshapeSelectionType>(selectionSpec.type, selectionSpec, label);
            this.addControl(control);
        } else {
            console.log(type);
            const control = new OnshapeInputControl<T>(type, spec || { type: "none", value: "none" } as T, label);
            this.addControl(control);
        }

        this._type = type;
    }

    public isConnected(): boolean {
        return this.connections?.length > 0;
    }

    public get type(): string {
        return this._type;
    }

    public addConnection(output: OnshapeOutput): void {
        if (!(output instanceof OnshapeOutput)) {
            return;
        }
        this.connections.push(output);
    }

    public removeConnection(output: OnshapeOutput): void {
        this.connections = this.connections.filter((elem) => elem !== output);
    }
}

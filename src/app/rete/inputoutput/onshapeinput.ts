import { BTParameterSpec6 } from "onshape-typescript-fetch";
import { ClassicPreset } from "rete";
import { OnshapeInputControl } from "../controls/onshapeinputcontrol";
import { OnshapeOutput } from "./onshapeoutput";
import { BTParameterInfo } from "../../onshape-utils/extended-types";



export class OnshapeInput extends ClassicPreset.Input<ClassicPreset.Socket> {
    private parameterSpec: BTParameterSpec6
    public parameterInfo: BTParameterInfo;
    public connections: OnshapeOutput[] = [];

    constructor(socket: ClassicPreset.Socket, parameterSpec: BTParameterSpec6) {
        super(socket, parameterSpec.parameterName);
        this.parameterSpec = parameterSpec;
        this.parameterInfo = JSON.parse(JSON.stringify(parameterSpec));
        this.parameterInfo.currentValue = this.parameterInfo.defaultValue.value;

        const control = new OnshapeInputControl(parameterSpec.btType);
        control.setValue({ ...parameterSpec.defaultValue });
        this.addControl(control);
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
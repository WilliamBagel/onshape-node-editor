import { BTParameterSpec6 } from "onshape-typescript-fetch";
import { ClassicPreset } from "rete";

export class OnshapeOutput extends ClassicPreset.Output<ClassicPreset.Socket> {
    private _btType: string

    constructor(socket: ClassicPreset.Socket, btType: string) {
        super(socket, btType);
        this._btType = btType;
    }
    public get btType(){
        return this._btType;
    }
}
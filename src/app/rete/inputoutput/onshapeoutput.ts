import { ClassicPreset } from "rete";

export class OnshapeOutput extends ClassicPreset.Output<ClassicPreset.Socket> {
    private _type: string

    constructor(socket: ClassicPreset.Socket, type: string) {
        super(socket, socket.name);
        this._type = type;
    }
    public get type(){
        return this._type;
    }
    /** Re-label the output in place (math return-type changes keep object identity). */
    public setType(type: string): void {
        this._type = type;
    }
}
import { ClassicPreset } from "rete";
import { DataflowNode } from "rete-engine";
import { OnshapeOutput } from "../inputoutput/onshapeoutput";
import { OnshapeInput } from "../inputoutput/onshapeinput";

export class OnshapeNode extends ClassicPreset.Node implements DataflowNode {
  public type: string

  public width: number = 220;
  public height: number = 150;
  public minWidth: number = 180;
  public maxWidth: number = 600;

  public nodeUpdateCounter: number = 0;

  public updateCallback: () => void = () => { };
  public updateComponent: () => void = () => { };

  constructor(type: string) {
    super("");
    this.type = type;
  }
  public data(inputs: Record<string, any>): Promise<Record<string, any>> | Record<string, any> {
    return {
      output: "generic node"
    }
  }
  public resizeX(dx: number) {
    this.width = Math.max(this.width + dx, this.minWidth);
  }
  public update() {
    this.updateCallback();
    this.updateComponent();
  }

  public sendComponentUpdate() {
    this.updateComponent();
  }

  public addConnection(thisIO: OnshapeOutput | OnshapeInput, connectedIO: OnshapeOutput | OnshapeInput): void {
    let object = this.outputs;
    let input = false;
    if (thisIO instanceof OnshapeInput) {
      object = this.inputs;
      input = true;
    }
    if (this.validateOwnership(object, thisIO) === false) {
      return;
    }

    if (input) {
      (thisIO as OnshapeInput).addConnection(connectedIO as OnshapeOutput);
    }
  }

  public removeConnection(thisIO: OnshapeOutput | OnshapeInput, connectedIO: OnshapeOutput | OnshapeInput): void {
    let object = this.outputs;
    let input = false;
    if (thisIO instanceof OnshapeInput) {
      object = this.inputs;
      input = true;
    }
    if (this.validateOwnership(object, thisIO) === false) {
      return;
    }

    if (input) {
      (thisIO as OnshapeInput).removeConnection(connectedIO as OnshapeOutput);
    }
  }

  private validateOwnership(array, thisIO: OnshapeOutput | OnshapeInput): boolean {
    let input = false;
    if (thisIO instanceof OnshapeInput) {
      input = true;
    }
    const foundIO = Object.values(array).find((elem) => elem === thisIO);
    if (foundIO == null) {
      console.warn(`Connection ${input ? "target" : "source"} ${thisIO} is not a member of this node's ${input ? "inputs" : "outputs"}`);
      return false;
    }
    return true;
  }
}
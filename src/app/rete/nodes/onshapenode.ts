import { ClassicPreset } from "rete";
import { DataflowNode } from "rete-engine";
import { OnshapeOutput } from "../inputoutput/onshapeoutput";
import { BTMParameter1 } from "onshape-typescript-fetch";
import { OnshapeInput } from "../inputoutput/onshapeinput";
import { AreaPlugin } from "rete-area-plugin";
import { AreaExtra, Schemes } from "../types";
import { NodeFeaturescriptInfo } from "../../onshape-utils/featurestudiogenerator";

export interface BTMParameter1_Valued extends BTMParameter1 {
  value: string | number | boolean;
}

export interface EngineNodeData {
  code: {
    before: string[];
    after: string[];
    whitespace: number;
  },
  source: string;
}

export interface VariablePointer {
  name: string;
  id: string;
}

export class OnshapeNode extends ClassicPreset.Node implements DataflowNode {
  protected title: string = 'node';

  public type: string

  public width: number = 220;
  public height: number = 150;
  public minWidth: number = 180;
  public maxWidth: number = 600;

  public nodeUpdateCounter: number = 0;

  public updateCallback: () => void = () => { };
  public updateComponent: () => void = () => { };

  // protected configuredParameters: { [parameterId: string]: BTMParameter1_Valued } = {};
  // protected connectedParameters: { [parameterId: string]: boolean } = {};
  public hiddenParameters: { [parameterId: string]: boolean } = {};

  constructor(type: string, title?: string) {
    super("");
    this.type = type;
    if (title != null) {
      this.title = title;
    }
  }

  /**
   * Get the variable symbols that this node creates, intended to be overridden by parent classes if applicable
   * ie. A define feature node creates context, id, definition
   */
  public getVariableSymbols(): string[] {
    return [];
  }

  /**
   * Returns the variable pointers this node outputs
   * @param inputs the outputs from the parent nodes' data that go to this nodes' inputs
   * @returns 
   */
  public data(inputs: Record<string, any>): Promise<Record<string, any>> | Record<string, any> {
    console.log(inputs);
    const data: Record<string, VariablePointer> = {};
    const variableSymbols = this.getVariableSymbols();
    for (const key in this.outputs) {
      if (variableSymbols.indexOf(key) !== -1) {
        // the variable is created by this node
        data[key] = { id: this.id, name: key }
      } else if (inputs[key]) {
        // pass through
        // 0 index because rete bundles all inputs with same name into an array (even if there is only 1)
        data[key] = inputs[key][0];
      } else {
        console.warn(`Could not find source for variable ${key}`);
      }
    }
    console.log(data);
    return data;
  }

  public getFeatureScriptInfo(variableMapping: Record<string, string>): NodeFeaturescriptInfo {
    return {
      line: "generic node"
    }
  }

  public getTitle(): string {
    return this.title;
  }

  setTitle(newTitle: any) {
    this.title = newTitle;
  }

  public resizeX(dx: number) {
    this.width = Math.max(this.width + dx, this.minWidth);
  }
  public update() {
    this.updateCallback();
    this.updateComponent();
  }

  public updateParameter(parameterId: string, value: any): void { }

  public updateVisibilities(): void { }

  public sendComponentUpdate() {
    this.updateComponent();
  }

  public addConnection(thisIO: OnshapeOutput | OnshapeInput<any>, connectedIO: OnshapeOutput | OnshapeInput<any>): void {
    let object: any = this.outputs;
    let input = false;
    if (thisIO instanceof OnshapeInput) {
      object = this.inputs;
      input = true;
    }
    if (this.validateOwnership(object, thisIO) === false) {
      return;
    }

    if (input) {
      (thisIO as OnshapeInput<any>).addConnection(connectedIO as OnshapeOutput);
    }
  }

  public removeConnection(thisIO: OnshapeOutput | OnshapeInput<any>, connectedIO: OnshapeOutput | OnshapeInput<any>): void {
    let object: any = this.outputs;
    let input = false;
    if (thisIO instanceof OnshapeInput) {
      object = this.inputs;
      input = true;
    }
    if (this.validateOwnership(object, thisIO) === false) {
      return;
    }

    if (input) {
      (thisIO as OnshapeInput<any>).removeConnection(connectedIO as OnshapeOutput);
    }
  }

  private validateOwnership(
    array: { [x: string]: ClassicPreset.Output<ClassicPreset.Socket> | undefined; },
    thisIO: OnshapeOutput | OnshapeInput<any>
  ): boolean {
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

  public area!: AreaPlugin<Schemes, AreaExtra>
  declare public inputs: { [key: string]: OnshapeInput<any> };
  declare public outputs: { [key: string]: OnshapeOutput };
}
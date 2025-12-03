import { ClassicPreset } from "rete";
import { DataflowNode } from "rete-engine";

export class OnshapeNode extends ClassicPreset.Node implements DataflowNode {
  public type: string

  public width: number = 200;
  public height: number = 150;
  public minWidth: number = 180;
  public maxWidth: number = 600;

  public updateCallback: () => void = () => { };

  constructor(type: string) {
    super("");
    this.type = type;
  }
  data(inputs: Record<string, any>): Promise<Record<string, any>> | Record<string, any> {
    return {
      output: "generic node"
    }
  }
  resizeX(dx: number) {
    this.width = Math.max(this.width + dx, this.minWidth);
  }
  update() {
    this.updateCallback();
  }
}
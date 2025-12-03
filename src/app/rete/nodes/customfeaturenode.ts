import { OnshapeNode } from './onshapenode';

export class CustomFeatureNode extends OnshapeNode {
  constructor(subtype: string) {
    super("CustomFeature");
    this.subtype = subtype;
  }
  subtype?: string;
}

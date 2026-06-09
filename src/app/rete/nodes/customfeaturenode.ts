import { BTFeatureSpec129, BTMParameter1 } from 'onshape-typescript-fetch';
import { OnshapeNode, VariablePointer } from './onshapenode';
import { OnshapeInput } from '../inputoutput/onshapeinput';
import { OnshapeFeatureSpecInput } from '../inputoutput/onshapefeaturespecinput';
import { OnshapeOutput } from '../inputoutput/onshapeoutput';
import { OnshapeSocket } from '../onshapesockets';
import { ContextType } from '../../onshape-utils/featurescripttypes';
import { NodeFeaturescriptInfo } from '../../onshape-utils/featurestudiogenerator';
import { STD } from '../../onshape-utils/stdlib';

export class CustomFeatureNode extends OnshapeNode {
  private featureSpec: BTFeatureSpec129;
  private definitionInput!: OnshapeFeatureSpecInput;

  constructor(featureSpec: BTFeatureSpec129) {
    super("CustomFeature");
    this.featureSpec = featureSpec;

    this.addDefaultArguments();
    this.addDefinition();
    this.addDefaultOutputs();
  }

  public getTitle(): string {
    return this.featureSpec?.featureTypeName || "Untitled";
  }

  private addDefaultArguments(): void {
    // Context argument
    const contextInput = new OnshapeInput<ContextType>(
      new OnshapeSocket('Context'),
      "Context",
      "Context",
      { type: "Context", value: "Context" }
    );
    this.addInput("context", contextInput);

    // Id argument
    const idInput = new OnshapeInput(
      new OnshapeSocket('Id'),
      "Id",
      "Id",
      { type: "Context", value: "_0" }
    );
    this.addInput("id", idInput);
  }

  private addDefinition(): void {
    // Definition map input with feature spec parameters
    this.definitionInput = new OnshapeFeatureSpecInput(
      new OnshapeSocket('map'),
      this.featureSpec
    );

    // Set update callback to trigger component updates
    this.definitionInput.setUpdateCallback(() => {
      this.update();
    });

    this.addInput("definition", this.definitionInput);

    // Also register the parameters as proper inputs on the node
    // This allows ReteJS to find them when making connections
    for (const paramId in this.definitionInput.paramInputs) {
      this.addInput(paramId, this.definitionInput.paramInputs[paramId]);
      // Hide parameters from the main input list since they're displayed in the map
      this.hiddenParameters[paramId] = true;
    }
  }

  // private _selected: boolean;
  // public get selected(): boolean{
  //   return this._selected;
  // }

  // public set selected(value: boolean) {
  //   console.log("selected set to ", value);
  //   if(value === false){
  //     console.trace();
  //   }
  //   this._selected = value;
  // }

  private addDefaultOutputs(): void {
    const outputContext = new OnshapeOutput(new OnshapeSocket("Context"), "Context");
    this.addOutput("context", outputContext);
  }

  public getDefinitionInput(): OnshapeFeatureSpecInput {
    return this.definitionInput;
  }

  public updateParameter(parameterId: string, value: any): void {
    this.definitionInput.updateParameter(parameterId, value as any);
  }

  public addConnection(thisIO: OnshapeOutput | OnshapeInput<any>, connectedIO: OnshapeOutput | OnshapeInput<any>): void {
    super.addConnection(thisIO, connectedIO);
    // Update visibilities when a connection is added to a nested parameter
    this.definitionInput.updateVisibilities();
  }

  public removeConnection(thisIO: OnshapeOutput | OnshapeInput<any>, connectedIO: OnshapeOutput | OnshapeInput<any>): void {
    super.removeConnection(thisIO, connectedIO);
    // Update visibilities when a connection is removed from a nested parameter
    this.definitionInput.updateVisibilities();
  }

  // public data(inputs: Record<string, any>): Record<string, any> {
  //   return {
  //     name: this.featureSpec.featureTypeName || 'CustomFeature',
  //     id: this.id
  //   };
  // }

  public getDependencies(): Array<{ path: string, version: string }> {
    const dependencies: Array<{ path: string, version: string }> = [];
    const namespace = this.featureSpec.namespace;
    if (namespace != null) {
      const element_microversion = namespace.split('::');
      if (element_microversion.length === 2) {
        const element = element_microversion[0].slice(1);
        const microversion = element_microversion[1].slice(1);
        // TODO fix this
        // assume custom feature is in std
        dependencies.push({ path: [STD.DOCUMENT_ID, STD.VERSION_ID, element].join('/'), version: microversion });
      }
    }
    return dependencies;
  }

  public getFeaturescript(variableMapping: Record<string, string>): string {
    const context = variableMapping['context'] || 'context';
    const id = variableMapping['id'] || 'id';
    return `${this.featureSpec.featureType}(${context}, ${id}, ${this.definitionInput.getFeaturescript()});`;
  }

  public getFeatureScriptInfo(variableMapping: Record<string, string>): NodeFeaturescriptInfo {
    return {
      line: this.getFeaturescript(variableMapping),
      postindent: 0,
      dependencies: this.getDependencies()
    };
  }
}
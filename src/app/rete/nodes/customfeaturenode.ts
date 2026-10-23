import { BTFeatureSpec129, BTMParameter1 } from 'onshape-typescript-fetch';
import { OnshapeNode, VariablePointer } from './onshapenode';
import { OnshapeInput } from '../inputoutput/onshapeinput';
import { OnshapeFeatureSpecInput } from '../inputoutput/onshapefeaturespecinput';
import { OnshapeOutput } from '../inputoutput/onshapeoutput';
import { OnshapeSocket } from '../onshapesockets';
import { ContextType } from '../../onshape-utils/featurescripttypes';
import { NodeFeaturescriptInfo } from '../../onshape-utils/featurestudiogenerator';
import { STD } from '../../onshape-utils/stdlib';
import { OnshapeInputControl } from '../controls/onshapeinputcontrol';
import type {
  SerializedCustomFeatureNode,
  SerializedNodeBase,
  SerializedParameterValue,
  SpecResolver,
} from '../serialization/graph-schema-types';
import { toFeatureSpecReference } from '../serialization/graph-schema-types';


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

  private addDefaultOutputs(): void {
    const outputContext = new OnshapeOutput(new OnshapeSocket("Context"), "Context");
    this.addOutput("context", outputContext);
  }

  public getDefinitionInput(): OnshapeFeatureSpecInput {
    return this.definitionInput;
  }

  /**
   * Serialize this node: base fields + a reference to the feature spec + the
   * current value of every parameter control.
   *
   * Parameter values are read from `OnshapeInputControl.getCurrentValue()`, not
   * from the node, because the control is where the value actually lives; the
   * node's `configuredParameters` copy is a mirror kept in sync by
   * `updateParameter`.
   */
  public toJSON(): SerializedCustomFeatureNode {
    return {
      ...(super.toJSON() as SerializedNodeBase),
      kind: "CustomFeature",
      spec: toFeatureSpecReference(this.featureSpec),
      parameters: this.serializeParameters(),
    };
  }

  private serializeParameters(): Record<string, SerializedParameterValue> {
    const parameters: Record<string, SerializedParameterValue> = {};
    for (const paramId in this.definitionInput.paramInputs) {
      const paramInput = this.definitionInput.paramInputs[paramId];
      const control = paramInput?.control;
      if (!(control instanceof OnshapeInputControl)) {
        continue;
      }
      // DR-001: a captured selection is invalidated by the next document edit,
      // so it is never written to a saved graph. QueryList values round-trip as
      // an empty list (which regenerates as qUnion([])).
      const value = control.type === "QueryList" ? [] : control.getCurrentValue();
      parameters[paramId] = { type: control.type, value };
    }
    return parameters;
  }

  /**
   * Rebuild a node from its serialized form. The spec reference is resolved
   * through `resolveSpec` so the spec body never has to live in the graph file.
   */
  public static fromJSON(data: SerializedCustomFeatureNode, resolveSpec: SpecResolver): CustomFeatureNode {
    const featureSpec = resolveSpec(data.spec);
    if (featureSpec == null) {
      throw new Error(
        `Could not resolve feature spec "${data.spec.featureType}" ` +
        `(eid=${data.spec.eid ?? "unknown"}, microversion=${data.spec.microversion ?? "unknown"}) for node ${data.id}.`
      );
    }

    const node = new CustomFeatureNode(featureSpec);
    node.applySerializedBase(data);

    for (const [paramId, parameter] of Object.entries(data.parameters ?? {})) {
      node.updateParameter(paramId, parameter.value);
    }

    return node;
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

  public getTopLevelVariables(): { [symbol: string]: string } {
    return this.definitionInput.getTopLevelVariables();
  }

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
    return `${this.featureSpec.featureType}(${context}, ${id}, ${this.definitionInput.getFeaturescript(variableMapping)});`;
  }

  public getFeatureScriptInfo(variableMapping: Record<string, string>): NodeFeaturescriptInfo {
    return {
      line: this.getFeaturescript(variableMapping),
      postindent: 0,
      dependencies: this.getDependencies()
    };
  }
}
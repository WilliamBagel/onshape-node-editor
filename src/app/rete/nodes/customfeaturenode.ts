import { BTFeatureSpec129, BTMParameter1, BTParameterSpec6, BTParameterVisibilityCondition177, BTParameterVisibilityLogical178, BTParameterVisibilityOnEqual180 } from 'onshape-typescript-fetch';
import { OnshapeNode } from './onshapenode';
import { ClassicPreset } from 'rete';
import { OnshapeInput } from '../inputoutput/onshapeinput';
import { OnshapeOutput } from '../inputoutput/onshapeoutput';
import { OnshapeInputControl } from '../controls/onshapeinputcontrol';
import { OnshapeSocket } from '../onshapesockets';

interface BTMParameter1_Valued extends BTMParameter1 {
  value: string | number | boolean;
}

export class CustomFeatureNode extends OnshapeNode {
  private featureSpec: BTFeatureSpec129;
  private configuredParameters: { [parameterId: string]: BTMParameter1_Valued } = {};
  private connectedParameters: { [parameterId: string]: boolean } = {};

  public hiddenParameters: { [parameterId: string]: boolean } = {};

  constructor(featureSpec: BTFeatureSpec129) {
    super("CustomFeature");
    this.featureSpec = featureSpec;

    this.loadParameters();
    this.addOutput('context', new OnshapeOutput(new OnshapeSocket('context'), 'Context'));
    this.updateVisibilities();
  }

  public getTitle(): string {
    return this.featureSpec.featureTypeName;
  }

  private loadParameters(): void {
    const parameters = this.featureSpec.parameters;
    if (parameters == null) { return; }
    for (const param of parameters) {
      const type = param.btType;
      const id = param.parameterId;
      const input = new OnshapeInput(new OnshapeSocket(type), param);
      this.addInput(id, input);
      this.configuredParameters[id] = { ...param.defaultValue as BTMParameter1_Valued };
    }
  }

  public updateParameter(parameterId: string, value: BTMParameter1_Valued): void {
    const configuredParam = this.configuredParameters[parameterId];
    if (configuredParam == null) {
      console.warn(`Could not find parameter ${parameterId}`);
      return;
    }
    this.configuredParameters[parameterId] = value;
    const input = this.inputs[parameterId];
    if (input == null) { console.warn(`Could not find input with parameterId ${parameterId}`); }
    (input.control as OnshapeInputControl<any>)?.setValue(value);
    this.updateVisibilities();
  }

  public updateVisibilities(): void {
    let updateRequired: boolean = false;
    const parameters = this.featureSpec.parameters;
    for (const param of parameters) {
      const input = this.inputs[param.parameterId];
      const lastShowControl = input.showControl;

      if (!(input instanceof OnshapeInput)) {
        console.error(`Input must by instance of OnshapeInput, input: ${input}`);
        return;
      }

      const connected = input.connections?.length > 0;
      this.connectedParameters[param.parameterId] = connected;
      input.showControl = true;

      if (input instanceof OnshapeInput && input.connections?.length > 0) {
        // means that there is a connection
        this.hiddenParameters[param.parameterId] = false;
        input.showControl = false;
        updateRequired = true;
        continue;
      }
      if (lastShowControl === false) {
        // happens when a connection is removed
        updateRequired = true;
      }

      // update visiblity from visibility condition
      const updatedVisibility = this.updateParameterVisibility(param) !== false;
      const lastVisibility = this.hiddenParameters[param.parameterId] !== true;
      if (updatedVisibility != null && lastVisibility !== updatedVisibility) {
        this.hiddenParameters[param.parameterId] = !updatedVisibility;
        updateRequired = true;
      }
      // const lastVisibility = this.hiddenParameters[param.parameterId] !== true;
      // if (updatedVisibility != null && lastVisibility !== updatedVisibility) {
      //   this.hiddenParameters[param.parameterId] = !updatedVisibility;
      //   updateRequired = true;
      // }
    }
    if (updateRequired) {
      this.update();
    }
  }

  private updateParameterVisibility(parameter: BTParameterSpec6): boolean | null {
    const visibilityCondition = parameter.visibilityCondition;
    if (visibilityCondition == null) {
      return;
    }
    return this.evaluateVisibilityCondition(visibilityCondition);
  }

  private evaluateVisibilityCondition(condition: BTParameterVisibilityCondition177): boolean | null {
    const btType = condition.btType;
    if (btType === 'BTParameterVisibilityLogical-178') {
      const logical = condition as BTParameterVisibilityLogical178
      const operation = logical.operation;
      if (!(logical?.children?.length > 0)) {
        return;
      }
      // get values
      let values: boolean[] = [];
      for (const child of logical.children) {
        const value = this.evaluateVisibilityCondition(child);
        if (value == null) {
          continue;
        }
        values.push(value)
      }
      // check null
      if(values.length === 0){
        return;
      }
      // operate on values
      if (operation === 'AND') {
        let value = true;
        for (const val of values) {
          value = value && val;
        }
        return value;
      } else if (operation === 'OR') {
        let value = false;
        for (const val of values) {
          value = value || val;
        }
        return value;
      } else if (operation === 'NOT') {
        return !values[0];
      } else if (operation === 'UNKNOWN') {
        console.warn(`visibilityCondition ${JSON.stringify(condition)} has operation ${operation}`);
      }
    } else if (btType === 'BTParameterVisibilityOnEqual-180') {
      const onEqual = condition as BTParameterVisibilityOnEqual180;
      const inArray = onEqual.inArray;
      if (inArray === true) {
        console.warn('inArray === true not implemented');
        return;
      } else if (inArray === false) {
        const parameterId = onEqual.parameterId;
        const valueEquals = onEqual.value;
        const parameter = this.configuredParameters[parameterId];
        if (parameterId == null) {
          console.warn(`parameter '${parameterId}' could not be found for visibilityCondition ${JSON.stringify(onEqual)}`);
          return;
        }
        if (this.connectedParameters[parameterId] === true) {
          // if the referenced parameter has a connection, any conditions that rely on it should be discounted
          return;
        }
        return parameter.value === valueEquals;
      }
    }
  }
}
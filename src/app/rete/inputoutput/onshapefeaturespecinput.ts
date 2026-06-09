import { BTFeatureSpec129, BTMParameterQuantity147, BTParameterSpec6, BTParameterSpecEnum171, BTParameterSpecQuantity173, BTParameterVisibilityCondition177, BTParameterVisibilityLogical178, BTParameterVisibilityOnEqual180 } from 'onshape-typescript-fetch';
import { ClassicPreset } from 'rete';
import { OnshapeInput } from './onshapeinput';
import { OnshapeSocket } from '../onshapesockets';
import { BooleanType, EnumType, OnshapeType, QueryList, QueryListType, ValueWithUnits, ValueWithUnitsType } from '../../onshape-utils/featurescripttypes';
import { evaluateVisibilityCondition, getSpecFromFeatureSpec } from '../../onshape-utils/bttypetools';

export class OnshapeFeatureSpecInput extends OnshapeInput<any> {
    private featureSpec: BTFeatureSpec129;
    public paramInputs: { [parameterId: string]: OnshapeInput<any> } = {};
    public configuredParameters: { [parameterId: string]: OnshapeType } = {};
    public connectedParameters: { [parameterId: string]: boolean } = {};
    public hiddenParameters: { [parameterId: string]: boolean } = {};
    private updateCallback: () => void = () => { };

    constructor(socket: ClassicPreset.Socket, featureSpec: BTFeatureSpec129) {
        // Initialize as a map input without parameterSpec so it doesn't create default control
        super(socket, 'Definition', 'map');

        this.featureSpec = featureSpec;

        this.loadParameters();
        this.updateVisibilities();
    }

    private loadParameters(): void {
        const parameters = this.featureSpec.parameters;
        if (parameters == null) return;

        for (const param of parameters) {
            if (param.btType == null || param.parameterName == null || param.parameterId == null) {
                console.warn("Parameter is missing a btType or parameterName or parameterId", param);
                continue;
            }


            const paramId = param.parameterId;
            const spec = getSpecFromFeatureSpec(param);

            const paramInput = new OnshapeInput(
                new OnshapeSocket(param.btType),
                param.parameterName,
                spec.type,
                spec,
            );
            this.paramInputs[paramId] = paramInput;
            this.configuredParameters[paramId] = spec;

            if (spec.type === 'QueryList') {
                paramInput.showLabel = false;
            }
        }
        console.log(this);
    }

    public setUpdateCallback(callback: () => void): void {
        this.updateCallback = callback;
    }

    public updateParameter(parameterId: string, value: any): void {
        const configuredParam = this.configuredParameters[parameterId];
        if (configuredParam == null) {
            console.warn(`Could not find parameter ${parameterId}`);
            return;
        }
        this.configuredParameters[parameterId].value = value;

        // Find the child param input and update its control
        const paramInput = this.paramInputs[parameterId]
        if (paramInput) {
            (paramInput.control as any)?.setValue(value);
        }

        this.updateVisibilities();
    }

    /**
     * Updates visibilities of parameters in precedence:
     * 1. Connected parameters are always shown
     * 2. Parameters are shown based on visibility conditions
     * 3. Connected parameter dependencies are ignored in eval
     */
    public updateVisibilities(): void {
        let updateRequired = false;
        const parameters = this.featureSpec.parameters;

        if (parameters == null) { return; }

        for (const param of parameters) {
            if (param.btType == null || param.parameterName == null || param.parameterId == null) {
                console.warn("Parameter is missing a btType or parameterName or parameterId", param);
                continue;
            }

            const paramInput = this.paramInputs[param.parameterId]
            if (!paramInput) continue;

            const lastShowControl = paramInput.showControl;

            const connected = paramInput.connections?.length > 0;
            this.connectedParameters[param.parameterId] = connected;
            paramInput.showControl = true;

            // Connected parameters hide their control but stay visible
            if (connected) {
                this.hiddenParameters[param.parameterId] = false;
                paramInput.showControl = false;
                updateRequired = true;
                continue;
            }

            if (lastShowControl === false) {
                updateRequired = true;
            }

            // Update visibility from visibility condition
            const updatedVisibility = this.updateParameterVisibility(param) !== false;
            const lastVisibility = this.hiddenParameters[param.parameterId] !== true;
            if (updatedVisibility != null && lastVisibility !== updatedVisibility) {
                this.hiddenParameters[param.parameterId] = !updatedVisibility;
                updateRequired = true;
            }
        }

        if (updateRequired) {
            this.updateCallback();
        }
    }

    private updateParameterVisibility(parameter: BTParameterSpec6): boolean | null {
        const visibilityCondition = parameter.visibilityCondition;
        if (visibilityCondition == null) {
            return null;
        }
        return evaluateVisibilityCondition(visibilityCondition, this.configuredParameters, this.connectedParameters);
    }



    private getSpecFeaturescript(spec: OnshapeType<any>): string {
        if (spec.type === "ValueWithUnits") {
            const value: ValueWithUnits = spec.value;
            return `${value.value} * ${value.units}`;
        } else if (spec.type === "Enum") {
            const enumSpec: EnumType = spec as EnumType;
            return `${enumSpec.enumName}.${enumSpec.value}`;
        } else if (spec.type === "Boolean") {
            return spec.value;
        } else if (spec.type === "QueryList") {
            const querySpec = spec as QueryListType;
            return JSON.stringify(querySpec.value.queries);
        }
        return "undefined";
    }


    public getFeaturescript(): string {
        const parameterValues: { [key: string]: string } = {};

        for (const paramId in this.paramInputs) {
            if (this.hiddenParameters[paramId] === true) {
                continue;
            }

            const paramInput = this.paramInputs[paramId];
            if (!paramInput) continue;

            const connectedValue = (paramInput as any).connectedValue;

            if (connectedValue != null) {
                parameterValues[paramId] = connectedValue;
            } else {
                const control = (paramInput as any).control;
                if (control != null) {
                    parameterValues[paramId] = control.getCurrentValue?.() || '';
                }
            }
        }

        return [
            `{`,
            Object.entries(this.configuredParameters)
                .map(([key, value]) => {
                    const val = this.getSpecFeaturescript(value);

                    return `"${key}": ${val}`;
                })
                .join(',\n\t'),
            '}'
        ].join('\n');
    }
}

import { BTFeatureSpec129, BTMParameterQuantity147, BTParameterSpec6, BTParameterSpecEnum171, BTParameterSpecQuantity173, BTParameterVisibilityCondition177, BTParameterVisibilityLogical178, BTParameterVisibilityOnEqual180 } from 'onshape-typescript-fetch';
import { ClassicPreset } from 'rete';
import { OnshapeInput } from './onshapeinput';
import { OnshapeSocket } from '../onshapesockets';
import { BooleanType, EnumType, TransientSelection, TransientSelectionType, OnshapeType, QueryList, QueryListType, ValueWithUnits, ValueWithUnitsType } from '../../onshape-utils/featurescripttypes';
import { evaluateVisibilityCondition, getSpecFromFeatureSpec } from '../../onshape-utils/bttypetools';
import { OnshapeInputControl } from '../controls/onshapeinputcontrol';

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

            const connected = paramInput.isConnected();
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
            const value = spec.value as ValueWithUnits;
            return `${value.value} * ${value.units}`;
        } else if (spec.type === "Enum") {
            const enumSpec = spec as EnumType;
            return `${enumSpec.enumName}.${enumSpec.value}`;
        } else if (spec.type === "Boolean") {
            return spec.value;
        } else if (spec.type === "QueryList") {
            const querySpec = spec as TransientSelectionType;
            console.log(spec);
            return `qUnion([])`;
        }
        return "undefined";
    }

    public getTopLevelVariables(): { [symbol: string]: string } {
        const tLVs: { [symbol: string]: string } = {};
        for (const paramId in this.paramInputs) {
            const paramInput = this.paramInputs[paramId];
            if (!paramInput) { continue; };
            const control = (paramInput as any).control as OnshapeInputControl<any>;
            if (control == null) {
                continue;
            }
            const type = control.type;
            if (type === "QueryList") {
                const selections = (control as OnshapeInputControl<TransientSelectionType>).getCurrentValue();
                if (selections.length === 0) {
                    continue;
                }
                const featurescript = `qUnion([${selections.map((selection) => {
                    return `makeRobustQuery(context, qTransient('${selection.selectionId}'))`;
                }).join(', ')}])`;
                tLVs[paramId] = featurescript;
            }

        }
        return tLVs;
    }

    public getFeaturescript(variableMapping: Record<string, string>): string {
        const parameterValues: { [key: string]: string } = {};

        for (const paramId in this.paramInputs) {
            if (this.hiddenParameters[paramId] === true) {
                continue;
            }

            const paramInput = this.paramInputs[paramId];
            if (!paramInput) { continue; };

            const referencedValue = variableMapping[paramId];

            if (referencedValue != null) {
                parameterValues[paramId] = referencedValue;
            } else {
                // this is not ideal, but need to get the spec to get correct featurescript
                const control = (paramInput as any).control as OnshapeInputControl<any>;
                if (control != null) {
                    const value = control.getCurrentValue?.();
                    const parameterInfo = Object.assign({}, control.getSpec()) as OnshapeType<any>;
                    parameterInfo.value = value;
                    parameterValues[paramId] = value != null ? this.getSpecFeaturescript(parameterInfo) : '';
                }
            }
        }

        return [
            `{`,
            Object.entries(parameterValues)
                .map(([key, value]) => {
                    return `"${key}": ${value}`;
                })
                .join(',\n\t'),
            '}'
        ].join('\n');
    }
}

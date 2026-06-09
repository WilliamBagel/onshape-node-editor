import { BTParameterSpec6, BTParameterSpecEnum171, BTParameterSpecQuantity173, BTParameterVisibilityCondition177, BTParameterVisibilityLogical178, BTParameterVisibilityOnEqual180, BTMParameterQuantity147, BTParameterSpecQuery174, BTMParameterQueryList148 } from 'onshape-typescript-fetch';
import { BooleanType, EnumType, OnshapeType, QueryListType, ValueWithUnitsType } from './featurescripttypes';

export function evaluateVisibilityCondition(
    condition: BTParameterVisibilityCondition177,
    configuredParameters: { [parameterId: string]: OnshapeType },
    connectedParameters: { [parameterId: string]: boolean }
): boolean | null {
    const btType = condition.btType;
    if (btType === 'BTParameterVisibilityLogical-178') {
        const logical = condition as BTParameterVisibilityLogical178;
        const operation = logical.operation;
        const length = logical.children?.length;
        if (logical.children == null || length == null || length === 0) {
            return null;
        }

        let values: boolean[] = [];
        for (const child of logical.children) {
            const value = evaluateVisibilityCondition(child, configuredParameters, connectedParameters);
            if (value == null) {
                continue;
            }
            values.push(value);
        }

        if (values.length === 0) {
            return null;
        }

        if (operation === 'AND') {
            return values.every(v => v);
        } else if (operation === 'OR') {
            return values.some(v => v);
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
            return null;
        } else if (inArray === false) {

            if (onEqual.parameterId == null) {
                console.warn("Parameter is missing a btType or parameterName or parameterId", onEqual);
                return null;
            }

            const parameterId = onEqual.parameterId;
            const valueEquals = onEqual.value;
            const parameter = configuredParameters[parameterId];

            if (parameterId == null) {
                console.warn(`parameter '${parameterId}' could not be found for visibilityCondition ${JSON.stringify(onEqual)}`);
                return null;
            }

            if (connectedParameters[parameterId] === true) {
                // if the referenced parameter has a connection, conditions depending on it are discounted
                return null;
            }

            return parameter?.value === valueEquals;
        }
    }

    return null;
}

export function getSpecFromFeatureSpec(parameterSpec: BTParameterSpec6): OnshapeType<any> {
    if (parameterSpec.btType === 'BTParameterSpecQuantity-173') {
        const quantitySpec: BTParameterSpecQuantity173 = parameterSpec;
        const value = quantitySpec.defaultValue as BTMParameterQuantity147;
        return {
            type: "ValueWithUnits",
            value: {
                value: value.value,
                units: value.units
            },
            ranges: quantitySpec.ranges
        } as ValueWithUnitsType;
    } else if (parameterSpec.btType === 'BTParameterSpecEnum-171') {
        const enumSpec: BTParameterSpecEnum171 = parameterSpec
        return {
            type: "Enum",
            value: (parameterSpec.defaultValue as OnshapeType).value,
            options: enumSpec.options,
            optionNames: enumSpec.optionNames,
            enumName: enumSpec.enumName,
            optionIconUris: enumSpec.optionIconUris
        } as EnumType;
    } else if (parameterSpec.btType === 'BTParameterSpecBoolean-170') {
        return {
            type: "Boolean",
            value: (parameterSpec.defaultValue as any).value as boolean
        } as BooleanType;
    } else if (parameterSpec.btType === 'BTParameterSpecQuery-174') {
        const querySpec: BTParameterSpecQuery174 = parameterSpec;
        const value = querySpec.defaultValue as BTMParameterQueryList148;
        return {
            type: 'QueryList',
            value: {
                type: 'Query',
                nodeId: value.nodeId,
                queries: value.queries,
            },
            label: querySpec.parameterName
        } as QueryListType
    }
    console.warn("Could not convert parameterSpec: ", parameterSpec)
    return parameterSpec as OnshapeType;
}

export function btTypeToFeaturescriptType(btType: string): string {
    if (btType === 'BTParameterSpecQuantity-173') {
        return "ValueWithUnits";
    } else if (btType === 'BTParameterSpecEnum-171') {
        return "enum";
    } else if (btType === 'BTParameterSpecBoolean-170') {
        return "boolean";
    } else if (btType === 'BTParameterSpecQuery-174') {
        return "query";
    }
    return "string";
}
import { BTParameterSpec6, BTParameterSpecEnum171, BTParameterSpecQuantity173, BTParameterVisibilityCondition177, BTParameterVisibilityLogical178, BTParameterVisibilityOnEqual180, BTMParameterQuantity147, BTParameterSpecQuery174, BTMParameterQueryList148 } from 'onshape-typescript-fetch';
import { BooleanType, EnumType, OnshapeType, ParameterArrayItem, ParameterArrayType, QueryListType, ValueWithUnitsType } from './featurescripttypes';
import { valueTypeFromBTParameterSpec } from './valuetypes';

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
            // Kept as a warning (issue #26, deferred with reason): an
            // in-array condition compares against one *item's* member
            // value, so it needs a per-item evaluation context that the
            // top-level visibility pass does not have — configuredParameters
            // holds a single value per parameterId, not one per item, and
            // connected array items are not discounted item-by-item either.
            // Returning null means "cannot decide here": the parameter
            // stays visible rather than being wrongly hidden.
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
    } else if (parameterSpec.btType === 'BTParameterSpecArray-2600') {
        // `BTParameterSpecArray-2600`: the member specs are the spec's own
        // `parameters` array on the wire (not declared on the typed client
        // interface, hence the record view), and the default is a
        // `BTMParameterArray-2025` whose items each carry `parameters`
        // (`BTMParameter1[]`) keyed by the member `parameterId`.
        const raw: Record<string, any> = parameterSpec as Record<string, any>;
        const memberSpecs: BTParameterSpec6[] = Array.isArray(raw.parameters) ? raw.parameters : [];
        const elements = memberSpecs.map((member) => {
            const element = getSpecFromFeatureSpec(member) as Record<string, any>;
            // Converted specs drop ids/names; carry them on the element so
            // the control and codegen can key items by member parameterId.
            element.parameterId = (member as Record<string, any>).parameterId;
            element.label = (member as Record<string, any>).parameterName ?? element.label;
            if ((member as Record<string, any>).maxNumberOfPicks !== undefined) {
                element.maxNumberOfPicks = (member as Record<string, any>).maxNumberOfPicks;
            }
            return element as OnshapeType<any>;
        });
        const defaultValue: Record<string, any> | undefined = raw.defaultValue;
        const rawItems: Array<Record<string, any>> = Array.isArray(defaultValue?.items) ? defaultValue.items : [];
        const items: ParameterArrayItem[] = rawItems.map((rawItem) => {
            const item: ParameterArrayItem = {};
            const rawParams: Array<Record<string, any>> = Array.isArray(rawItem.parameters) ? rawItem.parameters : [];
            for (const [index, member] of memberSpecs.entries()) {
                const memberId = (member as Record<string, any>).parameterId as string | undefined;
                const btm = rawParams.find((p) => p.parameterId === memberId) ?? rawParams[index];
                item[memberId ?? `member${index}`] = arrayItemValueFromBTM(elements[index], btm);
            }
            return item;
        });
        return {
            type: "ParameterArray",
            value: items,
            element: elements[0] ?? null,
            elements,
            itemName: raw.itemName,
            itemLabelTemplate: raw.itemLabelTemplate,
            maxNumberOfPicks: raw.maxNumberOfPicks,
            showLabelsOnly: raw.showLabelsOnly,
            drivenQuery: raw.drivenQuery,
            label: parameterSpec.parameterName,
        } as unknown as ParameterArrayType;
    }
    console.warn("Could not convert parameterSpec: ", parameterSpec)
    return parameterSpec as OnshapeType;
}

/**
 * Raw item value for one array member, from its `BTMParameter1` default.
 * Query members are stored as a transient-selection list (the form
 * `QueryListControl` edits), not as the spec's `BTMParameterQueryList`
 * query strings — those are not live selections.
 */
function arrayItemValueFromBTM(element: OnshapeType<any> | undefined, btm: Record<string, any> | undefined): unknown {
    if (element == null) return null;
    if (element.type === 'QueryList') return [];
    if (btm == null) return structuredClone(element.value);
    if (element.type === 'ValueWithUnits') {
        return { value: btm.value, units: btm.units ?? (element as ValueWithUnitsType).units };
    }
    if (element.type === 'ParameterArray') {
        const rawItems: Array<Record<string, any>> = Array.isArray(btm.items) ? btm.items : [];
        const memberElements = (element as ParameterArrayType).elements ?? [];
        return rawItems.map((rawItem) => {
            const item: ParameterArrayItem = {};
            const rawParams: Array<Record<string, any>> = Array.isArray(rawItem.parameters) ? rawItem.parameters : [];
            for (const [index, memberElement] of memberElements.entries()) {
                void index;
                const btmParam = rawParams[index];
                item[btmParam?.parameterId ?? `member${index}`] = arrayItemValueFromBTM(memberElement, btmParam);
            }
            return item;
        });
    }
    // Enum / Boolean / String / Id / Context: the BTM value is the raw value.
    return btm.value !== undefined ? btm.value : structuredClone(element.value);
}

export function btTypeToFeaturescriptType(
    btType: string | { btType?: string } & Record<string, any>
): string {
    // Delegates to the typed value model (issue #9) so the BT mapping lives
    // in exactly one place; outputs are unchanged from the previous table.
    // #26: an array spec maps to `array` (or `array<element>` when the
    // member spec is known) instead of falling through to "string".
    const spec = typeof btType === "string" ? { btType } : btType;
    const name = valueTypeFromBTParameterSpec(spec).name;
    if (name === "ValueWithUnits") return "ValueWithUnits";
    if (name === "Enum") return "enum";
    if (name === "boolean") return "boolean";
    if (name === "Query") return "Query";
    if (name === "array") {
        const element = valueTypeFromBTParameterSpec(spec).element;
        return element != null && element.name !== "unknown" ? `array<${element.name}>` : "array";
    }
    return "string";
}
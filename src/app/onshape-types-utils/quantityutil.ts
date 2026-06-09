import { BTMParameterQuantity147, BTParameterSpecQuantity173 } from "onshape-typescript-fetch";
import { UnitUtil } from "./unitutil";
import { ValueWithUnits, ValueWithUnitsType } from "../onshape-utils/featurescripttypes";

const TYPE_UNITS: { [quantityType: string]: Array<string> } = {
    'LENGTH': [
        'centimeter',
        'foot',
        'inch',
        'meter',
        'milimeter',
        'yard',
    ],
    'ANGLE': [
        'degree',
        'radian'
    ],
    'MASS': [
        'gram',
        'kilogram',
        'ounce',
        'pound'
    ]
}

export class QuantityUtil {

    public static getText(value: ValueWithUnits): string {
        const units = UnitUtil.shorten(value.units);
        return value.value + ' ' + units;
    }

    public static getValue(text: string): ValueWithUnits | undefined {
        if (text === '') {
            return undefined;
        }
        const re = /([0-9]+\.?[0-9]*)\s*(\w+)/gi;
        const match = re.exec(text);
        if (match == null || match?.length !== 3) {
            return undefined;
        }
        const value = match[1];
        const abr = match[2];
        if (abr) {
            const number = Number(value);
            const units = UnitUtil.extend(abr);
            if (units != null && !isNaN(number)) {
                return {
                    type: 'ValueWithUnits',
                    units,
                    value: number
                };
            }
        }
        return undefined;
    }

    public static validate(value: BTMParameterQuantity147, parameterSpec: BTParameterSpecQuantity173): boolean {
        if (parameterSpec.quantityType == null) {
            console.warn("BTParameterSpecQuantity173 missing property 'quantityType'", parameterSpec);
            return false;
        }
        if (value.units == null) {
            console.warn("BTMParameterQuantity147 missing property 'units'", value);
            return false;
        }
        const validUnitsForType = TYPE_UNITS[parameterSpec.quantityType];
        if (validUnitsForType == null) {
            console.error(`Invalid quantity type encountered, ${parameterSpec.quantityType} cannot be found in Quantity Types: ${QuantityUtil.getValidTypes()}`);
            return false;
        }
        const units = validUnitsForType.indexOf(value.units);
        return units == null;
    }
    public static getValidTypes(): string[] {
        return Object.keys(TYPE_UNITS);
    }
}
const UNITS_ABBREVIATE = {
    'centimeter': 'cm',
    'foot': 'ft',
    'inch': 'in',
    'meter': 'm',
    'milimeter': 'mm',
    'yard': 'yd',
    'degree': 'deg',
    'radian': 'rad',
    'gram': 'g',
    'kilogram': 'kg',
    'ounce': 'oz',
    'pound': 'lb',
}

const ABBREVIATE_UNITS = Object.keys(UNITS_ABBREVIATE).reduce((ret, key) => {
    ret[UNITS_ABBREVIATE[key]] = key;
    return ret;
}, {});

export class UnitUtil {
    public static shorten(units: string) {
        const abr = UNITS_ABBREVIATE[units];
        if (abr == null) {
            return undefined;
        }
        return abr;
    }
    public static extend(abr: string) {
        const unit = ABBREVIATE_UNITS[abr];
        if(unit == null){
            // could have already been a unit
            if(UNITS_ABBREVIATE[abr]){
                return abr;
            }
            return undefined;
        }
        return unit;
    }
}
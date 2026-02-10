import { BTMParameter1, BTParameterSpec6 } from "onshape-typescript-fetch";

interface p_BTMParameter1 extends BTMParameter1 {
    value: 'string';
}

export interface BTParameterInfo extends BTParameterSpec6 {
    currentValue: 'string';
    defaultValue: p_BTMParameter1;
}
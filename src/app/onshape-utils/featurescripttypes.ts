import { BTQuantityRange181, BTQueryFilter183 } from "onshape-typescript-fetch";

export interface Annotation {
    type: "Name" | "Feature Type Name" | "Feature Type Description" | "Property Function Name" | "Table Type Name";
    value: string;
}

export interface OnshapeType<V = string> {
    type: string;
    value: V;
    label?: string;
}

export interface BooleanType extends OnshapeType<boolean> {
    type: "Boolean";
}

export interface EnumType extends OnshapeType {
    type: "Enum";
    enumName?: string;
    options: string[];
    optionNames: string[];
    optionIconUris: string[];
}

export interface StringType extends OnshapeType {
    type: "String";
}

export interface IdType extends OnshapeType {
    type: "Id";
}

export interface ContextType extends OnshapeType {
    type: "Context";
}

export interface ValueWithUnits {
    value: number;
    units: string;
}

export interface ValueWithUnitsType extends OnshapeType<ValueWithUnits> {
    type: "ValueWithUnits";
    value: ValueWithUnits;
    ranges?: Array<BTQuantityRange181>;
    units: string;
}

export interface QueryList {
    type: "Query",
    nodeId: string;
    queries: string[];
}

export interface QueryListType extends OnshapeType<QueryList> {
    type: "QueryList",
    value: QueryList,
    filter?: BTQueryFilter183,
    selectFilter?: string[];
}

const obj = {
    "btType": "BTParameterSpecQuery-174",
    "columnName": "",
    "defaultValue": {
        "btType": "BTMParameterQueryList-148",
        "nodeId": "Mxz0id6kBZO+9jRYi",
        "parameterId": "entities",
        "queries": []
    },
    "iconUri": "",
    "parameterDescription": "",
    "parameterId": "entities",
    "parameterName": "Entities to chamfer",
    "uiHint": "",
    "uiHints": [],
    "additionalBoxSelectFilter": {
        "btType": "BTEntityTypeFilter-124",
        "entityType": "EDGE"
    },
    "filter": {
        "btType": "BTAndFilter-110",
        "operand1": {
            "btType": "BTAndFilter-110",
            "operand1": {
                "btType": "BTAndFilter-110",
                "operand1": {
                    "btType": "BTOrFilter-167",
                    "operand1": {
                        "btType": "BTAndFilter-110",
                        "operand1": {
                            "btType": "BTActiveSheetMetalFilter-2944",
                            "isFromActiveSheetMetal": false
                        },
                        "operand2": {
                            "btType": "BTOrFilter-167",
                            "operand1": {
                                "btType": "BTAndFilter-110",
                                "operand1": {
                                    "btType": "BTEntityTypeFilter-124",
                                    "entityType": "EDGE"
                                },
                                "operand2": {
                                    "btType": "BTEdgeTopologyFilter-122",
                                    "edgeTopology": "TWO_SIDED",
                                    "isInternalEdge": true
                                }
                            },
                            "operand2": {
                                "btType": "BTEntityTypeFilter-124",
                                "entityType": "FACE"
                            }
                        }
                    },
                    "operand2": {
                        "btType": "BTAndFilter-110",
                        "operand1": {
                            "btType": "BTEntityTypeFilter-124",
                            "entityType": "EDGE"
                        },
                        "operand2": {
                            "btType": "BTSMDefinitionEntityTypeFilter-1651",
                            "smDefinitionEntityType": "VERTEX"
                        }
                    }
                },
                "operand2": {
                    "btType": "BTConstructionObjectFilter-113",
                    "isConstruction": false
                }
            },
            "operand2": {
                "btType": "BTSketchObjectFilter-184",
                "isSketchObject": false,
                "objectType": "NOT_SKETCH_OBJECT"
            }
        },
        "operand2": {
            "btType": "BTModifiableEntityOnlyFilter-1593",
            "modifiableOnly": true
        }
    },
    "maxNumberOfPicks": -1
}
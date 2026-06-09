import { ClassicPreset } from 'rete';

import { CustomFeatureNode } from './nodes/customfeaturenode';
import { inject } from 'vue';
import { editorBase } from './editorbase';
import { OutputFeatureNode } from './nodes/outputfeaturenode';
import { DefineFeatureNode } from './nodes/definefeaturenode';

const socket = new ClassicPreset.Socket('socket');

export async function createEditor(container: HTMLElement) {
  const app = inject('app');
  if (app == null) {
    console.error('app could not be found');
  }

  const { editor, area, buildStudio } = await editorBase(container);
  
    const chamferNode = new CustomFeatureNode(ChamferFeatureSpec);
  
    await editor.addNode(chamferNode);
  
    const chamferNode2 = new CustomFeatureNode(ChamferFeatureSpec);
    console.log(chamferNode2);
  
    await editor.addNode(chamferNode2);
  
    const featureDefinition = new DefineFeatureNode({
      annotation: {
        type: 'Feature Type Name',
        value: "My New Feature"
      },
      preconditions: [
        {
          annotation: {
            type: 'Property Function Name',
            value: 'my parameter'
          },
          btType: 'BTParameterSpecString-175'
        },
        {
          annotation: {
            type: 'Property Function Name',
            value: 'do the thing'
          },
          btType: 'BTParameterSpecBoolean-170'
        },
        {
          annotation: {
            type: 'Property Function Name',
            value: 'a thing'
          },
          btType: "BTParameterSpecQuantity-173"
        }
      ]
    });
  
    await editor.addNode(featureDefinition);
  
    const featureEndNode = new OutputFeatureNode();
  
    await editor.addNode(featureEndNode);
  
    area.translate(featureDefinition.id, { x: 0, y: 50 });
    area.translate(chamferNode.id, { x: 300, y: 50 });
    area.translate(chamferNode2.id, { x: 600, y: 50 });
    area.translate(featureEndNode.id, { x: 900, y: 50 });
  
  
    (window as unknown as any)['editor'] = editor;
  
    setTimeout(async () => {
      const featureStudioCode = await buildStudio();
      console.log(featureStudioCode);
    }, 10000)

  // await editor.addConnection(new Connection(a, 'a', a.inputs['a'].socket.name, b, 'a', b.inputs['a'].socket.name, new StyleSettings()));

  return {
    destroy: () => area.destroy(),
  };
}

var ChamferFeatureSpec: any = {
  "btType": "BTFeatureSpec-129",
  "descriptionImageUri": "",
  "featureNameTemplate": "",
  "featureType": "chamfer",
  "featureTypeDescription": "",
  "featureTypeName": "Chamfer",
  "filterSelectors": [
    "allparts"
  ],
  "groups": [],
  "iconUri": "",
  "languageVersion": 2770,
  "linkedLocationName": "",
  "manipulatorChangeFunction": "",
  "namespace": "e6e648f0784c53a069512657b::mb47f14f24a7f43d8495cb724",
  "parameters": [
    {
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
    },
    {
      "btType": "BTParameterSpecEnum-171",
      "columnName": "",
      "defaultValue": {
        "btType": "BTMParameterEnum-145",
        "nodeId": "MapCzX7j3x0G3xp8k",
        "parameterId": "chamferMethod",
        "enumName": "ChamferMethod",
        "namespace": "e6e648f0784c53a069512657b::mb47f14f24a7f43d8495cb724",
        "value": "FACE_OFFSET"
      },
      "iconUri": "",
      "parameterDescription": "",
      "parameterId": "chamferMethod",
      "parameterName": "Measurement",
      "uiHint": "",
      "uiHints": [
        "SHOW_LABEL",
        "REMEMBER_PREVIOUS_VALUE"
      ],
      "enumName": "ChamferMethod",
      "enumValueToVisibilityCondition": {},
      "namespace": "e6e648f0784c53a069512657b::mb47f14f24a7f43d8495cb724",
      "optionIconUris": [
        "",
        ""
      ],
      "optionNames": [
        "Offset",
        "Tangent"
      ],
      "options": [
        "FACE_OFFSET",
        "APEX_RANGE"
      ]
    },
    {
      "btType": "BTParameterSpecEnum-171",
      "columnName": "",
      "defaultValue": {
        "btType": "BTMParameterEnum-145",
        "nodeId": "MXGDXC8H9xE1D8GTm",
        "parameterId": "chamferType",
        "enumName": "ChamferType",
        "namespace": "e6e648f0784c53a069512657b::mb47f14f24a7f43d8495cb724",
        "value": "EQUAL_OFFSETS"
      },
      "iconUri": "",
      "parameterDescription": "",
      "parameterId": "chamferType",
      "parameterName": "Chamfer type",
      "uiHint": "",
      "uiHints": [
        "SHOW_LABEL",
        "REMEMBER_PREVIOUS_VALUE"
      ],
      "visibilityCondition": {
        "btType": "BTParameterVisibilityCondition-177"
      },
      "enumName": "ChamferType",
      "enumValueToVisibilityCondition": {},
      "namespace": "e6e648f0784c53a069512657b::mb47f14f24a7f43d8495cb724",
      "optionIconUris": [
        "",
        "",
        ""
      ],
      "optionNames": [
        "Equal distance",
        "Two distances",
        "Distance and angle"
      ],
      "options": [
        "EQUAL_OFFSETS",
        "TWO_OFFSETS",
        "OFFSET_ANGLE"
      ]
    },
    {
      "btType": "BTParameterSpecQuantity-173",
      "columnName": "",
      "defaultValue": {
        "btType": "BTMParameterQuantity-147",
        "nodeId": "MNkZF6qJ9r3ZW8vRK",
        "parameterId": "width",
        "expression": "",
        "isInteger": false,
        "units": "meter",
        "value": 0.005
      },
      "iconUri": "",
      "parameterDescription": "",
      "parameterId": "width",
      "parameterName": "Distance",
      "quantityType": "LENGTH",
      "uiHint": "",
      "uiHints": [
        "REMEMBER_PREVIOUS_VALUE"
      ],
      "visibilityCondition": {
        "btType": "BTParameterVisibilityLogical-178",
        "children": [
          {
            "btType": "BTParameterVisibilityOnEqual-180",
            "inArray": false,
            "parameterId": "chamferType",
            "value": "TWO_OFFSETS"
          }
        ],
        "operation": "NOT"
      },
      "ranges": [
        {
          "btType": "BTQuantityRange-181",
          "defaultValue": 0.005,
          "location": {
            "btType": "BTLocationInfo-226",
            "character": 0,
            "column": 0,
            "document": "6e648f0784c53a069512657b",
            "elementMicroversion": "b47f14f24a7f43d8495cb724",
            "endCharacter": 0,
            "endColumn": 0,
            "endLine": 0,
            "languageVersion": 2770,
            "line": 0,
            "nodeId": "hPTFDt05gX9GQkR0",
            "parseNodeId": "Pkuq57iUk631ykiH3",
            "topLevel": "",
            "version": "b47f14f24a7f43d8495cb724"
          },
          "maxValue": 500,
          "minValue": 0.00001,
          "units": "meter"
        },
        {
          "btType": "BTQuantityRange-181",
          "defaultValue": 0.5,
          "location": {
            "btType": "BTLocationInfo-226",
            "character": 0,
            "column": 0,
            "document": "6e648f0784c53a069512657b",
            "elementMicroversion": "b47f14f24a7f43d8495cb724",
            "endCharacter": 0,
            "endColumn": 0,
            "endLine": 0,
            "languageVersion": 2770,
            "line": 0,
            "nodeId": "h04MqmLdr4v/pBuJ",
            "parseNodeId": "PATr2YKw4+ia9yfRI",
            "topLevel": "",
            "version": "b47f14f24a7f43d8495cb724"
          },
          "maxValue": 50000,
          "minValue": 0.001,
          "units": "centimeter"
        },
        {
          "btType": "BTQuantityRange-181",
          "defaultValue": 5,
          "location": {
            "btType": "BTLocationInfo-226",
            "character": 0,
            "column": 0,
            "document": "6e648f0784c53a069512657b",
            "elementMicroversion": "b47f14f24a7f43d8495cb724",
            "endCharacter": 0,
            "endColumn": 0,
            "endLine": 0,
            "languageVersion": 2770,
            "line": 0,
            "nodeId": "T0KkAftg75h0tKwA",
            "parseNodeId": "PKbys3xb2Ca7saN8B",
            "topLevel": "",
            "version": "b47f14f24a7f43d8495cb724"
          },
          "maxValue": 500000,
          "minValue": 0.01,
          "units": "millimeter"
        },
        {
          "btType": "BTQuantityRange-181",
          "defaultValue": 0.2,
          "location": {
            "btType": "BTLocationInfo-226",
            "character": 0,
            "column": 0,
            "document": "6e648f0784c53a069512657b",
            "elementMicroversion": "b47f14f24a7f43d8495cb724",
            "endCharacter": 0,
            "endColumn": 0,
            "endLine": 0,
            "languageVersion": 2770,
            "line": 0,
            "nodeId": "5byzahTZnax02jOP",
            "parseNodeId": "PtRKsBbcuW4RzDTQv",
            "topLevel": "",
            "version": "b47f14f24a7f43d8495cb724"
          },
          "maxValue": 19685.03937007874,
          "minValue": 0.0003937007874015748,
          "units": "inch"
        },
        {
          "btType": "BTQuantityRange-181",
          "defaultValue": 0.015,
          "location": {
            "btType": "BTLocationInfo-226",
            "character": 0,
            "column": 0,
            "document": "6e648f0784c53a069512657b",
            "elementMicroversion": "b47f14f24a7f43d8495cb724",
            "endCharacter": 0,
            "endColumn": 0,
            "endLine": 0,
            "languageVersion": 2770,
            "line": 0,
            "nodeId": "fj/3TcG6Rsi1YAF+",
            "parseNodeId": "PsE45IvOmWnQxD+mc",
            "topLevel": "",
            "version": "b47f14f24a7f43d8495cb724"
          },
          "maxValue": 1640.4199475065616,
          "minValue": 0.00003280839895013123,
          "units": "foot"
        },
        {
          "btType": "BTQuantityRange-181",
          "defaultValue": 0.005,
          "location": {
            "btType": "BTLocationInfo-226",
            "character": 0,
            "column": 0,
            "document": "6e648f0784c53a069512657b",
            "elementMicroversion": "b47f14f24a7f43d8495cb724",
            "endCharacter": 0,
            "endColumn": 0,
            "endLine": 0,
            "languageVersion": 2770,
            "line": 0,
            "nodeId": "cLRuwkC0Jntnp5AV",
            "parseNodeId": "PFd8zayOPpE8yP2Ij",
            "topLevel": "",
            "version": "b47f14f24a7f43d8495cb724"
          },
          "maxValue": 546.8066491688538,
          "minValue": 0.000010936132983377077,
          "units": "yard"
        }
      ]
    },
    {
      "btType": "BTParameterSpecQuantity-173",
      "columnName": "",
      "defaultValue": {
        "btType": "BTMParameterQuantity-147",
        "nodeId": "MSYVHzGJtO7tvu8Gz",
        "parameterId": "width1",
        "expression": "",
        "isInteger": false,
        "units": "meter",
        "value": 0.005
      },
      "iconUri": "",
      "parameterDescription": "",
      "parameterId": "width1",
      "parameterName": "Distance 1",
      "quantityType": "LENGTH",
      "uiHint": "",
      "uiHints": [],
      "visibilityCondition": {
        "btType": "BTParameterVisibilityLogical-178",
        "children": [
          {
            "btType": "BTParameterVisibilityLogical-178",
            "children": [
              {
                "btType": "BTParameterVisibilityOnEqual-180",
                "inArray": false,
                "parameterId": "chamferType",
                "value": "TWO_OFFSETS"
              }
            ],
            "operation": "NOT"
          }
        ],
        "operation": "NOT"
      },
      "ranges": [
        {
          "btType": "BTQuantityRange-181",
          "defaultValue": 0.005,
          "location": {
            "btType": "BTLocationInfo-226",
            "character": 0,
            "column": 0,
            "document": "6e648f0784c53a069512657b",
            "elementMicroversion": "b47f14f24a7f43d8495cb724",
            "endCharacter": 0,
            "endColumn": 0,
            "endLine": 0,
            "languageVersion": 2770,
            "line": 0,
            "nodeId": "V3V0MceuBFspxZJR",
            "parseNodeId": "Pkuq57iUk631ykiH3",
            "topLevel": "",
            "version": "b47f14f24a7f43d8495cb724"
          },
          "maxValue": 500,
          "minValue": 0.00001,
          "units": "meter"
        },
        {
          "btType": "BTQuantityRange-181",
          "defaultValue": 0.5,
          "location": {
            "btType": "BTLocationInfo-226",
            "character": 0,
            "column": 0,
            "document": "6e648f0784c53a069512657b",
            "elementMicroversion": "b47f14f24a7f43d8495cb724",
            "endCharacter": 0,
            "endColumn": 0,
            "endLine": 0,
            "languageVersion": 2770,
            "line": 0,
            "nodeId": "YBSt5soEzRrzNSFt",
            "parseNodeId": "PATr2YKw4+ia9yfRI",
            "topLevel": "",
            "version": "b47f14f24a7f43d8495cb724"
          },
          "maxValue": 50000,
          "minValue": 0.001,
          "units": "centimeter"
        },
        {
          "btType": "BTQuantityRange-181",
          "defaultValue": 5,
          "location": {
            "btType": "BTLocationInfo-226",
            "character": 0,
            "column": 0,
            "document": "6e648f0784c53a069512657b",
            "elementMicroversion": "b47f14f24a7f43d8495cb724",
            "endCharacter": 0,
            "endColumn": 0,
            "endLine": 0,
            "languageVersion": 2770,
            "line": 0,
            "nodeId": "BMcFwC6gYC4Szmdv",
            "parseNodeId": "PKbys3xb2Ca7saN8B",
            "topLevel": "",
            "version": "b47f14f24a7f43d8495cb724"
          },
          "maxValue": 500000,
          "minValue": 0.01,
          "units": "millimeter"
        },
        {
          "btType": "BTQuantityRange-181",
          "defaultValue": 0.2,
          "location": {
            "btType": "BTLocationInfo-226",
            "character": 0,
            "column": 0,
            "document": "6e648f0784c53a069512657b",
            "elementMicroversion": "b47f14f24a7f43d8495cb724",
            "endCharacter": 0,
            "endColumn": 0,
            "endLine": 0,
            "languageVersion": 2770,
            "line": 0,
            "nodeId": "xyA3dX8WTwAmmx10",
            "parseNodeId": "PtRKsBbcuW4RzDTQv",
            "topLevel": "",
            "version": "b47f14f24a7f43d8495cb724"
          },
          "maxValue": 19685.03937007874,
          "minValue": 0.0003937007874015748,
          "units": "inch"
        },
        {
          "btType": "BTQuantityRange-181",
          "defaultValue": 0.015,
          "location": {
            "btType": "BTLocationInfo-226",
            "character": 0,
            "column": 0,
            "document": "6e648f0784c53a069512657b",
            "elementMicroversion": "b47f14f24a7f43d8495cb724",
            "endCharacter": 0,
            "endColumn": 0,
            "endLine": 0,
            "languageVersion": 2770,
            "line": 0,
            "nodeId": "OZFrPltZbl4X3q8N",
            "parseNodeId": "PsE45IvOmWnQxD+mc",
            "topLevel": "",
            "version": "b47f14f24a7f43d8495cb724"
          },
          "maxValue": 1640.4199475065616,
          "minValue": 0.00003280839895013123,
          "units": "foot"
        },
        {
          "btType": "BTQuantityRange-181",
          "defaultValue": 0.005,
          "location": {
            "btType": "BTLocationInfo-226",
            "character": 0,
            "column": 0,
            "document": "6e648f0784c53a069512657b",
            "elementMicroversion": "b47f14f24a7f43d8495cb724",
            "endCharacter": 0,
            "endColumn": 0,
            "endLine": 0,
            "languageVersion": 2770,
            "line": 0,
            "nodeId": "XG6YHYucxQAw3K6n",
            "parseNodeId": "PFd8zayOPpE8yP2Ij",
            "topLevel": "",
            "version": "b47f14f24a7f43d8495cb724"
          },
          "maxValue": 546.8066491688538,
          "minValue": 0.000010936132983377077,
          "units": "yard"
        }
      ]
    },
    {
      "btType": "BTParameterSpecBoolean-170",
      "columnName": "",
      "defaultValue": {
        "btType": "BTMParameterBoolean-144",
        "nodeId": "M6OMGGYeQG03M8QL/",
        "parameterId": "oppositeDirection",
        "value": false
      },
      "iconUri": "",
      "parameterDescription": "",
      "parameterId": "oppositeDirection",
      "parameterName": "Opposite direction",
      "uiHint": "OppositeDirection",
      "uiHints": [
        "OPPOSITE_DIRECTION"
      ],
      "visibilityCondition": {
        "btType": "BTParameterVisibilityLogical-178",
        "children": [
          {
            "btType": "BTParameterVisibilityOnEqual-180",
            "inArray": false,
            "parameterId": "chamferType",
            "value": "OFFSET_ANGLE"
          },
          {
            "btType": "BTParameterVisibilityOnEqual-180",
            "inArray": false,
            "parameterId": "chamferType",
            "value": "TWO_OFFSETS"
          }
        ],
        "operation": "OR"
      }
    },
    {
      "btType": "BTParameterSpecQuantity-173",
      "columnName": "",
      "defaultValue": {
        "btType": "BTMParameterQuantity-147",
        "nodeId": "MX4UQaqd9aaAyMG0n",
        "parameterId": "width2",
        "expression": "",
        "isInteger": false,
        "units": "meter",
        "value": 0.005
      },
      "iconUri": "",
      "parameterDescription": "",
      "parameterId": "width2",
      "parameterName": "Distance 2",
      "quantityType": "LENGTH",
      "uiHint": "",
      "uiHints": [],
      "visibilityCondition": {
        "btType": "BTParameterVisibilityOnEqual-180",
        "inArray": false,
        "parameterId": "chamferType",
        "value": "TWO_OFFSETS"
      },
      "ranges": [
        {
          "btType": "BTQuantityRange-181",
          "defaultValue": 0.005,
          "location": {
            "btType": "BTLocationInfo-226",
            "character": 0,
            "column": 0,
            "document": "6e648f0784c53a069512657b",
            "elementMicroversion": "b47f14f24a7f43d8495cb724",
            "endCharacter": 0,
            "endColumn": 0,
            "endLine": 0,
            "languageVersion": 2770,
            "line": 0,
            "nodeId": "go9Cu0HkfxwWBp4i",
            "parseNodeId": "Pkuq57iUk631ykiH3",
            "topLevel": "",
            "version": "b47f14f24a7f43d8495cb724"
          },
          "maxValue": 500,
          "minValue": 0.00001,
          "units": "meter"
        },
        {
          "btType": "BTQuantityRange-181",
          "defaultValue": 0.5,
          "location": {
            "btType": "BTLocationInfo-226",
            "character": 0,
            "column": 0,
            "document": "6e648f0784c53a069512657b",
            "elementMicroversion": "b47f14f24a7f43d8495cb724",
            "endCharacter": 0,
            "endColumn": 0,
            "endLine": 0,
            "languageVersion": 2770,
            "line": 0,
            "nodeId": "/gG/qpFdX/KQZh6t",
            "parseNodeId": "PATr2YKw4+ia9yfRI",
            "topLevel": "",
            "version": "b47f14f24a7f43d8495cb724"
          },
          "maxValue": 50000,
          "minValue": 0.001,
          "units": "centimeter"
        },
        {
          "btType": "BTQuantityRange-181",
          "defaultValue": 5,
          "location": {
            "btType": "BTLocationInfo-226",
            "character": 0,
            "column": 0,
            "document": "6e648f0784c53a069512657b",
            "elementMicroversion": "b47f14f24a7f43d8495cb724",
            "endCharacter": 0,
            "endColumn": 0,
            "endLine": 0,
            "languageVersion": 2770,
            "line": 0,
            "nodeId": "4tfcAL7BwfRbktV6",
            "parseNodeId": "PKbys3xb2Ca7saN8B",
            "topLevel": "",
            "version": "b47f14f24a7f43d8495cb724"
          },
          "maxValue": 500000,
          "minValue": 0.01,
          "units": "millimeter"
        },
        {
          "btType": "BTQuantityRange-181",
          "defaultValue": 0.2,
          "location": {
            "btType": "BTLocationInfo-226",
            "character": 0,
            "column": 0,
            "document": "6e648f0784c53a069512657b",
            "elementMicroversion": "b47f14f24a7f43d8495cb724",
            "endCharacter": 0,
            "endColumn": 0,
            "endLine": 0,
            "languageVersion": 2770,
            "line": 0,
            "nodeId": "GCKCb8XQHKe9AYuq",
            "parseNodeId": "PtRKsBbcuW4RzDTQv",
            "topLevel": "",
            "version": "b47f14f24a7f43d8495cb724"
          },
          "maxValue": 19685.03937007874,
          "minValue": 0.0003937007874015748,
          "units": "inch"
        },
        {
          "btType": "BTQuantityRange-181",
          "defaultValue": 0.015,
          "location": {
            "btType": "BTLocationInfo-226",
            "character": 0,
            "column": 0,
            "document": "6e648f0784c53a069512657b",
            "elementMicroversion": "b47f14f24a7f43d8495cb724",
            "endCharacter": 0,
            "endColumn": 0,
            "endLine": 0,
            "languageVersion": 2770,
            "line": 0,
            "nodeId": "ggpirrmRiYMCqIp5",
            "parseNodeId": "PsE45IvOmWnQxD+mc",
            "topLevel": "",
            "version": "b47f14f24a7f43d8495cb724"
          },
          "maxValue": 1640.4199475065616,
          "minValue": 0.00003280839895013123,
          "units": "foot"
        },
        {
          "btType": "BTQuantityRange-181",
          "defaultValue": 0.005,
          "location": {
            "btType": "BTLocationInfo-226",
            "character": 0,
            "column": 0,
            "document": "6e648f0784c53a069512657b",
            "elementMicroversion": "b47f14f24a7f43d8495cb724",
            "endCharacter": 0,
            "endColumn": 0,
            "endLine": 0,
            "languageVersion": 2770,
            "line": 0,
            "nodeId": "0tV+7d/pEnaGysiu",
            "parseNodeId": "PFd8zayOPpE8yP2Ij",
            "topLevel": "",
            "version": "b47f14f24a7f43d8495cb724"
          },
          "maxValue": 546.8066491688538,
          "minValue": 0.000010936132983377077,
          "units": "yard"
        }
      ]
    },
    {
      "btType": "BTParameterSpecQuantity-173",
      "columnName": "",
      "defaultValue": {
        "btType": "BTMParameterQuantity-147",
        "nodeId": "MwYtsPjnCieSXWvgY",
        "parameterId": "angle",
        "expression": "",
        "isInteger": false,
        "units": "degree",
        "value": 45
      },
      "iconUri": "",
      "parameterDescription": "",
      "parameterId": "angle",
      "parameterName": "Angle",
      "quantityType": "ANGLE",
      "uiHint": "",
      "uiHints": [],
      "visibilityCondition": {
        "btType": "BTParameterVisibilityLogical-178",
        "children": [
          {
            "btType": "BTParameterVisibilityLogical-178",
            "children": [
              {
                "btType": "BTParameterVisibilityOnEqual-180",
                "inArray": false,
                "parameterId": "chamferType",
                "value": "TWO_OFFSETS"
              }
            ],
            "operation": "NOT"
          },
          {
            "btType": "BTParameterVisibilityOnEqual-180",
            "inArray": false,
            "parameterId": "chamferType",
            "value": "OFFSET_ANGLE"
          }
        ],
        "operation": "AND"
      },
      "ranges": [
        {
          "btType": "BTQuantityRange-181",
          "defaultValue": 45,
          "location": {
            "btType": "BTLocationInfo-226",
            "character": 0,
            "column": 0,
            "document": "6e648f0784c53a069512657b",
            "elementMicroversion": "b47f14f24a7f43d8495cb724",
            "endCharacter": 0,
            "endColumn": 0,
            "endLine": 0,
            "languageVersion": 2770,
            "line": 0,
            "nodeId": "V4SrnmpOIPp61UTl",
            "parseNodeId": "Pp6FD6ACxkUz1InTI",
            "topLevel": "",
            "version": "b47f14f24a7f43d8495cb724"
          },
          "maxValue": 179.9,
          "minValue": 0.1,
          "units": "degree"
        },
        {
          "btType": "BTQuantityRange-181",
          "defaultValue": 0.7853981633974483,
          "location": {
            "btType": "BTLocationInfo-226",
            "character": 0,
            "column": 0,
            "document": "6e648f0784c53a069512657b",
            "elementMicroversion": "b47f14f24a7f43d8495cb724",
            "endCharacter": 0,
            "endColumn": 0,
            "endLine": 0,
            "languageVersion": 2770,
            "line": 0,
            "nodeId": "/ZNwyxyLo5UB/YwH",
            "parseNodeId": "PTe+ED+qNW2L1Py25",
            "topLevel": "",
            "version": "b47f14f24a7f43d8495cb724"
          },
          "maxValue": 3.139847324337799,
          "minValue": 0.0017453292519943296,
          "units": "radian"
        }
      ]
    },
    {
      "btType": "BTParameterSpecQuery-174",
      "columnName": "",
      "defaultValue": {
        "btType": "BTMParameterQueryList-148",
        "nodeId": "MR1u/BzA7q+HAvpUm",
        "parameterId": "directionOverrides",
        "queries": []
      },
      "iconUri": "",
      "parameterDescription": "",
      "parameterId": "directionOverrides",
      "parameterName": "Direction overrides",
      "uiHint": "",
      "uiHints": [],
      "visibilityCondition": {
        "btType": "BTParameterVisibilityLogical-178",
        "children": [
          {
            "btType": "BTParameterVisibilityOnEqual-180",
            "inArray": false,
            "parameterId": "chamferType",
            "value": "OFFSET_ANGLE"
          },
          {
            "btType": "BTParameterVisibilityOnEqual-180",
            "inArray": false,
            "parameterId": "chamferType",
            "value": "TWO_OFFSETS"
          }
        ],
        "operation": "OR"
      },
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
    },
    {
      "btType": "BTParameterSpecBoolean-170",
      "columnName": "",
      "defaultValue": {
        "btType": "BTMParameterBoolean-144",
        "nodeId": "MtMwupDhVbZejIbxn",
        "parameterId": "tangentPropagation",
        "value": true
      },
      "iconUri": "",
      "parameterDescription": "",
      "parameterId": "tangentPropagation",
      "parameterName": "Tangent propagation",
      "uiHint": "",
      "uiHints": []
    }
  ],
  "sourceLocation": {
    "btType": "BTLocationInfo-226",
    "character": 1317,
    "column": 24,
    "document": "6e648f0784c53a069512657b",
    "elementMicroversion": "b47f14f24a7f43d8495cb724",
    "endCharacter": 3645,
    "endColumn": 142,
    "endLine": 75,
    "languageVersion": 2770,
    "line": 27,
    "moduleIds": {
      "btType": "BTDocumentVersionElementIds-1897",
      "documentId": "",
      "elementId": "6e648f0784c53a069512657b",
      "versionId": ""
    },
    "nodeId": "m69R7UsvSmDhslHb",
    "parseNodeId": "PkpLu/c96UbTy6Imn",
    "topLevel": "",
    "version": "b47f14f24a7f43d8495cb724"
  },
  "sourceMicroversionId": "b47f14f24a7f43d8495cb724",
  "tooltipTemplate": "",
  "uiHints": []
};
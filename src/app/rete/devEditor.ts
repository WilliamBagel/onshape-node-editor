import { ClassicPreset } from 'rete';

import { CustomFeatureNode } from './nodes/customfeaturenode';
import { editorBase } from './editorbase';
import { DefineFeatureNode } from './nodes/definefeaturenode';
import { OutputFeatureNode } from './nodes/outputfeaturenode';

const socket = new ClassicPreset.Socket('socket');

export async function createEditor(container: HTMLElement) {

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

  // const aType = 'Mirror';
  // const bType = 'Something';

  // const a = new CustomFeatureNode({ featureTypeName: aType });
  // a.addOutput('a', new ClassicPreset.Output(socket, 'label1'));

  // const aInput = new ClassicPreset.Input(socket, 'label2');
  // const inputControl = new OnshapeControl("BTParameterSpecQuantity-173");

  // aInput.addControl(inputControl)
  // a.addInput('a', aInput);  

  // const aInput2 = new ClassicPreset.Input(socket, 'label2');
  // const inputControl2 = new OnshapeControl("BTParameterSpecQuantity-173");

  // aInput2.addControl(inputControl2)
  // a.addInput('a2', aInput2);  

  // await editor.addNode(a);

  // const b = new CustomFeatureNode({ featureTypeName: bType });
  // b.addOutput('a', new ClassicPreset.Output(socket, 'label3'));
  // b.addInput('a', new ClassicPreset.Input(socket, 'label4'));
  // await editor.addNode(b);

  // await area.translate(a.id, { x: 0, y: 0 });
  // await area.translate(b.id, { x: 300, y: 0 });

  // await editor.addConnection(new ClassicPreset.Connection(a, 'a', b, 'a'));


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

var LoftFeatureSpec: any = {
  "btType": "BTFeatureSpecsResponse-664",
  "rejectMicroversionSkew": false,
  "microversionSkew": false,
  "featureSpecs": [{
    "btType": "BTFeatureSpec-129",
    "parameters": [
      {
        "btType": "BTParameterSpecEnum-171",
        "enumName": "ExtendedToolBodyType",
        "enumValueToVisibilityCondition": {},
        "enumOptionVisibilityConditions": null,
        "optionIconUris": ["", "", ""],
        "options": ["SOLID", "SURFACE", "THIN"],
        "defaultValue": {
          "btType": "BTMParameterEnum-145",
          "namespace": "efe34be09d873042ef093975c::mc82a8320dcd9a046ae970d97",
          "nodeId": "M05bP7bZFEk6z38Yl",
          "value": "SOLID",
          "enumName": "ExtendedToolBodyType",
          "parameterId": "bodyType",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "namespace": "efe34be09d873042ef093975c::mc82a8320dcd9a046ae970d97",
        "parameterId": "bodyType",
        "parameterName": "Creation type",
        "uiHints": ["HORIZONTAL_ENUM", "REMEMBER_PREVIOUS_VALUE"],
        "visibilityCondition": null,
        "uiHint": "",
        "optionNames": ["Solid", "Surface", "Thin"],
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecEnum-171",
        "enumName": "NewBodyOperationType",
        "enumValueToVisibilityCondition": {},
        "enumOptionVisibilityConditions": null,
        "optionIconUris": ["", "", "", ""],
        "options": ["NEW", "ADD", "REMOVE", "INTERSECT"],
        "defaultValue": {
          "btType": "BTMParameterEnum-145",
          "namespace": "efe34be09d873042ef093975c::mc82a8320dcd9a046ae970d97",
          "nodeId": "MD+54Kz7294DdtCp8",
          "value": "NEW",
          "enumName": "NewBodyOperationType",
          "parameterId": "operationType",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "namespace": "efe34be09d873042ef093975c::mc82a8320dcd9a046ae970d97",
        "parameterId": "operationType",
        "parameterName": "Result body operation type",
        "uiHints": ["HORIZONTAL_ENUM"],
        "visibilityCondition": {
          "btType": "BTParameterVisibilityLogical-178",
          "children": [{
            "btType": "BTParameterVisibilityOnEqual-180",
            "value": "SOLID",
            "inArray": false,
            "parameterId": "bodyType"
          }, {
            "btType": "BTParameterVisibilityOnEqual-180",
            "value": "THIN",
            "inArray": false,
            "parameterId": "bodyType"
          }],
          "operation": "OR"
        },
        "uiHint": "",
        "optionNames": ["New", "Add", "Remove", "Intersect"],
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecEnum-171",
        "enumName": "NewSurfaceOperationType",
        "enumValueToVisibilityCondition": {},
        "enumOptionVisibilityConditions": null,
        "optionIconUris": ["", ""],
        "options": ["NEW", "ADD"],
        "defaultValue": {
          "btType": "BTMParameterEnum-145",
          "namespace": "efe34be09d873042ef093975c::mc82a8320dcd9a046ae970d97",
          "nodeId": "MKW8iv07QQSVPOWH5",
          "value": "NEW",
          "enumName": "NewSurfaceOperationType",
          "parameterId": "surfaceOperationType",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "namespace": "efe34be09d873042ef093975c::mc82a8320dcd9a046ae970d97",
        "parameterId": "surfaceOperationType",
        "parameterName": "Result body operation type",
        "uiHints": ["HORIZONTAL_ENUM"],
        "visibilityCondition": {
          "btType": "BTParameterVisibilityLogical-178",
          "children": [{
            "btType": "BTParameterVisibilityLogical-178",
            "children": [{
              "btType": "BTParameterVisibilityOnEqual-180",
              "value": "SOLID",
              "inArray": false,
              "parameterId": "bodyType"
            }, {
              "btType": "BTParameterVisibilityOnEqual-180",
              "value": "THIN",
              "inArray": false,
              "parameterId": "bodyType"
            }],
            "operation": "OR"
          }],
          "operation": "NOT"
        },
        "uiHint": "",
        "optionNames": ["New", "Add"],
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecArray-2600",
        "parameters": [
          {
            "btType": "BTParameterSpecQuery-174",
            "filter": {
              "btType": "BTOrFilter-167",
              "operand1": {
                "btType": "BTAndFilter-110",
                "operand1": {
                  "btType": "BTOrFilter-167",
                  "operand1": {
                    "btType": "BTEntityTypeFilter-124",
                    "entityType": "FACE"
                  },
                  "operand2": {
                    "btType": "BTAndFilter-110",
                    "operand1": {
                      "btType": "BTAndFilter-110",
                      "operand1": {
                        "btType": "BTEntityTypeFilter-124",
                        "entityType": "BODY"
                      },
                      "operand2": {
                        "btType": "BTBodyTypeFilter-112",
                        "bodyType": "SHEET"
                      }
                    },
                    "operand2": {
                      "btType": "BTSketchObjectFilter-184",
                      "objectType": "NOT_SKETCH_OBJECT",
                      "isSketchObject": false
                    }
                  }
                },
                "operand2": {
                  "btType": "BTConstructionObjectFilter-113",
                  "isConstruction": false
                }
              },
              "operand2": {
                "btType": "BTEntityTypeFilter-124",
                "entityType": "VERTEX"
              }
            },
            "maxNumberOfPicks": -1,
            "additionalBoxSelectFilter": null,
            "defaultValue": {
              "btType": "BTMParameterQueryList-148",
              "filter": null,
              "queries": [],
              "parameterId": "sheetProfileEntities",
              "nodeId": "MwJx3kGRGJz7Grosw",
              "parameterName": "",
              "libraryRelationType": "NONE"
            },
            "parameterId": "sheetProfileEntities",
            "parameterName": "Faces and sketch regions",
            "uiHints": [],
            "visibilityCondition": {
              "btType": "BTParameterVisibilityOnEqual-180",
              "value": "SOLID",
              "inArray": false,
              "parameterId": "bodyType"
            },
            "uiHint": "",
            "parameterDescription": "",
            "columnName": "",
            "iconUri": ""
          }],
        "maxNumberOfPicks": 0,
        "itemName": "profile",
        "itemLabelTemplate": "#sheetProfileEntities",
        "drivenQuery": "sheetProfileEntities",
        "showLabelsOnly": false,
        "dialogId": "",
        "defaultValue": {
          "btType": "BTMParameterArray-2025",
          "items": [],
          "parameterId": "sheetProfilesArray",
          "nodeId": "MMmhyix2UonF2iZOa",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "parameterId": "sheetProfilesArray",
        "icon": "",
        "parameterName": "Profiles",
        "uiHints": ["COLLAPSE_ARRAY_ITEMS"],
        "visibilityCondition": {
          "btType": "BTParameterVisibilityOnEqual-180",
          "value": "SOLID",
          "inArray": false,
          "parameterId": "bodyType"
        },
        "uiHint": "",
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecArray-2600",
        "parameters": [
          {
            "btType": "BTParameterSpecQuery-174",
            "filter": {
              "btType": "BTOrFilter-167",
              "operand1": {
                "btType": "BTAndFilter-110",
                "operand1": {
                  "btType": "BTOrFilter-167",
                  "operand1": {
                    "btType": "BTOrFilter-167",
                    "operand1": {
                      "btType": "BTEntityTypeFilter-124",
                      "entityType": "EDGE"
                    },
                    "operand2": {
                      "btType": "BTEntityTypeFilter-124",
                      "entityType": "FACE"
                    }
                  },
                  "operand2": {
                    "btType": "BTAndFilter-110",
                    "operand1": {
                      "btType": "BTAndFilter-110",
                      "operand1": {
                        "btType": "BTEntityTypeFilter-124",
                        "entityType": "BODY"
                      },
                      "operand2": {
                        "btType": "BTOrFilter-167",
                        "operand1": {
                          "btType": "BTBodyTypeFilter-112",
                          "bodyType": "WIRE"
                        },
                        "operand2": {
                          "btType": "BTBodyTypeFilter-112",
                          "bodyType": "SHEET"
                        }
                      }
                    },
                    "operand2": {
                      "btType": "BTSketchObjectFilter-184",
                      "objectType": "NOT_SKETCH_OBJECT",
                      "isSketchObject": false
                    }
                  }
                },
                "operand2": {
                  "btType": "BTConstructionObjectFilter-113",
                  "isConstruction": false
                }
              },
              "operand2": {
                "btType": "BTEntityTypeFilter-124",
                "entityType": "VERTEX"
              }
            },
            "maxNumberOfPicks": -1,
            "additionalBoxSelectFilter": null,
            "defaultValue": {
              "btType": "BTMParameterQueryList-148",
              "filter": null,
              "queries": [],
              "parameterId": "wireProfileEntities",
              "nodeId": "MSH/v3ZKcjRSD6fHN",
              "parameterName": "",
              "libraryRelationType": "NONE"
            },
            "parameterId": "wireProfileEntities",
            "parameterName": "Edges, curves and sketches",
            "uiHints": [],
            "visibilityCondition": {
              "btType": "BTParameterVisibilityLogical-178",
              "children": [{
                "btType": "BTParameterVisibilityOnEqual-180",
                "value": "SOLID",
                "inArray": false,
                "parameterId": "bodyType"
              }],
              "operation": "NOT"
            },
            "uiHint": "",
            "parameterDescription": "",
            "columnName": "",
            "iconUri": ""
          }],
        "maxNumberOfPicks": 0,
        "itemName": "profile",
        "itemLabelTemplate": "#wireProfileEntities",
        "drivenQuery": "wireProfileEntities",
        "showLabelsOnly": false,
        "dialogId": "",
        "defaultValue": {
          "btType": "BTMParameterArray-2025",
          "items": [],
          "parameterId": "wireProfilesArray",
          "nodeId": "Mvte8lYQwAMK3sz6S",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "parameterId": "wireProfilesArray",
        "icon": "",
        "parameterName": "Profiles",
        "uiHints": ["COLLAPSE_ARRAY_ITEMS"],
        "visibilityCondition": {
          "btType": "BTParameterVisibilityLogical-178",
          "children": [{
            "btType": "BTParameterVisibilityOnEqual-180",
            "value": "SOLID",
            "inArray": false,
            "parameterId": "bodyType"
          }],
          "operation": "NOT"
        },
        "uiHint": "",
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecBoolean-170",
        "defaultValue": {
          "btType": "BTMParameterBoolean-144",
          "value": false,
          "parameterId": "midplane",
          "nodeId": "MyWJTKicfieVIHV4J",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "parameterId": "midplane",
        "parameterName": "Mid plane",
        "uiHints": [],
        "visibilityCondition": {
          "btType": "BTParameterVisibilityOnEqual-180",
          "value": "THIN",
          "inArray": false,
          "parameterId": "bodyType"
        },
        "uiHint": "",
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecQuantity-173",
        "quantityType": "LENGTH",
        "ranges": [{
          "btType": "BTQuantityRange-181",
          "location": {
            "btType": "BTLocationInfo-226",
            "version": "c82a8320dcd9a046ae970d97",
            "character": 0,
            "endLine": 0,
            "line": 0,
            "endColumn": 0,
            "languageVersion": 2770,
            "parseNodeId": "P8xefie6VuSFURo9H",
            "endCharacter": 0,
            "column": 0,
            "moduleIds": null,
            "document": "fe34be09d873042ef093975c",
            "elementMicroversion": "c82a8320dcd9a046ae970d97",
            "nodeId": "MpRAsBaj1FtkKwUD",
            "topLevel": ""
          },
          "defaultValue": 0.005,
          "units": "meter",
          "minValue": 0.0,
          "maxValue": 500.0
        }, {
          "btType": "BTQuantityRange-181",
          "location": {
            "btType": "BTLocationInfo-226",
            "version": "c82a8320dcd9a046ae970d97",
            "character": 0,
            "endLine": 0,
            "line": 0,
            "endColumn": 0,
            "languageVersion": 2770,
            "parseNodeId": "PcdFbvNfXK0OW5EO0",
            "endCharacter": 0,
            "column": 0,
            "moduleIds": null,
            "document": "fe34be09d873042ef093975c",
            "elementMicroversion": "c82a8320dcd9a046ae970d97",
            "nodeId": "Zm7f3HX38XpvWkbz",
            "topLevel": ""
          },
          "defaultValue": 0.5,
          "units": "centimeter",
          "minValue": 0.0,
          "maxValue": 50000.0
        }, {
          "btType": "BTQuantityRange-181",
          "location": {
            "btType": "BTLocationInfo-226",
            "version": "c82a8320dcd9a046ae970d97",
            "character": 0,
            "endLine": 0,
            "line": 0,
            "endColumn": 0,
            "languageVersion": 2770,
            "parseNodeId": "P/MVg7AkoxFoyOl2L",
            "endCharacter": 0,
            "column": 0,
            "moduleIds": null,
            "document": "fe34be09d873042ef093975c",
            "elementMicroversion": "c82a8320dcd9a046ae970d97",
            "nodeId": "Gyr/fPN8cEltwwO0",
            "topLevel": ""
          },
          "defaultValue": 5.0,
          "units": "millimeter",
          "minValue": 0.0,
          "maxValue": 500000.0
        }, {
          "btType": "BTQuantityRange-181",
          "location": {
            "btType": "BTLocationInfo-226",
            "version": "c82a8320dcd9a046ae970d97",
            "character": 0,
            "endLine": 0,
            "line": 0,
            "endColumn": 0,
            "languageVersion": 2770,
            "parseNodeId": "P+gtDTHqvS8Ded8Gg",
            "endCharacter": 0,
            "column": 0,
            "moduleIds": null,
            "document": "fe34be09d873042ef093975c",
            "elementMicroversion": "c82a8320dcd9a046ae970d97",
            "nodeId": "7xwxI1IiDiwv/Qlm",
            "topLevel": ""
          },
          "defaultValue": 0.25,
          "units": "inch",
          "minValue": 0.0,
          "maxValue": 19685.03937007874
        }, {
          "btType": "BTQuantityRange-181",
          "location": {
            "btType": "BTLocationInfo-226",
            "version": "c82a8320dcd9a046ae970d97",
            "character": 0,
            "endLine": 0,
            "line": 0,
            "endColumn": 0,
            "languageVersion": 2770,
            "parseNodeId": "PwBHanrQrEVVmiXI4",
            "endCharacter": 0,
            "column": 0,
            "moduleIds": null,
            "document": "fe34be09d873042ef093975c",
            "elementMicroversion": "c82a8320dcd9a046ae970d97",
            "nodeId": "OYiPiolvYyE3jTYT",
            "topLevel": ""
          },
          "defaultValue": 0.025,
          "units": "foot",
          "minValue": 0.0,
          "maxValue": 1640.4199475065616
        }, {
          "btType": "BTQuantityRange-181",
          "location": {
            "btType": "BTLocationInfo-226",
            "version": "c82a8320dcd9a046ae970d97",
            "character": 0,
            "endLine": 0,
            "line": 0,
            "endColumn": 0,
            "languageVersion": 2770,
            "parseNodeId": "PfcsrtSSVXINaM1Sd",
            "endCharacter": 0,
            "column": 0,
            "moduleIds": null,
            "document": "fe34be09d873042ef093975c",
            "elementMicroversion": "c82a8320dcd9a046ae970d97",
            "nodeId": "vBT5jcH7tFiQrEo0",
            "topLevel": ""
          },
          "defaultValue": 0.01,
          "units": "yard",
          "minValue": 0.0,
          "maxValue": 546.8066491688538
        }],
        "defaultValue": {
          "btType": "BTMParameterQuantity-147",
          "value": 0.005,
          "units": "meter",
          "isInteger": false,
          "expression": "",
          "parameterId": "thickness1",
          "nodeId": "Mi4F3rpH4rjb5sP9n",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "parameterId": "thickness1",
        "parameterName": "Thickness 1",
        "uiHints": [],
        "visibilityCondition": {
          "btType": "BTParameterVisibilityLogical-178",
          "children": [{
            "btType": "BTParameterVisibilityOnEqual-180",
            "value": "THIN",
            "inArray": false,
            "parameterId": "bodyType"
          }, {
            "btType": "BTParameterVisibilityLogical-178",
            "children": [{
              "btType": "BTParameterVisibilityOnEqual-180",
              "value": "true",
              "inArray": false,
              "parameterId": "midplane"
            }],
            "operation": "NOT"
          }],
          "operation": "AND"
        },
        "uiHint": "",
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecBoolean-170",
        "defaultValue": {
          "btType": "BTMParameterBoolean-144",
          "value": false,
          "parameterId": "flipWall",
          "nodeId": "M9kSl6BpH5xw8aEy6",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "parameterId": "flipWall",
        "parameterName": "Flip wall",
        "uiHints": ["OPPOSITE_DIRECTION"],
        "visibilityCondition": {
          "btType": "BTParameterVisibilityLogical-178",
          "children": [{
            "btType": "BTParameterVisibilityOnEqual-180",
            "value": "THIN",
            "inArray": false,
            "parameterId": "bodyType"
          }, {
            "btType": "BTParameterVisibilityLogical-178",
            "children": [{
              "btType": "BTParameterVisibilityOnEqual-180",
              "value": "true",
              "inArray": false,
              "parameterId": "midplane"
            }],
            "operation": "NOT"
          }],
          "operation": "AND"
        },
        "uiHint": "OppositeDirection",
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecQuantity-173",
        "quantityType": "LENGTH",
        "ranges": [{
          "btType": "BTQuantityRange-181",
          "location": {
            "btType": "BTLocationInfo-226",
            "version": "c82a8320dcd9a046ae970d97",
            "character": 0,
            "endLine": 0,
            "line": 0,
            "endColumn": 0,
            "languageVersion": 2770,
            "parseNodeId": "PFXg54YcfBU6NoZef",
            "endCharacter": 0,
            "column": 0,
            "moduleIds": null,
            "document": "fe34be09d873042ef093975c",
            "elementMicroversion": "c82a8320dcd9a046ae970d97",
            "nodeId": "8dX0IofbENt7xKN+",
            "topLevel": ""
          },
          "defaultValue": 0.0,
          "units": "meter",
          "minValue": 0.0,
          "maxValue": 500.0
        }, {
          "btType": "BTQuantityRange-181",
          "location": {
            "btType": "BTLocationInfo-226",
            "version": "c82a8320dcd9a046ae970d97",
            "character": 0,
            "endLine": 0,
            "line": 0,
            "endColumn": 0,
            "languageVersion": 2770,
            "parseNodeId": "Prx2gmr4XpoMlKiIP",
            "endCharacter": 0,
            "column": 0,
            "moduleIds": null,
            "document": "fe34be09d873042ef093975c",
            "elementMicroversion": "c82a8320dcd9a046ae970d97",
            "nodeId": "zc2HNCO+lbUlojOA",
            "topLevel": ""
          },
          "defaultValue": 0.0,
          "units": "centimeter",
          "minValue": 0.0,
          "maxValue": 50000.0
        }, {
          "btType": "BTQuantityRange-181",
          "location": {
            "btType": "BTLocationInfo-226",
            "version": "c82a8320dcd9a046ae970d97",
            "character": 0,
            "endLine": 0,
            "line": 0,
            "endColumn": 0,
            "languageVersion": 2770,
            "parseNodeId": "Panzq0DEF+St47jSK",
            "endCharacter": 0,
            "column": 0,
            "moduleIds": null,
            "document": "fe34be09d873042ef093975c",
            "elementMicroversion": "c82a8320dcd9a046ae970d97",
            "nodeId": "J//IfS5O0XF5G3Gz",
            "topLevel": ""
          },
          "defaultValue": 0.0,
          "units": "millimeter",
          "minValue": 0.0,
          "maxValue": 500000.0
        }, {
          "btType": "BTQuantityRange-181",
          "location": {
            "btType": "BTLocationInfo-226",
            "version": "c82a8320dcd9a046ae970d97",
            "character": 0,
            "endLine": 0,
            "line": 0,
            "endColumn": 0,
            "languageVersion": 2770,
            "parseNodeId": "P5QT82g+/ZnNZlOwC",
            "endCharacter": 0,
            "column": 0,
            "moduleIds": null,
            "document": "fe34be09d873042ef093975c",
            "elementMicroversion": "c82a8320dcd9a046ae970d97",
            "nodeId": "Zo4ma4ux4ARsF2Ur",
            "topLevel": ""
          },
          "defaultValue": 0.0,
          "units": "inch",
          "minValue": 0.0,
          "maxValue": 19685.03937007874
        }, {
          "btType": "BTQuantityRange-181",
          "location": {
            "btType": "BTLocationInfo-226",
            "version": "c82a8320dcd9a046ae970d97",
            "character": 0,
            "endLine": 0,
            "line": 0,
            "endColumn": 0,
            "languageVersion": 2770,
            "parseNodeId": "PpWVddHABtL+FD0rp",
            "endCharacter": 0,
            "column": 0,
            "moduleIds": null,
            "document": "fe34be09d873042ef093975c",
            "elementMicroversion": "c82a8320dcd9a046ae970d97",
            "nodeId": "sj37VKDf56VUbJEu",
            "topLevel": ""
          },
          "defaultValue": 0.0,
          "units": "foot",
          "minValue": 0.0,
          "maxValue": 1640.4199475065616
        }, {
          "btType": "BTQuantityRange-181",
          "location": {
            "btType": "BTLocationInfo-226",
            "version": "c82a8320dcd9a046ae970d97",
            "character": 0,
            "endLine": 0,
            "line": 0,
            "endColumn": 0,
            "languageVersion": 2770,
            "parseNodeId": "PEhORHtXnIN2ixGDu",
            "endCharacter": 0,
            "column": 0,
            "moduleIds": null,
            "document": "fe34be09d873042ef093975c",
            "elementMicroversion": "c82a8320dcd9a046ae970d97",
            "nodeId": "jE6PaAmkbufE1sHb",
            "topLevel": ""
          },
          "defaultValue": 0.0,
          "units": "yard",
          "minValue": 0.0,
          "maxValue": 546.8066491688538
        }],
        "defaultValue": {
          "btType": "BTMParameterQuantity-147",
          "value": 0.0,
          "units": "meter",
          "isInteger": false,
          "expression": "",
          "parameterId": "thickness2",
          "nodeId": "MAvWjzQkjgvNKu+Bl",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "parameterId": "thickness2",
        "parameterName": "Thickness 2",
        "uiHints": [],
        "visibilityCondition": {
          "btType": "BTParameterVisibilityLogical-178",
          "children": [{
            "btType": "BTParameterVisibilityOnEqual-180",
            "value": "THIN",
            "inArray": false,
            "parameterId": "bodyType"
          }, {
            "btType": "BTParameterVisibilityLogical-178",
            "children": [{
              "btType": "BTParameterVisibilityOnEqual-180",
              "value": "true",
              "inArray": false,
              "parameterId": "midplane"
            }],
            "operation": "NOT"
          }],
          "operation": "AND"
        },
        "uiHint": "",
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecQuantity-173",
        "quantityType": "LENGTH",
        "ranges": [{
          "btType": "BTQuantityRange-181",
          "location": {
            "btType": "BTLocationInfo-226",
            "version": "c82a8320dcd9a046ae970d97",
            "character": 0,
            "endLine": 0,
            "line": 0,
            "endColumn": 0,
            "languageVersion": 2770,
            "parseNodeId": "P8xefie6VuSFURo9H",
            "endCharacter": 0,
            "column": 0,
            "moduleIds": null,
            "document": "fe34be09d873042ef093975c",
            "elementMicroversion": "c82a8320dcd9a046ae970d97",
            "nodeId": "rUYGsGxovCjT05Kb",
            "topLevel": ""
          },
          "defaultValue": 0.005,
          "units": "meter",
          "minValue": 0.0,
          "maxValue": 500.0
        }, {
          "btType": "BTQuantityRange-181",
          "location": {
            "btType": "BTLocationInfo-226",
            "version": "c82a8320dcd9a046ae970d97",
            "character": 0,
            "endLine": 0,
            "line": 0,
            "endColumn": 0,
            "languageVersion": 2770,
            "parseNodeId": "PcdFbvNfXK0OW5EO0",
            "endCharacter": 0,
            "column": 0,
            "moduleIds": null,
            "document": "fe34be09d873042ef093975c",
            "elementMicroversion": "c82a8320dcd9a046ae970d97",
            "nodeId": "CHhemonBe8DiQECF",
            "topLevel": ""
          },
          "defaultValue": 0.5,
          "units": "centimeter",
          "minValue": 0.0,
          "maxValue": 50000.0
        }, {
          "btType": "BTQuantityRange-181",
          "location": {
            "btType": "BTLocationInfo-226",
            "version": "c82a8320dcd9a046ae970d97",
            "character": 0,
            "endLine": 0,
            "line": 0,
            "endColumn": 0,
            "languageVersion": 2770,
            "parseNodeId": "P/MVg7AkoxFoyOl2L",
            "endCharacter": 0,
            "column": 0,
            "moduleIds": null,
            "document": "fe34be09d873042ef093975c",
            "elementMicroversion": "c82a8320dcd9a046ae970d97",
            "nodeId": "6Y099DUlnnVVDne7",
            "topLevel": ""
          },
          "defaultValue": 5.0,
          "units": "millimeter",
          "minValue": 0.0,
          "maxValue": 500000.0
        }, {
          "btType": "BTQuantityRange-181",
          "location": {
            "btType": "BTLocationInfo-226",
            "version": "c82a8320dcd9a046ae970d97",
            "character": 0,
            "endLine": 0,
            "line": 0,
            "endColumn": 0,
            "languageVersion": 2770,
            "parseNodeId": "P+gtDTHqvS8Ded8Gg",
            "endCharacter": 0,
            "column": 0,
            "moduleIds": null,
            "document": "fe34be09d873042ef093975c",
            "elementMicroversion": "c82a8320dcd9a046ae970d97",
            "nodeId": "/69GvQBaRWgMyG0p",
            "topLevel": ""
          },
          "defaultValue": 0.25,
          "units": "inch",
          "minValue": 0.0,
          "maxValue": 19685.03937007874
        }, {
          "btType": "BTQuantityRange-181",
          "location": {
            "btType": "BTLocationInfo-226",
            "version": "c82a8320dcd9a046ae970d97",
            "character": 0,
            "endLine": 0,
            "line": 0,
            "endColumn": 0,
            "languageVersion": 2770,
            "parseNodeId": "PwBHanrQrEVVmiXI4",
            "endCharacter": 0,
            "column": 0,
            "moduleIds": null,
            "document": "fe34be09d873042ef093975c",
            "elementMicroversion": "c82a8320dcd9a046ae970d97",
            "nodeId": "JF7bKW0cnIyXG/YD",
            "topLevel": ""
          },
          "defaultValue": 0.025,
          "units": "foot",
          "minValue": 0.0,
          "maxValue": 1640.4199475065616
        }, {
          "btType": "BTQuantityRange-181",
          "location": {
            "btType": "BTLocationInfo-226",
            "version": "c82a8320dcd9a046ae970d97",
            "character": 0,
            "endLine": 0,
            "line": 0,
            "endColumn": 0,
            "languageVersion": 2770,
            "parseNodeId": "PfcsrtSSVXINaM1Sd",
            "endCharacter": 0,
            "column": 0,
            "moduleIds": null,
            "document": "fe34be09d873042ef093975c",
            "elementMicroversion": "c82a8320dcd9a046ae970d97",
            "nodeId": "DcxDV/Jkk5VgeScw",
            "topLevel": ""
          },
          "defaultValue": 0.01,
          "units": "yard",
          "minValue": 0.0,
          "maxValue": 546.8066491688538
        }],
        "defaultValue": {
          "btType": "BTMParameterQuantity-147",
          "value": 0.005,
          "units": "meter",
          "isInteger": false,
          "expression": "",
          "parameterId": "thickness",
          "nodeId": "MbKpHED32rX4/SrkH",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "parameterId": "thickness",
        "parameterName": "Thickness",
        "uiHints": [],
        "visibilityCondition": {
          "btType": "BTParameterVisibilityLogical-178",
          "children": [{
            "btType": "BTParameterVisibilityOnEqual-180",
            "value": "THIN",
            "inArray": false,
            "parameterId": "bodyType"
          }, {
            "btType": "BTParameterVisibilityLogical-178",
            "children": [{
              "btType": "BTParameterVisibilityLogical-178",
              "children": [{
                "btType": "BTParameterVisibilityOnEqual-180",
                "value": "true",
                "inArray": false,
                "parameterId": "midplane"
              }],
              "operation": "NOT"
            }],
            "operation": "NOT"
          }],
          "operation": "AND"
        },
        "uiHint": "",
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecEnum-171",
        "enumName": "LoftEndDerivativeType",
        "enumValueToVisibilityCondition": {},
        "enumOptionVisibilityConditions": null,
        "optionIconUris": ["", "", "", "", "", "", ""],
        "options": ["DEFAULT", "NORMAL_TO_PROFILE", "TANGENT_TO_PROFILE", "MATCH_TANGENT", "MATCH_CURVATURE", "NORMAL_DIRECTION", "TANGENT_DIRECTION"],
        "defaultValue": {
          "btType": "BTMParameterEnum-145",
          "namespace": "efe34be09d873042ef093975c::mc82a8320dcd9a046ae970d97",
          "nodeId": "MCHelFUiLhnSiN5je",
          "value": "DEFAULT",
          "enumName": "LoftEndDerivativeType",
          "parameterId": "startCondition",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "namespace": "efe34be09d873042ef093975c::mc82a8320dcd9a046ae970d97",
        "parameterId": "startCondition",
        "parameterName": "Start profile condition",
        "uiHints": ["SHOW_LABEL"],
        "visibilityCondition": null,
        "uiHint": "",
        "optionNames": ["None", "Normal to profile", "Tangent to profile", "Match tangent", "Match curvature", "Normal direction", "Tangent direction"],
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecQuery-174",
        "filter": {
          "btType": "BTEntityTypeFilter-124",
          "entityType": "FACE"
        },
        "maxNumberOfPicks": -1,
        "additionalBoxSelectFilter": null,
        "defaultValue": {
          "btType": "BTMParameterQueryList-148",
          "filter": null,
          "queries": [],
          "parameterId": "adjacentFacesStart",
          "nodeId": "MyLhxn5Kd1I8IEC2A",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "parameterId": "adjacentFacesStart",
        "parameterName": "Adjacent faces",
        "uiHints": ["FOCUS_ON_VISIBLE"],
        "visibilityCondition": {
          "btType": "BTParameterVisibilityLogical-178",
          "children": [{
            "btType": "BTParameterVisibilityOnEqual-180",
            "value": "MATCH_TANGENT",
            "inArray": false,
            "parameterId": "startCondition"
          }, {
            "btType": "BTParameterVisibilityOnEqual-180",
            "value": "MATCH_CURVATURE",
            "inArray": false,
            "parameterId": "startCondition"
          }],
          "operation": "OR"
        },
        "uiHint": "",
        "parameterDescription": "",
        "columnName": "Start profile adjacent faces",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecQuantity-173",
        "quantityType": "REAL",
        "ranges": [{
          "btType": "BTQuantityRange-181",
          "location": {
            "btType": "BTLocationInfo-226",
            "version": "c82a8320dcd9a046ae970d97",
            "character": 0,
            "endLine": 0,
            "line": 0,
            "endColumn": 0,
            "languageVersion": 2770,
            "parseNodeId": "PZGgwg4dt+E1xemgq",
            "endCharacter": 0,
            "column": 0,
            "moduleIds": null,
            "document": "fe34be09d873042ef093975c",
            "elementMicroversion": "c82a8320dcd9a046ae970d97",
            "nodeId": "Xh131fv+x1RwLiVj",
            "topLevel": ""
          },
          "defaultValue": 1.0,
          "units": "",
          "minValue": -100000.0,
          "maxValue": 100000.0
        }],
        "defaultValue": {
          "btType": "BTMParameterQuantity-147",
          "value": 1.0,
          "units": "",
          "isInteger": false,
          "expression": "",
          "parameterId": "startMagnitude",
          "nodeId": "MVTRL3oM6RStHFhwJ",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "parameterId": "startMagnitude",
        "parameterName": "Start magnitude",
        "uiHints": [],
        "visibilityCondition": {
          "btType": "BTParameterVisibilityLogical-178",
          "children": [{
            "btType": "BTParameterVisibilityOnEqual-180",
            "value": "DEFAULT",
            "inArray": false,
            "parameterId": "startCondition"
          }],
          "operation": "NOT"
        },
        "uiHint": "",
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecQuery-174",
        "filter": {
          "btType": "BTOrFilter-167",
          "operand1": {
            "btType": "BTOrFilter-167",
            "operand1": {
              "btType": "BTOrFilter-167",
              "operand1": {
                "btType": "BTOrFilter-167",
                "operand1": {
                  "btType": "BTGeometryFilter-130",
                  "geometryType": "LINE"
                },
                "operand2": {
                  "btType": "BTOrFilter-167",
                  "operand1": {
                    "btType": "BTGeometryFilter-130",
                    "geometryType": "CIRCLE"
                  },
                  "operand2": {
                    "btType": "BTOrFilter-167",
                    "operand1": {
                      "btType": "BTGeometryFilter-130",
                      "geometryType": "ARC"
                    },
                    "operand2": {
                      "btType": "BTOrFilter-167",
                      "operand1": {
                        "btType": "BTGeometryFilter-130",
                        "geometryType": "CYLINDER"
                      },
                      "operand2": {
                        "btType": "BTOrFilter-167",
                        "operand1": {
                          "btType": "BTGeometryFilter-130",
                          "geometryType": "CONE"
                        },
                        "operand2": {
                          "btType": "BTGeometryFilter-130",
                          "geometryType": "REVOLVED"
                        }
                      }
                    }
                  }
                }
              },
              "operand2": {
                "btType": "BTMateConnectorFilter-163",
                "requiresOccurrence": false,
                "allowImplicitMateConnector": false,
                "isMateConnectorInferenceEnabledByDefault": false
              }
            },
            "operand2": {
              "btType": "BTGeometryFilter-130",
              "geometryType": "PLANE"
            }
          },
          "operand2": {
            "btType": "BTBodyTypeFilter-112",
            "bodyType": "MATE_CONNECTOR"
          }
        },
        "maxNumberOfPicks": 1,
        "additionalBoxSelectFilter": null,
        "defaultValue": {
          "btType": "BTMParameterQueryList-148",
          "filter": null,
          "queries": [],
          "parameterId": "startDirection",
          "nodeId": "Mi1k730d6Y+SGtsYh",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "parameterId": "startDirection",
        "parameterName": "Start direction",
        "uiHints": [],
        "visibilityCondition": {
          "btType": "BTParameterVisibilityLogical-178",
          "children": [{
            "btType": "BTParameterVisibilityOnEqual-180",
            "value": "TANGENT_DIRECTION",
            "inArray": false,
            "parameterId": "startCondition"
          }, {
            "btType": "BTParameterVisibilityOnEqual-180",
            "value": "NORMAL_DIRECTION",
            "inArray": false,
            "parameterId": "startCondition"
          }],
          "operation": "OR"
        },
        "uiHint": "",
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecEnum-171",
        "enumName": "LoftEndDerivativeType",
        "enumValueToVisibilityCondition": {},
        "enumOptionVisibilityConditions": null,
        "optionIconUris": ["", "", "", "", "", "", ""],
        "options": ["DEFAULT", "NORMAL_TO_PROFILE", "TANGENT_TO_PROFILE", "MATCH_TANGENT", "MATCH_CURVATURE", "NORMAL_DIRECTION", "TANGENT_DIRECTION"],
        "defaultValue": {
          "btType": "BTMParameterEnum-145",
          "namespace": "efe34be09d873042ef093975c::mc82a8320dcd9a046ae970d97",
          "nodeId": "MGgeUM/SbJW/ZraOm",
          "value": "DEFAULT",
          "enumName": "LoftEndDerivativeType",
          "parameterId": "endCondition",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "namespace": "efe34be09d873042ef093975c::mc82a8320dcd9a046ae970d97",
        "parameterId": "endCondition",
        "parameterName": "End profile condition",
        "uiHints": ["SHOW_LABEL"],
        "visibilityCondition": null,
        "uiHint": "",
        "optionNames": ["None", "Normal to profile", "Tangent to profile", "Match tangent", "Match curvature", "Normal direction", "Tangent direction"],
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecQuery-174",
        "filter": {
          "btType": "BTEntityTypeFilter-124",
          "entityType": "FACE"
        },
        "maxNumberOfPicks": -1,
        "additionalBoxSelectFilter": null,
        "defaultValue": {
          "btType": "BTMParameterQueryList-148",
          "filter": null,
          "queries": [],
          "parameterId": "adjacentFacesEnd",
          "nodeId": "M3P0XI3YBJ3TxbwL9",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "parameterId": "adjacentFacesEnd",
        "parameterName": "Adjacent faces",
        "uiHints": ["FOCUS_ON_VISIBLE"],
        "visibilityCondition": {
          "btType": "BTParameterVisibilityLogical-178",
          "children": [{
            "btType": "BTParameterVisibilityOnEqual-180",
            "value": "MATCH_TANGENT",
            "inArray": false,
            "parameterId": "endCondition"
          }, {
            "btType": "BTParameterVisibilityOnEqual-180",
            "value": "MATCH_CURVATURE",
            "inArray": false,
            "parameterId": "endCondition"
          }],
          "operation": "OR"
        },
        "uiHint": "",
        "parameterDescription": "",
        "columnName": "End profile adjacent faces",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecQuantity-173",
        "quantityType": "REAL",
        "ranges": [{
          "btType": "BTQuantityRange-181",
          "location": {
            "btType": "BTLocationInfo-226",
            "version": "c82a8320dcd9a046ae970d97",
            "character": 0,
            "endLine": 0,
            "line": 0,
            "endColumn": 0,
            "languageVersion": 2770,
            "parseNodeId": "PZGgwg4dt+E1xemgq",
            "endCharacter": 0,
            "column": 0,
            "moduleIds": null,
            "document": "fe34be09d873042ef093975c",
            "elementMicroversion": "c82a8320dcd9a046ae970d97",
            "nodeId": "wWDc0Ee+RwrvTpLv",
            "topLevel": ""
          },
          "defaultValue": 1.0,
          "units": "",
          "minValue": -100000.0,
          "maxValue": 100000.0
        }],
        "defaultValue": {
          "btType": "BTMParameterQuantity-147",
          "value": 1.0,
          "units": "",
          "isInteger": false,
          "expression": "",
          "parameterId": "endMagnitude",
          "nodeId": "M456qHKJun3EcgbUP",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "parameterId": "endMagnitude",
        "parameterName": "End magnitude",
        "uiHints": [],
        "visibilityCondition": {
          "btType": "BTParameterVisibilityLogical-178",
          "children": [{
            "btType": "BTParameterVisibilityOnEqual-180",
            "value": "DEFAULT",
            "inArray": false,
            "parameterId": "endCondition"
          }],
          "operation": "NOT"
        },
        "uiHint": "",
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecQuery-174",
        "filter": {
          "btType": "BTOrFilter-167",
          "operand1": {
            "btType": "BTOrFilter-167",
            "operand1": {
              "btType": "BTOrFilter-167",
              "operand1": {
                "btType": "BTOrFilter-167",
                "operand1": {
                  "btType": "BTGeometryFilter-130",
                  "geometryType": "LINE"
                },
                "operand2": {
                  "btType": "BTOrFilter-167",
                  "operand1": {
                    "btType": "BTGeometryFilter-130",
                    "geometryType": "CIRCLE"
                  },
                  "operand2": {
                    "btType": "BTOrFilter-167",
                    "operand1": {
                      "btType": "BTGeometryFilter-130",
                      "geometryType": "ARC"
                    },
                    "operand2": {
                      "btType": "BTOrFilter-167",
                      "operand1": {
                        "btType": "BTGeometryFilter-130",
                        "geometryType": "CYLINDER"
                      },
                      "operand2": {
                        "btType": "BTOrFilter-167",
                        "operand1": {
                          "btType": "BTGeometryFilter-130",
                          "geometryType": "CONE"
                        },
                        "operand2": {
                          "btType": "BTGeometryFilter-130",
                          "geometryType": "REVOLVED"
                        }
                      }
                    }
                  }
                }
              },
              "operand2": {
                "btType": "BTMateConnectorFilter-163",
                "requiresOccurrence": false,
                "allowImplicitMateConnector": false,
                "isMateConnectorInferenceEnabledByDefault": false
              }
            },
            "operand2": {
              "btType": "BTGeometryFilter-130",
              "geometryType": "PLANE"
            }
          },
          "operand2": {
            "btType": "BTBodyTypeFilter-112",
            "bodyType": "MATE_CONNECTOR"
          }
        },
        "maxNumberOfPicks": 1,
        "additionalBoxSelectFilter": null,
        "defaultValue": {
          "btType": "BTMParameterQueryList-148",
          "filter": null,
          "queries": [],
          "parameterId": "endDirection",
          "nodeId": "MeB92+I+f2BnF0b/I",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "parameterId": "endDirection",
        "parameterName": "End direction",
        "uiHints": [],
        "visibilityCondition": {
          "btType": "BTParameterVisibilityLogical-178",
          "children": [{
            "btType": "BTParameterVisibilityOnEqual-180",
            "value": "TANGENT_DIRECTION",
            "inArray": false,
            "parameterId": "endCondition"
          }, {
            "btType": "BTParameterVisibilityOnEqual-180",
            "value": "NORMAL_DIRECTION",
            "inArray": false,
            "parameterId": "endCondition"
          }],
          "operation": "OR"
        },
        "uiHint": "",
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecBoolean-170",
        "defaultValue": {
          "btType": "BTMParameterBoolean-144",
          "value": false,
          "parameterId": "trimProfiles",
          "nodeId": "M/i+pXVmtVfJHhKAO",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "parameterId": "trimProfiles",
        "parameterName": "Trim profiles",
        "uiHints": [],
        "visibilityCondition": {
          "btType": "BTParameterVisibilityLogical-178",
          "children": [{
            "btType": "BTParameterVisibilityOnEqual-180",
            "value": "SURFACE",
            "inArray": false,
            "parameterId": "bodyType"
          }, {
            "btType": "BTParameterVisibilityOnEqual-180",
            "value": "THIN",
            "inArray": false,
            "parameterId": "bodyType"
          }],
          "operation": "OR"
        },
        "uiHint": "",
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecBoolean-170",
        "defaultValue": {
          "btType": "BTMParameterBoolean-144",
          "value": false,
          "parameterId": "addGuides",
          "nodeId": "MqZGAc+4YNBWDGVKz",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "parameterId": "addGuides",
        "parameterName": "Guides and continuity",
        "uiHints": [],
        "visibilityCondition": null,
        "uiHint": "",
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecArray-2600",
        "parameters": [{
          "btType": "BTParameterSpecQuery-174",
          "filter": {
            "btType": "BTOrFilter-167",
            "operand1": {
              "btType": "BTAndFilter-110",
              "operand1": {
                "btType": "BTEntityTypeFilter-124",
                "entityType": "EDGE"
              },
              "operand2": {
                "btType": "BTConstructionObjectFilter-113",
                "isConstruction": false
              }
            },
            "operand2": {
              "btType": "BTAndFilter-110",
              "operand1": {
                "btType": "BTAndFilter-110",
                "operand1": {
                  "btType": "BTEntityTypeFilter-124",
                  "entityType": "BODY"
                },
                "operand2": {
                  "btType": "BTBodyTypeFilter-112",
                  "bodyType": "WIRE"
                }
              },
              "operand2": {
                "btType": "BTSketchObjectFilter-184",
                "objectType": "NOT_SKETCH_OBJECT",
                "isSketchObject": false
              }
            }
          },
          "maxNumberOfPicks": -1,
          "additionalBoxSelectFilter": null,
          "defaultValue": {
            "btType": "BTMParameterQueryList-148",
            "filter": null,
            "queries": [],
            "parameterId": "guideEntities",
            "nodeId": "M4V3i/QgphWg8oYdI",
            "parameterName": "",
            "libraryRelationType": "NONE"
          },
          "parameterId": "guideEntities",
          "parameterName": "Edges, curves and sketches",
          "uiHints": [],
          "visibilityCondition": {
            "btType": "BTParameterVisibilityOnEqual-180",
            "value": "true",
            "inArray": false,
            "parameterId": "addGuides"
          },
          "uiHint": "",
          "parameterDescription": "",
          "columnName": "",
          "iconUri": ""
        }, {
          "btType": "BTParameterSpecEnum-171",
          "enumName": "LoftGuideDerivativeType",
          "enumValueToVisibilityCondition": {},
          "enumOptionVisibilityConditions": null,
          "optionIconUris": ["", "", "", "", ""],
          "options": ["DEFAULT", "NORMAL_TO_GUIDE", "TANGENT_TO_GUIDE", "MATCH_TANGENT", "MATCH_CURVATURE"],
          "defaultValue": {
            "btType": "BTMParameterEnum-145",
            "namespace": "efe34be09d873042ef093975c::mc82a8320dcd9a046ae970d97",
            "nodeId": "MTe9JzV3ncYUh8p7u",
            "value": "DEFAULT",
            "enumName": "LoftGuideDerivativeType",
            "parameterId": "guideDerivativeType",
            "parameterName": "",
            "libraryRelationType": "NONE"
          },
          "namespace": "efe34be09d873042ef093975c::mc82a8320dcd9a046ae970d97",
          "parameterId": "guideDerivativeType",
          "parameterName": "Continuity",
          "uiHints": ["SHOW_LABEL", "MATCH_LAST_ARRAY_ITEM"],
          "visibilityCondition": {
            "btType": "BTParameterVisibilityOnEqual-180",
            "value": "true",
            "inArray": false,
            "parameterId": "addGuides"
          },
          "uiHint": "",
          "optionNames": ["None", "Normal to guide", "Tangent to guide", "Match tangent", "Match curvature"],
          "parameterDescription": "",
          "columnName": "",
          "iconUri": ""
        }, {
          "btType": "BTParameterSpecQuantity-173",
          "quantityType": "REAL",
          "ranges": [{
            "btType": "BTQuantityRange-181",
            "location": {
              "btType": "BTLocationInfo-226",
              "version": "c82a8320dcd9a046ae970d97",
              "character": 0,
              "endLine": 0,
              "line": 0,
              "endColumn": 0,
              "languageVersion": 2770,
              "parseNodeId": "PZGgwg4dt+E1xemgq",
              "endCharacter": 0,
              "column": 0,
              "moduleIds": null,
              "document": "fe34be09d873042ef093975c",
              "elementMicroversion": "c82a8320dcd9a046ae970d97",
              "nodeId": "KyxXEdlynyJ0tVa0",
              "topLevel": ""
            },
            "defaultValue": 1.0,
            "units": "",
            "minValue": -100000.0,
            "maxValue": 100000.0
          }],
          "defaultValue": {
            "btType": "BTMParameterQuantity-147",
            "value": 1.0,
            "units": "",
            "isInteger": false,
            "expression": "",
            "parameterId": "guideDerivativeMagnitude",
            "nodeId": "MizhnUgVaM+0UeJXn",
            "parameterName": "",
            "libraryRelationType": "NONE"
          },
          "parameterId": "guideDerivativeMagnitude",
          "parameterName": "Magnitude",
          "uiHints": ["ALWAYS_HIDDEN"],
          "visibilityCondition": {
            "btType": "BTParameterVisibilityOnEqual-180",
            "value": "true",
            "inArray": false,
            "parameterId": "addGuides"
          },
          "uiHint": "AlwaysHidden",
          "parameterDescription": "",
          "columnName": "",
          "iconUri": ""
        }],
        "maxNumberOfPicks": 0,
        "itemName": "guide",
        "itemLabelTemplate": "#guideEntities",
        "drivenQuery": "guideEntities",
        "showLabelsOnly": false,
        "dialogId": "",
        "defaultValue": {
          "btType": "BTMParameterArray-2025",
          "items": [],
          "parameterId": "guidesArray",
          "nodeId": "MK9h4nKWQzoDSodLT",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "parameterId": "guidesArray",
        "icon": "",
        "parameterName": "Guides",
        "uiHints": ["COLLAPSE_ARRAY_ITEMS", "FOCUS_ON_VISIBLE"],
        "visibilityCondition": {
          "btType": "BTParameterVisibilityOnEqual-180",
          "value": "true",
          "inArray": false,
          "parameterId": "addGuides"
        },
        "uiHint": "",
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecBoolean-170",
        "defaultValue": {
          "btType": "BTMParameterBoolean-144",
          "value": true,
          "parameterId": "trimGuidesByProfiles",
          "nodeId": "M+4yDKVPbk/npzxbQ",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "parameterId": "trimGuidesByProfiles",
        "parameterName": "Trim guides",
        "uiHints": [],
        "visibilityCondition": {
          "btType": "BTParameterVisibilityLogical-178",
          "children": [{
            "btType": "BTParameterVisibilityOnEqual-180",
            "value": "true",
            "inArray": false,
            "parameterId": "addGuides"
          }, {
            "btType": "BTParameterVisibilityLogical-178",
            "children": [{
              "btType": "BTParameterVisibilityOnEqual-180",
              "value": "SURFACE",
              "inArray": false,
              "parameterId": "bodyType"
            }, {
              "btType": "BTParameterVisibilityOnEqual-180",
              "value": "THIN",
              "inArray": false,
              "parameterId": "bodyType"
            }],
            "operation": "OR"
          }],
          "operation": "AND"
        },
        "uiHint": "",
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecBoolean-170",
        "defaultValue": {
          "btType": "BTMParameterBoolean-144",
          "value": false,
          "parameterId": "addSections",
          "nodeId": "M2qkky1p8uf1k/N63",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "parameterId": "addSections",
        "parameterName": "Path",
        "uiHints": [],
        "visibilityCondition": null,
        "uiHint": "",
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecQuery-174",
        "filter": {
          "btType": "BTOrFilter-167",
          "operand1": {
            "btType": "BTAndFilter-110",
            "operand1": {
              "btType": "BTEntityTypeFilter-124",
              "entityType": "EDGE"
            },
            "operand2": {
              "btType": "BTConstructionObjectFilter-113",
              "isConstruction": false
            }
          },
          "operand2": {
            "btType": "BTAndFilter-110",
            "operand1": {
              "btType": "BTEntityTypeFilter-124",
              "entityType": "BODY"
            },
            "operand2": {
              "btType": "BTBodyTypeFilter-112",
              "bodyType": "WIRE"
            }
          }
        },
        "maxNumberOfPicks": -1,
        "additionalBoxSelectFilter": null,
        "defaultValue": {
          "btType": "BTMParameterQueryList-148",
          "filter": null,
          "queries": [],
          "parameterId": "spine",
          "nodeId": "MAzcVyOggIDtoxSKP",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "parameterId": "spine",
        "parameterName": "Edges, curves and sketches",
        "uiHints": ["FOCUS_ON_VISIBLE"],
        "visibilityCondition": {
          "btType": "BTParameterVisibilityOnEqual-180",
          "value": "true",
          "inArray": false,
          "parameterId": "addSections"
        },
        "uiHint": "",
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecQuantity-173",
        "quantityType": "INTEGER",
        "ranges": [{
          "btType": "BTQuantityRange-181",
          "location": {
            "btType": "BTLocationInfo-226",
            "version": "c82a8320dcd9a046ae970d97",
            "character": 0,
            "endLine": 0,
            "line": 0,
            "endColumn": 0,
            "languageVersion": 2770,
            "parseNodeId": "P9LmpdM+lsuIMOD67",
            "endCharacter": 0,
            "column": 0,
            "moduleIds": null,
            "document": "fe34be09d873042ef093975c",
            "elementMicroversion": "c82a8320dcd9a046ae970d97",
            "nodeId": "bI6OE6oO+X5Lnz51",
            "topLevel": ""
          },
          "defaultValue": 5.0,
          "units": "",
          "minValue": 1.0,
          "maxValue": 50.0
        }],
        "defaultValue": {
          "btType": "BTMParameterQuantity-147",
          "value": 5.0,
          "units": "",
          "isInteger": true,
          "expression": "",
          "parameterId": "sectionCount",
          "nodeId": "MNaYXrBLaY0zCe8Ll",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "parameterId": "sectionCount",
        "parameterName": "Section count",
        "uiHints": [],
        "visibilityCondition": {
          "btType": "BTParameterVisibilityOnEqual-180",
          "value": "true",
          "inArray": false,
          "parameterId": "addSections"
        },
        "uiHint": "",
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecBoolean-170",
        "defaultValue": {
          "btType": "BTMParameterBoolean-144",
          "value": false,
          "parameterId": "matchConnections",
          "nodeId": "Mg1/4LtId8/xekHEH",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "parameterId": "matchConnections",
        "parameterName": "Connections",
        "uiHints": [],
        "visibilityCondition": null,
        "uiHint": "",
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecArray-2600",
        "parameters": [{
          "btType": "BTParameterSpecQuery-174",
          "filter": {
            "btType": "BTOrFilter-167",
            "operand1": {
              "btType": "BTAndFilter-110",
              "operand1": {
                "btType": "BTEntityTypeFilter-124",
                "entityType": "EDGE"
              },
              "operand2": {
                "btType": "BTConstructionObjectFilter-113",
                "isConstruction": false
              }
            },
            "operand2": {
              "btType": "BTAndFilter-110",
              "operand1": {
                "btType": "BTEntityTypeFilter-124",
                "entityType": "VERTEX"
              },
              "operand2": {
                "btType": "BTAllowEdgePointFilter-2371",
                "allowsEdgePoint": false
              }
            }
          },
          "maxNumberOfPicks": -1,
          "additionalBoxSelectFilter": null,
          "defaultValue": {
            "btType": "BTMParameterQueryList-148",
            "filter": null,
            "queries": [],
            "parameterId": "connectionEntities",
            "nodeId": "MXPO2718HtudSDrIE",
            "parameterName": "",
            "libraryRelationType": "NONE"
          },
          "parameterId": "connectionEntities",
          "parameterName": "Vertices or edges",
          "uiHints": [],
          "visibilityCondition": {
            "btType": "BTParameterVisibilityOnEqual-180",
            "value": "true",
            "inArray": false,
            "parameterId": "matchConnections"
          },
          "uiHint": "",
          "parameterDescription": "",
          "columnName": "",
          "iconUri": ""
        }, {
          "btType": "BTParameterSpecQuery-174",
          "filter": null,
          "maxNumberOfPicks": -1,
          "additionalBoxSelectFilter": null,
          "defaultValue": {
            "btType": "BTMParameterQueryList-148",
            "filter": null,
            "queries": [],
            "parameterId": "connectionEdgeQueries",
            "nodeId": "Mi40m/N0j3BIC9qlK",
            "parameterName": "",
            "libraryRelationType": "NONE"
          },
          "parameterId": "connectionEdgeQueries",
          "parameterName": "Edge queries",
          "uiHints": ["ALWAYS_HIDDEN"],
          "visibilityCondition": {
            "btType": "BTParameterVisibilityOnEqual-180",
            "value": "true",
            "inArray": false,
            "parameterId": "matchConnections"
          },
          "uiHint": "AlwaysHidden",
          "parameterDescription": "",
          "columnName": "",
          "iconUri": ""
        }, {
          "btType": "BTParameterSpecQuantity-173",
          "quantityType": "ANYTHING",
          "ranges": [],
          "defaultValue": {
            "btType": "BTMParameterQuantity-147",
            "value": 0.0,
            "units": "",
            "isInteger": false,
            "expression": "0",
            "parameterId": "connectionEdgeParameters",
            "nodeId": "MNUsdnIGcILSoHfm7",
            "parameterName": "",
            "libraryRelationType": "NONE"
          },
          "parameterId": "connectionEdgeParameters",
          "parameterName": "Edge parameters",
          "uiHints": ["ALWAYS_HIDDEN"],
          "visibilityCondition": {
            "btType": "BTParameterVisibilityOnEqual-180",
            "value": "true",
            "inArray": false,
            "parameterId": "matchConnections"
          },
          "uiHint": "AlwaysHidden",
          "parameterDescription": "",
          "columnName": "",
          "iconUri": ""
        }],
        "maxNumberOfPicks": 0,
        "itemName": "connection",
        "itemLabelTemplate": "#connectionEntities",
        "drivenQuery": "connectionEntities",
        "showLabelsOnly": false,
        "dialogId": "",
        "defaultValue": {
          "btType": "BTMParameterArray-2025",
          "items": [],
          "parameterId": "connections",
          "nodeId": "MEUCOhdTcF5FMFfe8",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "parameterId": "connections",
        "icon": "",
        "parameterName": "Match connections",
        "uiHints": ["FOCUS_INNER_QUERY", "FOCUS_ON_VISIBLE"],
        "visibilityCondition": {
          "btType": "BTParameterVisibilityOnEqual-180",
          "value": "true",
          "inArray": false,
          "parameterId": "matchConnections"
        },
        "uiHint": "",
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecBoolean-170",
        "defaultValue": {
          "btType": "BTMParameterBoolean-144",
          "value": false,
          "parameterId": "makePeriodic",
          "nodeId": "MrNItd0v+LV9/CO7R",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "parameterId": "makePeriodic",
        "parameterName": "Make periodic",
        "uiHints": ["ALWAYS_HIDDEN"],
        "visibilityCondition": null,
        "uiHint": "AlwaysHidden",
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecBoolean-170",
        "defaultValue": {
          "btType": "BTMParameterBoolean-144",
          "value": false,
          "parameterId": "showIsocurves",
          "nodeId": "M/IfQqt//JnhwGeDA",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "parameterId": "showIsocurves",
        "parameterName": "Show isocurves",
        "uiHints": [],
        "visibilityCondition": null,
        "uiHint": "",
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecQuantity-173",
        "quantityType": "INTEGER",
        "ranges": [{
          "btType": "BTQuantityRange-181",
          "location": {
            "btType": "BTLocationInfo-226",
            "version": "c82a8320dcd9a046ae970d97",
            "character": 0,
            "endLine": 0,
            "line": 0,
            "endColumn": 0,
            "languageVersion": 2770,
            "parseNodeId": "P4fDyk9LTq6SB+3qF",
            "endCharacter": 0,
            "column": 0,
            "moduleIds": null,
            "document": "fe34be09d873042ef093975c",
            "elementMicroversion": "c82a8320dcd9a046ae970d97",
            "nodeId": "52qzbQDmMAexEiN/",
            "topLevel": ""
          },
          "defaultValue": 10.0,
          "units": "",
          "minValue": 1.0,
          "maxValue": 50.0
        }],
        "defaultValue": {
          "btType": "BTMParameterQuantity-147",
          "value": 10.0,
          "units": "",
          "isInteger": true,
          "expression": "",
          "parameterId": "curveCount",
          "nodeId": "MhSRh431VzMBu9NmB",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "parameterId": "curveCount",
        "parameterName": "Count",
        "uiHints": [],
        "visibilityCondition": {
          "btType": "BTParameterVisibilityOnEqual-180",
          "value": "true",
          "inArray": false,
          "parameterId": "showIsocurves"
        },
        "uiHint": "",
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecBoolean-170",
        "defaultValue": {
          "btType": "BTMParameterBoolean-144",
          "value": true,
          "parameterId": "trimEnds",
          "nodeId": "MKmWd0Rs+Lvs+9+xh",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "parameterId": "trimEnds",
        "parameterName": "Trim ends",
        "uiHints": [],
        "visibilityCondition": {
          "btType": "BTParameterVisibilityOnEqual-180",
          "value": "THIN",
          "inArray": false,
          "parameterId": "bodyType"
        },
        "uiHint": "",
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecBoolean-170",
        "defaultValue": {
          "btType": "BTMParameterBoolean-144",
          "value": false,
          "parameterId": "defaultScope",
          "nodeId": "MKnbgXhyt/5c9DY9x",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "parameterId": "defaultScope",
        "parameterName": "Merge with all",
        "uiHints": [],
        "visibilityCondition": {
          "btType": "BTParameterVisibilityLogical-178",
          "children": [{
            "btType": "BTParameterVisibilityLogical-178",
            "children": [{
              "btType": "BTParameterVisibilityLogical-178",
              "children": [{
                "btType": "BTParameterVisibilityOnEqual-180",
                "value": "SOLID",
                "inArray": false,
                "parameterId": "bodyType"
              }, {
                "btType": "BTParameterVisibilityOnEqual-180",
                "value": "THIN",
                "inArray": false,
                "parameterId": "bodyType"
              }],
              "operation": "OR"
            }, {
              "btType": "BTParameterVisibilityLogical-178",
              "children": [{
                "btType": "BTParameterVisibilityOnEqual-180",
                "value": "NEW",
                "inArray": false,
                "parameterId": "operationType"
              }],
              "operation": "NOT"
            }],
            "operation": "AND"
          }, {
            "btType": "BTParameterVisibilityCondition-177"
          }],
          "operation": "AND"
        },
        "uiHint": "",
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecQuery-174",
        "filter": {
          "btType": "BTAndFilter-110",
          "operand1": {
            "btType": "BTAndFilter-110",
            "operand1": {
              "btType": "BTAndFilter-110",
              "operand1": {
                "btType": "BTEntityTypeFilter-124",
                "entityType": "BODY"
              },
              "operand2": {
                "btType": "BTBodyTypeFilter-112",
                "bodyType": "SOLID"
              }
            },
            "operand2": {
              "btType": "BTModifiableEntityOnlyFilter-1593",
              "modifiableOnly": true
            }
          },
          "operand2": {
            "btType": "BTAllowMeshGeometryFilter-1026",
            "allowsMeshGeometry": true
          }
        },
        "maxNumberOfPicks": -1,
        "additionalBoxSelectFilter": null,
        "defaultValue": {
          "btType": "BTMParameterQueryList-148",
          "filter": null,
          "queries": [],
          "parameterId": "booleanScope",
          "nodeId": "MvMUaU94LtR0SZtSM",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "parameterId": "booleanScope",
        "parameterName": "Merge scope",
        "uiHints": [],
        "visibilityCondition": {
          "btType": "BTParameterVisibilityLogical-178",
          "children": [{
            "btType": "BTParameterVisibilityLogical-178",
            "children": [{
              "btType": "BTParameterVisibilityLogical-178",
              "children": [{
                "btType": "BTParameterVisibilityLogical-178",
                "children": [{
                  "btType": "BTParameterVisibilityOnEqual-180",
                  "value": "SOLID",
                  "inArray": false,
                  "parameterId": "bodyType"
                }, {
                  "btType": "BTParameterVisibilityOnEqual-180",
                  "value": "THIN",
                  "inArray": false,
                  "parameterId": "bodyType"
                }],
                "operation": "OR"
              }, {
                "btType": "BTParameterVisibilityLogical-178",
                "children": [{
                  "btType": "BTParameterVisibilityOnEqual-180",
                  "value": "NEW",
                  "inArray": false,
                  "parameterId": "operationType"
                }],
                "operation": "NOT"
              }],
              "operation": "AND"
            }, {
              "btType": "BTParameterVisibilityCondition-177"
            }],
            "operation": "AND"
          }, {
            "btType": "BTParameterVisibilityLogical-178",
            "children": [{
              "btType": "BTParameterVisibilityOnEqual-180",
              "value": "true",
              "inArray": false,
              "parameterId": "defaultScope"
            }],
            "operation": "NOT"
          }],
          "operation": "AND"
        },
        "uiHint": "",
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecBoolean-170",
        "defaultValue": {
          "btType": "BTMParameterBoolean-144",
          "value": true,
          "parameterId": "defaultSurfaceScope",
          "nodeId": "MK3oqeVsASji1Gi7m",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "parameterId": "defaultSurfaceScope",
        "parameterName": "Merge with all",
        "uiHints": [],
        "visibilityCondition": {
          "btType": "BTParameterVisibilityLogical-178",
          "children": [{
            "btType": "BTParameterVisibilityLogical-178",
            "children": [{
              "btType": "BTParameterVisibilityLogical-178",
              "children": [{
                "btType": "BTParameterVisibilityLogical-178",
                "children": [{
                  "btType": "BTParameterVisibilityOnEqual-180",
                  "value": "SOLID",
                  "inArray": false,
                  "parameterId": "bodyType"
                }, {
                  "btType": "BTParameterVisibilityOnEqual-180",
                  "value": "THIN",
                  "inArray": false,
                  "parameterId": "bodyType"
                }],
                "operation": "OR"
              }],
              "operation": "NOT"
            }, {
              "btType": "BTParameterVisibilityLogical-178",
              "children": [{
                "btType": "BTParameterVisibilityOnEqual-180",
                "value": "NEW",
                "inArray": false,
                "parameterId": "surfaceOperationType"
              }],
              "operation": "NOT"
            }],
            "operation": "AND"
          }, {
            "btType": "BTParameterVisibilityCondition-177"
          }],
          "operation": "AND"
        },
        "uiHint": "",
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }, {
        "btType": "BTParameterSpecQuery-174",
        "filter": {
          "btType": "BTAndFilter-110",
          "operand1": {
            "btType": "BTAndFilter-110",
            "operand1": {
              "btType": "BTAndFilter-110",
              "operand1": {
                "btType": "BTAndFilter-110",
                "operand1": {
                  "btType": "BTEntityTypeFilter-124",
                  "entityType": "BODY"
                },
                "operand2": {
                  "btType": "BTBodyTypeFilter-112",
                  "bodyType": "SHEET"
                }
              },
              "operand2": {
                "btType": "BTModifiableEntityOnlyFilter-1593",
                "modifiableOnly": true
              }
            },
            "operand2": {
              "btType": "BTAllowMeshGeometryFilter-1026",
              "allowsMeshGeometry": true
            }
          },
          "operand2": {
            "btType": "BTSketchObjectFilter-184",
            "objectType": "NOT_SKETCH_OBJECT",
            "isSketchObject": false
          }
        },
        "maxNumberOfPicks": -1,
        "additionalBoxSelectFilter": null,
        "defaultValue": {
          "btType": "BTMParameterQueryList-148",
          "filter": null,
          "queries": [],
          "parameterId": "booleanSurfaceScope",
          "nodeId": "M/GjI6qWFJ26q68SQ",
          "parameterName": "",
          "libraryRelationType": "NONE"
        },
        "parameterId": "booleanSurfaceScope",
        "parameterName": "Merge scope",
        "uiHints": [],
        "visibilityCondition": {
          "btType": "BTParameterVisibilityLogical-178",
          "children": [{
            "btType": "BTParameterVisibilityLogical-178",
            "children": [{
              "btType": "BTParameterVisibilityLogical-178",
              "children": [{
                "btType": "BTParameterVisibilityLogical-178",
                "children": [{
                  "btType": "BTParameterVisibilityLogical-178",
                  "children": [{
                    "btType": "BTParameterVisibilityOnEqual-180",
                    "value": "SOLID",
                    "inArray": false,
                    "parameterId": "bodyType"
                  }, {
                    "btType": "BTParameterVisibilityOnEqual-180",
                    "value": "THIN",
                    "inArray": false,
                    "parameterId": "bodyType"
                  }],
                  "operation": "OR"
                }],
                "operation": "NOT"
              }, {
                "btType": "BTParameterVisibilityLogical-178",
                "children": [{
                  "btType": "BTParameterVisibilityOnEqual-180",
                  "value": "NEW",
                  "inArray": false,
                  "parameterId": "surfaceOperationType"
                }],
                "operation": "NOT"
              }],
              "operation": "AND"
            }, {
              "btType": "BTParameterVisibilityCondition-177"
            }],
            "operation": "AND"
          }, {
            "btType": "BTParameterVisibilityLogical-178",
            "children": [{
              "btType": "BTParameterVisibilityOnEqual-180",
              "value": "true",
              "inArray": false,
              "parameterId": "defaultSurfaceScope"
            }],
            "operation": "NOT"
          }],
          "operation": "AND"
        },
        "uiHint": "",
        "parameterDescription": "",
        "columnName": "",
        "iconUri": ""
      }],
    "featureNameTemplate": "",
    "parameterLibraryDefinitionIds": [],
    "tooltipTemplate": "",
    "descriptionImageUri": "",
    "featureTypeDescription": "",
    "languageVersion": 2770,
    "editingLogic": {
      "btType": "BTEditingLogic-2350",
      "functionName": "loftEditLogic",
      "wantsIsCreating": true,
      "wantsSpecifiedParameters": true,
      "wantsHiddenBodies": true,
      "wantsClickedButton": false
    },
    "manipulatorChangeFunction": "loftManipulator",
    "filterSelectors": ["allparts"],
    "sourceMicroversionId": "c82a8320dcd9a046ae970d97",
    "linkedLocationName": "",
    "namespace": "efe34be09d873042ef093975c::mc82a8320dcd9a046ae970d97",
    "groups": [{
      "btType": "BTParameterGroupSpec-3469",
      "drivingParameterId": "",
      "collapsedByDefault": false,
      "groupOrParameterIds": ["startCondition", "adjacentFacesStart", "startMagnitude", "startDirection", "endCondition", "adjacentFacesEnd", "endMagnitude", "endDirection"],
      "groupName": "End conditions",
      "groupId": "fYVcFUfaTAUX"
    }, {
      "btType": "BTParameterGroupSpec-3469",
      "drivingParameterId": "matchConnections",
      "collapsedByDefault": false,
      "groupOrParameterIds": ["connections", "connectionEntities", "connectionEdgeQueries", "connectionEdgeParameters"],
      "groupName": "Connections",
      "groupId": "efMGUUEeCbIe"
    }],
    "featureType": "loft",
    "featureTypeName": "Loft",
    "uiHints": [],
    "sourceLocation": {
      "btType": "BTLocationInfo-226",
      "version": "c82a8320dcd9a046ae970d97",
      "character": 3183,
      "endLine": 463,
      "line": 89,
      "endColumn": 99,
      "languageVersion": 2770,
      "parseNodeId": "Pzvomt0khY7JsmEUb",
      "endCharacter": 22427,
      "column": 21,
      "moduleIds": {
        "btType": "BTDocumentVersionElementIds-1897",
        "versionId": "",
        "elementId": "fe34be09d873042ef093975c",
        "documentId": ""
      },
      "document": "fe34be09d873042ef093975c",
      "elementMicroversion": "c82a8320dcd9a046ae970d97",
      "nodeId": "fzCHuTSZQw02ZXvI",
      "topLevel": ""
    },
    "iconUri": ""
  }],
  "libraryVersion": 0,
  "sourceMicroversion": "67906a09f7b8d55c8a983b9d",
  "serializationVersion": "1.2.20"
};
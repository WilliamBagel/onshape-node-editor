/**
 * Fixtures for UI tests (issue #75).
 *
 *  (a) a document with exactly one Part Studio
 *  (b) a custom-feature node with a nested map input (definition)
 *  (c) a math node with typed sockets
 *
 * Fresh instances are built per call — nodes are mutable (titles, controls).
 */
import type { BTDocumentElementInfo, BTFeatureSpec129 } from 'onshape-typescript-fetch';
import type { DocumentContext } from '../onshape-utils/graphidentity';
import { CustomFeatureNode } from '../rete/nodes/customfeaturenode';
import { MathExpressionNode } from '../rete/nodes/mathexpressionnode';
import { FunctionNode } from '../rete/nodes/functionnode';

export const FIXTURE_CONTEXT: DocumentContext = { did: 'fake-doc', workspaceId: 'fake-ws' };

export function fixtureDocumentElements(): BTDocumentElementInfo[] {
  return [
    {
      id: 'fake-part-studio',
      elementType: 'PARTSTUDIO',
      name: 'Part Studio 1',
      isFullId: true,
      microversionId: 'fake-mv-1',
    } as unknown as BTDocumentElementInfo,
  ];
}

/** (a) Document with one Part Studio. */
export function makeSinglePartStudioDocument() {
  return {
    context: { ...FIXTURE_CONTEXT },
    elements: fixtureDocumentElements(),
    partStudioId: 'fake-part-studio',
  };
}

/** Minimal Box spec: two quantity params under the `definition` map. */
export function setUpBoxFeatureSpec(): BTFeatureSpec129 {
  return {
    btType: 'BTFeatureSpec-129',
    featureType: 'box',
    featureTypeName: 'Box',
    parameters: [
      {
        btType: 'BTParameterSpecQuantity-173',
        parameterId: 'height',
        parameterName: 'Height',
        defaultValue: {
          btType: 'BTMParameterQuantity-147',
          parameterId: 'height',
          value: 10,
          units: 'millimeter',
          expression: '10 mm',
        },
      },
      {
        btType: 'BTParameterSpecQuantity-173',
        parameterId: 'width',
        parameterName: 'Width',
        defaultValue: {
          btType: 'BTMParameterQuantity-147',
          parameterId: 'width',
          value: 20,
          units: 'millimeter',
          expression: '20 mm',
        },
      },
      {
        btType: 'BTParameterSpecString-175',
        parameterId: 'label',
        parameterName: 'Label',
        defaultValue: {
          btType: 'BTMParameterString-149',
          parameterId: 'label',
          value: 'box-1',
        },
      },
    ],
  } as unknown as BTFeatureSpec129;
}

/** (b) Custom-feature node carrying a nested map input. */
export function makeCustomFeatureNodeWithMap() {
  const node = new CustomFeatureNode(setUpBoxFeatureSpec());
  // Start collapsed so tests can prove expand actually flips state.
  const definition = node.getDefinitionInput() as unknown as { expanded: boolean };
  definition.expanded = false;
  return node;
}

/** (c) Math node with typed sockets: number inputs -> number output. */
export function makeMathNode(source = 'length * width') {
  return new MathExpressionNode(source);
}

export function makeFunctionNode() {
  return new FunctionNode(
    {
      key: 'Math::cross',
      name: 'cross',
      category: 'Math',
      file: 'f',
      descriptor: 'd',
      signature: 'cross(a, b)',
      description: 'Cross product',
      kind: 'value',
      nodeable: true,
      inputs: [
        { name: 'a', valueType: 'Vector', scrapedType: 'Vector', description: '' },
        { name: 'b', valueType: 'Vector', scrapedType: 'Vector', description: '' },
      ],
      outputs: [{ name: 'return', valueType: 'Vector', scrapedType: 'Vector', description: '' }],
    } as never,
    { displayName: 'cross' },
  );
}

/** Graph assembly: custom-feature node + math node, ready to mount. */
export function makeHarnessGraph() {
  const feature = makeCustomFeatureNodeWithMap();
  const math = makeMathNode();
  return { feature, math, nodes: [feature, math] };
}

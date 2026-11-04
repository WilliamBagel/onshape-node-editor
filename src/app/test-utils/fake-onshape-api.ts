/**
 * Fake Onshape document/element API for UI tests (issue #75).
 *
 * Implements only the injection seams used by App-scoped code:
 *  - `documentApi.getElementsInDocument` (partstudiotarget / graphidentity)
 *  - `featureStudioApi` slices (create/getContents/updateContents)
 *  - `partStudioApi.addPartStudioFeature` (partstudiofeature)
 * No HTTP, no iframe, no postMessage. All calls are recorded.
 */
import type { BTDocumentElementInfo } from 'onshape-typescript-fetch';

export interface FakeApiCall {
  api: string;
  method: string;
  request: unknown;
}

export interface FakeDocumentShape {
  did: string;
  workspaceId: string;
  elements: BTDocumentElementInfo[];
}

const NOOP = async () => ({});

export class FakeOnshapeApi {
  calls: FakeApiCall[] = [];
  documentId: string;
  workspaceId: string;
  elements: BTDocumentElementInfo[];
  featureStudioContents: unknown = null;
  addFeatureResult: unknown = { success: true };

  constructor(doc?: Partial<FakeDocumentShape>) {
    this.documentId = doc?.did ?? 'fake-doc';
    this.workspaceId = doc?.workspaceId ?? 'fake-ws';
    this.elements = doc?.elements ?? [
      {
        id: 'fake-part-studio',
        elementType: 'PARTSTUDIO',
        name: 'Part Studio 1',
        isFullId: true,
        microversionId: 'fake-mv-1',
      } as unknown as BTDocumentElementInfo,
    ];
  }

  record(api: string, method: string, request: unknown) {
    this.calls.push({ api, method, request });
  }

  callsFor(api: string, method?: string) {
    return this.calls.filter((c) => c.api === api && (method == null || c.method === method));
  }

  get documentApi() {
    const self = this;
    return {
      async getElementsInDocument(request: { did: string; wvm: string; wvmid: string }) {
        self.record('documentApi', 'getElementsInDocument', request);
        return self.elements;
      },
      async getDocument(request: { did: string }) {
        self.record('documentApi', 'getDocument', request);
        return { id: self.documentId, name: 'Fake Document', isFullId: true };
      },
      async createDocument(request: unknown) {
        self.record('documentApi', 'createDocument', request);
        return { id: self.documentId, name: 'Fake Document', isFullId: true };
      },
    };
  }

  get featureStudioApi() {
    const self = this;
    return {
      async getFeatureStudioContents(request: unknown) {
        self.record('featureStudioApi', 'getFeatureStudioContents', request);
        return self.featureStudioContents ?? { contents: '', isFullId: true };
      },
      async updateFeatureStudioContents(request: unknown) {
        self.record('featureStudioApi', 'updateFeatureStudioContents', request);
        return { contents: '', isFullId: true };
      },
      async createFeatureStudio(request: unknown) {
        self.record('featureStudioApi', 'createFeatureStudio', request);
        return {
          id: 'fake-feature-studio',
          elementType: 'FEATURESTUDIO',
          name: 'Fake Feature Studio',
          isFullId: true,
          microversionId: 'fake-mv-1',
        } as unknown as BTDocumentElementInfo;
      },
      async getFeatureStudioSpecs() {
        self.record('featureStudioApi', 'getFeatureStudioSpecs', null);
        return { specs: [], isFullId: true };
      },
    };
  }

  get partStudioApi() {
    const self = this;
    return {
      async addPartStudioFeature(request: unknown) {
        self.record('partStudioApi', 'addPartStudioFeature', request);
        return self.addFeatureResult;
      },
      async deletePartStudioFeature(request: unknown) {
        self.record('partStudioApi', 'deletePartStudioFeature', request);
        return {};
      },
    };
  }

  get elementApi() {
    const self = this;
    return {
      async getElement(request: unknown) {
        self.record('elementApi', 'getElement', request);
        return { id: 'fake-part-studio', name: 'Part Studio 1', isFullId: true };
      },
    };
  }

  /** Drop recorded calls but keep fixtures. */
  resetCalls() {
    this.calls = [];
  }
}

export function createFakeOnshapeApi(doc?: Partial<FakeDocumentShape>): FakeOnshapeApi {
  return new FakeOnshapeApi(doc);
}

// Minimal request/response shapes shared by the plain-Node HTTP handlers.
// Replaces the @azure/functions types used before the Azure Web App
// migration (#28). Handlers keep the old call shape: receive a request
// object with query/headers/arrayBuffer, return { status, headers, body }.

export type HeaderMap = Record<string, string> & {
  forEach(callback: (value: string, key: string) => void): void;
};

export interface HttpRequest {
  method?: string;
  /** Full request URL, same shape as the Azure Functions HttpRequest.url. */
  url?: string;
  query: URLSearchParams;
  headers: HeaderMap;
  body?: any;
  protocol?: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface HttpResponseInit {
  status?: number;
  headers?: Record<string, string>;
  body?: any;
}

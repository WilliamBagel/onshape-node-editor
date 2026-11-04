import fetch from "node-fetch";
import { HttpRequest, HttpResponseInit } from "./httpTypes";
import { parseOnshapeBase, resolvesToPublicAddress, fetchWithTimeout } from "./security";
require('dotenv').config();

export default async function (request: HttpRequest, context?: any): Promise<HttpResponseInit> {
  try {
    const boundPath = (context && (context as any).bindingData && (context as any).bindingData.path) as string | undefined;

    const parsedUrl = new URL(request.url || '/', 'http://localhost');
    let forwardPath = '';
    if (boundPath && boundPath.length > 0) {
      forwardPath = '/' + boundPath.replace(/^\/+/, '');
    } else {
      forwardPath = parsedUrl.pathname.replace(/^\/api(\/|$)/, '/');
    }

    const queryString = parsedUrl.search ? parsedUrl.search : '';

    // #38: `x-server` is client-supplied — allowlist it before any fetch.
    const headersMap: Record<string, string> = {};
    request.headers.forEach((v, k) => (headersMap[k.toLowerCase()] = v));
    const rawServer = headersMap['x-server'] || 'https://cad.onshape.com';

    const base = parseOnshapeBase(rawServer);
    if (!base) {
      return { status: 400, headers: { 'Content-Type': 'text/plain' }, body: 'x-server not allowed' };
    }
    if (!(await resolvesToPublicAddress(base.hostname))) {
      return { status: 400, headers: { 'Content-Type': 'text/plain' }, body: 'x-server not allowed' };
    }

    const onshapeserver = base.origin + "/api";
    const targetUrl = onshapeserver + forwardPath + queryString;

    const hopByHop = new Set([
      'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te',
      'trailers', 'transfer-encoding', 'upgrade', 'host', 'content-length'
    ]);

    // #38: never forward Cookie or X-Server, and forward Authorization only
    // when it carries the Onshape bearer the client owns.
    const forwardHeaders: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      const lk = key.toLowerCase();
      if (hopByHop.has(lk)) return;
      if (lk === 'cookie' || lk === 'x-server') return;
      if (lk === 'authorization' && !/^Bearer\s+\S+/i.test(value)) return;
      if (lk === 'content-type') {
        let sanitized = value.replace(/;\s*qs=[^;]+/i, '');
        sanitized = sanitized.replace(/;\s*$/, '').trim();
        forwardHeaders['Content-Type'] = sanitized;
      } else {
        forwardHeaders[key] = value;
      }
    });

    const method = (request.method || 'GET').toUpperCase();
    let body: any = undefined;

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      try {
        body = await request.arrayBuffer()
        if (!forwardHeaders['Content-Type'] && body && typeof body === 'string') {
          const t = body.trim();
          if (t.startsWith('{') || t.startsWith('[')) {
            forwardHeaders['Content-Type'] = 'application/json';
          }
        }
      } catch (e) {
        return { status: 400, headers: { 'Content-Type': 'text/plain' }, body: 'Failed to read request body' };
      }
    }

    const fetchOptions: any = { method, headers: forwardHeaders, redirect: 'manual' };
    if (body !== undefined) fetchOptions.body = body;

    let upstream: fetch.Response;
    try {
      upstream = await fetchWithTimeout(fetch, targetUrl, fetchOptions);
    } catch (err: any) {
      // #51: log detail server-side, return a generic error.
      console.error('api upstream fetch failed', err?.message || err);
      return { status: 502, headers: { 'Content-Type': 'text/plain' }, body: 'upstream error' };
    }

    if (!upstream.ok) {
      let errBody = '';
      try { errBody = await upstream.text(); } catch { errBody = ''; }
      // #51: never return the upstream body — log it, echo only the status.
      console.error(`api upstream returned ${upstream.status}`, errBody.slice(0, 500));
      return { status: upstream.status, headers: { 'Content-Type': 'text/plain' }, body: 'upstream error' };
    }

    const responseBody = await upstream.arrayBuffer();

    const responseHeaders: Record<string, string> = {
      'Cache-Control': 'max-age=0, no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': 'Thu, 1 Jan 1970 00:00:00 GMT'
    };
    const contentType = upstream.headers.get('content-type');
    if (contentType) responseHeaders['Content-Type'] = contentType;
    // #38: Proxy-Url (the upstream URL) is intentionally not returned.

    return { status: upstream.status, headers: responseHeaders, body: responseBody };
  } catch (err: any) {
    console.error('api handler failed', err?.message || err);
    return { status: 502, headers: { 'Content-Type': 'text/plain' }, body: 'bad gateway' };
  }
}

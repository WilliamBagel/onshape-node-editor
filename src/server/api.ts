//
//  Copyright (c) 2023 John Toebes
// 
//  Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
// 
//  1. Redistributions of source code must retain the above copyright notice,
//     this list of conditions and the following disclaimer.
// 
//  2. Redistributions in binary form must reproduce the above copyright notice,
//     this list of conditions and the following disclaimer in the documentation
//     and/or other materials provided with the distribution.
// 
//  3. Neither the name of the copyright holder nor the names of its contributors
//     may be used to endorse or promote products derived from this software
//     without specific prior written permission.
// 
//  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
//  ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
//  WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
//  IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
//  INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
//  BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
//  DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
//  LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE
//  OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
//  EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//
// This file is generated via GPT-5 mini using the reference file php https://github.com/Team2901/OnshapeInsertTool/blob/main/server/api/api.php
// Copyright notice included from reference file
// Manual edits by William Degele

import fetch from "node-fetch";
import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
require('dotenv').config();

export default async function (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    // Prefer the bound wildcard path (route: "api/{*path}") provided by Azure Functions.
    // This yields only the portion after /api/, which is what we want to forward.
    const boundPath = (context && (context as any).bindingData && (context as any).bindingData.path) as string | undefined;

    // Fallback: if no bindingData.path, remove leading "/api" from request.pathname
    const parsedUrl = new URL(request.url);
    let forwardPath = '';
    if (boundPath && boundPath.length > 0) {
      forwardPath = '/' + boundPath.replace(/^\/+/, '');
    } else {
      // remove first /api segment if present
      forwardPath = parsedUrl.pathname.replace(/^\/api(\/|$)/, '/');
    }

    // Preserve original query string
    const queryString = parsedUrl.search ? parsedUrl.search : '';

    // Grab x-server header (target Onshape host), fallback to CLIENT_URL or cad.onshape.com
    const headersMap: Record<string, string> = {};
    request.headers.forEach((v, k) => (headersMap[k.toLowerCase()] = v));
    const onshapeserver = (headersMap['x-server'] || 'https://cad.onshape.com') + "/api" //.replace(/\/+$/, '');

    const targetUrl = onshapeserver + forwardPath + queryString;

    // Build outgoing headers (filter hop-by-hop)
    const hopByHop = new Set([
      'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te',
      'trailers', 'transfer-encoding', 'upgrade', 'host'
    ]);

    const forwardHeaders: Record<string, string> = {};
    // Build headers once, skip hop-by-hop. Sanitize Content-Type (remove invalid params like "; qs=0.09"),
    // and normalize its casing to "Content-Type" to avoid duplicates.
    request.headers.forEach((value, key) => {
      const lk = key.toLowerCase();
      if (hopByHop.has(lk)) return;
      if (lk === 'content-type') {
        // Remove any "qs" param or other unknown params but keep charset if present.
        let sanitized = value.replace(/;\s*qs=[^;]+/i, '');
        // Trim stray trailing semicolons/whitespace
        sanitized = sanitized.replace(/;\s*$/, '').trim();
        forwardHeaders['Content-Type'] = sanitized;
      } else {
        // Preserve original header key casing as provided
        forwardHeaders[key] = value;
      }
    });

    // Only include body for methods that allow it
    const method = (request.method || 'GET').toUpperCase();
    let body: any = undefined;

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      try {
        body = await request.arrayBuffer()
        // If no Content-Type was forwarded but the body looks like JSON, set a sensible default.
        if (!forwardHeaders['Content-Type'] && body && typeof body === 'string') {
          const t = body.trim();
          if (t.startsWith('{') || t.startsWith('[')) {
            forwardHeaders['Content-Type'] = 'application/json';
          }
        }
      } catch (e) {
        return {
          status: 400,
          headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' },
          body: 'Failed to read request body'
        };
      }
    }

    let responseBody

    const fetchOptions: any = {
      method,
      headers: forwardHeaders,
      redirect: 'manual'
    };

    if (body !== undefined) {
      fetchOptions.body = body;
    }

    let upstream: fetch.Response;
    try {
      // Fetch upstream
      upstream = await fetch(targetUrl, fetchOptions);
      // If error response, try to get error details
      if (!upstream.ok) {
        let errBody = '';
        try {
          errBody = await upstream.text();
        } catch (e) {
          errBody = `Status ${upstream.status}`;
        }
        throw new Error(errBody)
      }
    } catch(err) {
      return {
        status: err?.status || 400,
        headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' },
        body: err
      };
    }
    // Read upstream response
    responseBody = await upstream.arrayBuffer();

    // Build response headers (keep consistent no-cache/CORS headers used elsewhere)
    const responseHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'max-age=0, no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': 'Thu, 1 Jan 1970 00:00:00 GMT'
    };
    const contentType = upstream.headers.get('content-type');
    if (contentType) responseHeaders['Content-Type'] = contentType;
    responseHeaders['Proxy-Url'] = targetUrl;

    return {
      status: upstream.status,
      headers: responseHeaders,
      body: responseBody
    };

  } catch (err: any) {
    return {
      status: 502,
      headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' },
      body: err
    };
  }
}

module.exports = exports.default;
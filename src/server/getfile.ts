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
//  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS “AS IS” AND
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
// This file is generated via GPT-5 mini using the reference file php https://github.com/Team2901/OnshapeInsertTool/blob/main/server/getfile.php
// and improved with Claude
// Copyright notice included from reference file

import fetch from "node-fetch";
import { HttpRequest, HttpResponseInit } from "./httpTypes";
import { fetchWithTimeout, readBoundedBody, resolvesToPublicAddress, UpstreamBodyError } from "./security";

export default async function (request: HttpRequest, _context?: any): Promise<HttpResponseInit> {

  const q = request.query;
  const body = request.method === 'POST' ? request.body : undefined;
  const url = (q && q.get('url')) || (body && body['url']);
  if (!url) {
    return { status: 400, body: "missing url" };
  }

  // validate URL
  let parsed: URL;
  try {
    parsed = new URL(url);
    // Hardened: https only, no userinfo, no non-standard port.
    if (parsed.protocol !== 'https:') {
      return { status: 400, body: 'invalid url protocol' };
    }
    if (parsed.username || parsed.password) {
      return { status: 400, body: 'invalid url' };
    }
    if (parsed.port && parsed.port !== '443') {
      return { status: 400, body: 'invalid url' };
    }
    // #28: /getfile used to forward any http(s) URL (an open proxy). Allowlist
    // the only host the client fetches from (baseapp.getOnshapeFile pulls
    // Onshape pages/CSS from cad.onshape.com); everything else is refused.
    const ALLOWED_HOSTS = new Set(['cad.onshape.com']);
    if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
      return { status: 403, body: 'url not allowed' };
    }
  } catch (e) {
    return { status: 400, body: 'invalid url' };
  }

  // #80: same DNS/private-IP defence-in-depth as api.ts; generic error.
  if (!(await resolvesToPublicAddress(parsed.hostname))) {
    return { status: 403, body: 'url not allowed' };
  }

  try {
    // #49: forward only Accept / Accept-Language — never Authorization,
    // Cookie, or anything else the browser attached.
    const forwardHeaders: Record<string, string> = {};
    const passThrough = ['accept', 'accept-language'];
    request.headers.forEach((value, key) => {
      if (passThrough.includes(key.toLowerCase())) {
        forwardHeaders[key] = value;
      }
    });

    const response = await fetchWithTimeout(fetch, url, {
      method: request.method || 'GET',
      headers: forwardHeaders,
      redirect: 'manual'
    });
    
    // #80: never echo an upstream error page verbatim.
    const upstreamOk = response.ok !== undefined ? response.ok : (response.status >= 200 && response.status < 300);
    if (!upstreamOk) {
      console.error(`getfile upstream returned ${response.status}`);
      return { status: 502, body: 'upstream error' };
    }
    let buf: Buffer;
    try {
      buf = await readBoundedBody(response);
    } catch (err: any) {
      if (err instanceof UpstreamBodyError) {
        console.error('getfile upstream body rejected', err.reason);
        const status = err.reason === 'timeout' ? 504 : 502;
        return { status, body: 'upstream error' };
      }
      throw err;
    }
    
    // Get the content-type from the response
    const contentType = response.headers.get('content-type');
    const responseHeaders: Record<string, string> = {};
    
    if (contentType) {
      responseHeaders['Content-Type'] = contentType;
    }
    
    return {
      status: response.status,
      headers: responseHeaders,
      body: buf
    };
  } catch (err: any) {
    // #51: log detail server-side, return a generic error.
    console.error('getfile upstream fetch failed', err?.message || err);
    return { status: 502, body: 'upstream error' };
  }
}

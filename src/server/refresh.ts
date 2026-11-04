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
// This file is generated via GPT-5 mini using the reference file php https://github.com/Team2901/OnshapeInsertTool/blob/main/server/refresh.php
// Copyright notice included from reference file

import fetch from "node-fetch";
import { HttpRequest, HttpResponseInit } from "./httpTypes";
import { CLIENT_URL, CLIENT_ID, CLIENT_SECRET } from "./config";
import { fetchWithTimeout } from "./security";

export default async function (request: HttpRequest, _context?: any): Promise<HttpResponseInit> {
  // #49: the refresh token is accepted only from the POST body (form or
  // JSON). A credential in the query string would land in access logs,
  // proxies and referrers, so reject it outright.
  const qs = request.query as URLSearchParams | undefined;
  if (qs && (qs.has('refresh_token') || qs.has('refreshToken'))) {
    return { status: 400, body: 'refresh token must be sent in the request body' };
  }

  const body = (request.body && typeof request.body === 'object') ? request.body : {};
  const refresh_token = body.refresh_token || body.refreshToken;
  if (typeof refresh_token !== 'string' || refresh_token === '') {
    return { status: 400, body: 'missing refresh token' };
  }

  if (!CLIENT_URL) {
    return { status: 500, body: 'server configuration error' };
  }

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refresh_token);
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);

    const response = await fetchWithTimeout(fetch, CLIENT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const json = await response.json();
    // #51: never forward upstream headers verbatim (set-cookie, etc.).
    // Only the headers this endpoint needs are echoed back.
    const safeHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      // #49: token responses must never be stored.
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': 'Thu, 1 Jan 1970 00:00:00 GMT'
    };
    return { status: response.status, body: JSON.stringify(json), headers: safeHeaders };
  } catch (err: any) {
    console.error('refresh failed', err?.message || err);
    return { status: 502, body: 'upstream error' };
  }
}

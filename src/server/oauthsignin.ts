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
// This file is generated via GPT-5 mini using the reference file php https://github.com/Team2901/OnshapeInsertTool/blob/main/server/oauthsignin.php
// and improved with Claude
// Copyright notice included from reference file

import { HttpRequest, HttpResponseInit } from "./httpTypes";
import { CLIENT_ID } from "./config";
import { getCanonicalBaseUrl, InvalidBaseUrlError, isAllowedRedirectOnshapeUri } from "./security";
require('dotenv').config()

// This endpoint constructs an Onshape OAuth authorize redirect similar to the PHP original
export default async function (request: HttpRequest, _context?: any): Promise<HttpResponseInit> {
  const qs = request.query as URLSearchParams | undefined;
  const redirectOnshapeUri = qs ? qs.get('redirectOnshapeUri') : undefined;

  if (!redirectOnshapeUri) {
    return { status: 400, body: 'missing redirectOnshapeUri' };
  }

  // #51: the bounce-back target must be an Onshape host over https.
  if (!isAllowedRedirectOnshapeUri(redirectOnshapeUri)) {
    return { status: 400, body: 'redirectOnshapeUri not allowed' };
  }

  // #51: misconfiguration fails fast instead of minting a bogus authorize URL.
  if (!CLIENT_ID) {
    return { status: 500, body: 'server configuration error' };
  }

  const parsed = new URL(request.url || '/oauthsignin', 'http://localhost');

  // #51: prefer the configured canonical base URL over the (untrusted)
  // Host / X-Forwarded-* headers when building the registered redirect_uri.
  let canonical: string | null;
  try {
    canonical = getCanonicalBaseUrl();
  } catch (err) {
    // #80: invalid SERVER_BASE_URL fails fast — never fall back to Host.
    if (err instanceof InvalidBaseUrlError) {
      return { status: 500, body: 'server configuration error' };
    }
    throw err;
  }
  let scriptBase: string;
  if (canonical) {
    scriptBase = canonical;
  } else {
    const headers = request.headers || {};
    const host = headers['host'] || headers['Host'];
    // Validate the fallback Host header strictly (host[:port], no tricks).
    if (!host || !/^[A-Za-z0-9.-]+(?::[0-9]+)?$/.test(host)) {
      return { status: 400, body: 'missing or invalid host header' };
    }
    const protoHeader = headers['x-forwarded-proto'] || (request as any).protocol || 'https';
    const proto = typeof protoHeader === 'string' && protoHeader.split(',')[0].trim().toLowerCase();
    if (proto !== 'http' && proto !== 'https') {
      return { status: 400, body: 'missing or invalid host header' };
    }
    scriptBase = `${proto}://${host}`;
  }

  const script_uri = scriptBase + parsed.pathname;
  // #51: the nested value is encoded on its own so &, # or ? inside it
  // can't break out of the parameter; the whole redirect_uri is then
  // encoded again as a single query value.
  const redirect_uri = `${script_uri}?redirectOnshapeUri=${encodeURIComponent(redirectOnshapeUri)}`;
  const onshape_uri = `https://oauth.onshape.com/oauth/authorize?response_type=code&redirect_uri=${encodeURIComponent(redirect_uri)}&client_id=${encodeURIComponent(CLIENT_ID)}`;

  return { status: 302, headers: { Location: onshape_uri } };
}

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

import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { CLIENT_ID } from "./config";
require('dotenv').config()

// This endpoint constructs an Onshape OAuth authorize redirect similar to the PHP original
export default async function (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  const qs = request.query as URLSearchParams | undefined;
  const redirectOnshapeUri = qs ? qs.get('redirectOnshapeUri') : undefined;

  if (!redirectOnshapeUri) {
    return { status: 400, body: 'missing redirectOnshapeUri' };
  }

  // Determine script uri from request headers
  const headers = request.headers || {};
  const host = headers['host'] || headers['Host'];
  if (!host) {
    return { status: 400, body: 'missing host header' };
  }
  const proto = headers['x-forwarded-proto'] || (request as any).protocol || 'https';
  const script_uri = `${proto}://${host}${request.url || ''}`;

  const onshape_uri = `https://oauth.onshape.com/oauth/authorize?response_type=code&redirect_uri=${encodeURIComponent(script_uri + '?redirectOnshapeUri=' + redirectOnshapeUri)}&client_id=${CLIENT_ID}`;

  return { status: 302, headers: { Location: onshape_uri } };
}

module.exports = exports.default;
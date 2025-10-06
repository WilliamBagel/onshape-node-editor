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
// Copyright notice included from reference file

import { HttpResponseInit } from "@azure/functions";
import { openalog, oalog, closealog, CLIENT_ID } from "./config";

// This endpoint constructs an Onshape OAuth authorize redirect similar to the PHP original
export default async function (_context: any, req: any): Promise<HttpResponseInit> {
  const log = openalog();
  oalog(log, 'oauthsignin called');

  const redirectOnshapeUri = req.query.redirectOnshapeUri || (req.body && req.body.redirectOnshapeUri);

  if (!redirectOnshapeUri) {
    oalog(log, 'missing redirectOnshapeUri');
    closealog(log);
    return { status: 400, body: 'missing redirectOnshapeUri' };
  }

  // Determine script uri from request headers
  const host = req.headers && (req.headers.host || req.headers.Host);
  if (!host) {
    oalog(log, 'missing host header');
    closealog(log);
    return { status: 400, body: 'missing host header' };
  }
  const proto = req.headers && (req.headers['x-forwarded-proto'] || req.protocol || 'https');
  const script_uri = `${proto}://${host}${req.url || ''}`;

  const onshape_uri = `https://oauth.onshape.com/oauth/authorize?response_type=code&redirect_uri=${encodeURIComponent(script_uri + '?redirectOnshapeUri=' + redirectOnshapeUri)}&client_id=${CLIENT_ID}`;

  oalog(log, 'redirecting to ' + onshape_uri);
  closealog(log);
  return { status: 302, headers: { Location: onshape_uri } };
}

module.exports = exports.default;

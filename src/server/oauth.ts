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
// This file is generated via GPT-5 mini using the reference file php https://github.com/Team2901/OnshapeInsertTool/blob/main/server/oauth.php
// Copyright notice included from reference file

import fetch from "node-fetch";
import { HttpResponseInit } from "@azure/functions";
import { openalog, oalog, closealog, CLIENT_URL, CLIENT_ID, CLIENT_SECRET } from "./config";

export default async function (_context: any, req: any): Promise<HttpResponseInit> {
  const log = openalog();
  oalog(log, '\n-------\nREQUEST for oauth');

  // For token exchange, expect code and redirect_uri in query or body
  const code = req.query.code || (req.body && req.body.code);
  const redirect_uri = req.query.redirect_uri || (req.body && req.body.redirect_uri);

  if (!code) {
    oalog(log, 'missing code');
    closealog(log);
    return { status: 400, body: 'missing code' };
  }

  if (!CLIENT_URL) {
    oalog(log, 'server misconfiguration: CLIENT_URL not set');
    closealog(log);
    return { status: 500, body: 'server configuration error' };
  }

  if (typeof code !== 'string') {
    oalog(log, 'invalid code');
    closealog(log);
    return { status: 400, body: 'invalid code' };
  }

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);
    if (redirect_uri) params.append('redirect_uri', redirect_uri);

    const response = await fetch(CLIENT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const json = await response.json();
    oalog(log, 'RESPONSE: ' + JSON.stringify(json));
    closealog(log);
    return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body: JSON.stringify(json) };
  } catch (err: any) {
    oalog(log, 'error: ' + String(err));
    closealog(log);
    return { status: 502, body: String(err.message || err) };
  }
}

module.exports = exports.default;

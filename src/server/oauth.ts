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
// Converted from PHP to TypeScript Azure Function using Claude and GPT-5 mini
// Original source: https://github.com/Team2901/OnshapeInsertTool/blob/main/server/oauth.php

import fetch from "node-fetch";
import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
require('dotenv').config()

const CLIENT_URL = process.env.CLIENT_URL;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

export default async function (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  const code = request.query.get('code');
  const redirect_uri = request.query.get('redirect_uri');

  // Validate required parameters
  if (!code) {
    return {
      status: 400,
      body: JSON.stringify({ error: 'missing code' })
    };
  }

  // Validate server configuration
  if (!CLIENT_URL || !CLIENT_ID || !CLIENT_SECRET) {
    return {
      status: 500,
      body: JSON.stringify({ error: 'server configuration error' })
    };
  }

  try {
    // Build the OAuth token request
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);
    if (redirect_uri) {
      params.append('redirect_uri', redirect_uri);
    }

    // Make the request to exchange authorization code for access token
    const response = await fetch(CLIENT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const json = await response.json();

    // Set response headers matching .htaccess configuration
    const responseHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'max-age=0, no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': 'Thu, 1 Jan 1970 00:00:00 GMT'
    };

    return {
      status: response.status,
      headers: responseHeaders,
      body: JSON.stringify(json)
    };

  } catch (err: any) {
    return {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'request_failed',
        message: String(err.message || err)
      })
    };
  }
}

module.exports = exports.default;
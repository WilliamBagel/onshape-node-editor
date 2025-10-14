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
import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

export default async function (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {

  const q = request.query;
  const body = request.method === 'POST' ? request.body : undefined;
  const url = (q && q.get('url')) || (body && body['url']);
  if (!url) {
    return { status: 400, body: "missing url" };
  }

  // validate URL
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { status: 400, body: 'invalid url protocol' };
    }
  } catch (e) {
    return { status: 400, body: 'invalid url' };
  }

  try {
    // Filter out headers that shouldn't be forwarded
    const forwardHeaders: Record<string, string> = {};
    const skipHeaders = ['host', 'connection', 'content-length', 'transfer-encoding'];
    
    request.headers.forEach((value, key) => {
      if (!skipHeaders.includes(key.toLowerCase())) {
        forwardHeaders[key] = value;
      }
    });

    const response = await fetch(url, { 
      method: request.method || 'GET', 
      headers: forwardHeaders
    });
    
    const buf = await response.arrayBuffer();
    
    // Get the content-type from the response
    const contentType = response.headers.get('content-type');
    const responseHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*'
    };
    
    if (contentType) {
      responseHeaders['Content-Type'] = contentType;
    }
    
    return {
      status: response.status,
      headers: responseHeaders,
      body: Buffer.from(buf)
    };
  } catch (err: any) {
    return { status: 502, body: String(err.message || err) };
  }
}

module.exports = exports.default;

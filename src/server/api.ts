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
// Converted from PHP to TypeScript Azure Function using Claude
// Original source: https://github.com/Team2901/OnshapeInsertTool/blob/main/server/api/api.php

import fetch from "node-fetch";
import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
require('dotenv').config()

export default async function (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {

  try {    
    // Log request information
    const requestInfo = {
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      query: request.query ? Object.fromEntries(request.query.entries()) : {}
    };

    // Extract the API path from the request URL
    // In Azure Functions, the route is available in the request
    const url = new URL(request.url);
    const apiurl = url.pathname;

    // Capture all relevant parameters from the request
    const authorization = request.headers.get('authorization') || '';
    const querystring = url.search.substring(1); // Remove the leading '?'
    const method = request.method || 'GET';
    const content_type = request.headers.get('content-type') || '';
    const user_agent = request.headers.get('user-agent') || '';
    const platform = request.headers.get('sec-ch-ua-platform') || '';
    const accept = request.headers.get('accept') || '';
    const onshapeserver = request.headers.get('x-server') || '';

    // Construct the Onshape API URL
    const onshapeapi = onshapeserver + apiurl + (querystring ? '?' + querystring : '');

    // Prepare headers for the outgoing request
    const headers: Record<string, string> = {
      'Content-Type': content_type,
      'User-Agent': user_agent,
      'accept': accept
    };

    if (authorization) {
      headers['authorization'] = authorization;
    }
    if (platform) {
      headers['sec-ch-ua-platform'] = platform;
    }

    // Get POST data if applicable
    let postData: string | undefined;
    if (method === "POST") {
      try {
        const body = await request.text();
        postData = body;
      } catch (err) {
      }
    }

    // Make the request
    const fetchOptions: any = {
      method: method,
      headers: headers
    };

    if (postData && method === "POST") {
      fetchOptions.body = postData;
    }

    const response = await fetch(onshapeapi, fetchOptions);
    const responseBuffer = await response.arrayBuffer();
    const responseBytes = Buffer.from(responseBuffer);

    // Log response info
    const info = {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      content_type: response.headers.get('content-type')
    };
    console.log(info);

    // Return the response with appropriate headers
    const responseHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'max-age=0, no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': 'Thu, 1 Jan 1970 00:00:00 GMT'
    };

    const responseContentType = response.headers.get('content-type');
    if (responseContentType) {
      responseHeaders['Content-Type'] = responseContentType;
    }

    return {
      status: response.status,
      headers: responseHeaders,
      body: responseBytes
    };

  } catch (err: any) {
    return {
      status: 502,
      body: String(err.message || err)
    };
  }
}

module.exports = exports.default;
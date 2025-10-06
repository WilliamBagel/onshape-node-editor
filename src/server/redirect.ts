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
// This file is generated via GPT-5 mini using the reference file php https://github.com/Team2901/OnshapeInsertTool/blob/main/server/redirect.php
// Copyright notice included from reference file
import { HttpResponseInit } from "@azure/functions";
import { openalog, oalog, closealog, APP_NAME } from "./config";

export default async function (_context: any, req: any): Promise<HttpResponseInit> {
  const log = openalog();
  const client_id = req.query?.client_id || req.body?.client_id;
  const documentId = req.query?.documentId || req.body?.documentId;
  const workspaceId = req.query?.workspaceId || req.body?.workspaceId;
  const elementId = req.query?.elementId || req.body?.elementId;

  if (!client_id || !documentId || !workspaceId || !elementId) {
    oalog(log, `Missing params client_id=${client_id} documentId=${documentId} workspaceId=${workspaceId} elementId=${elementId}`);
    closealog(log);
    return { status: 400, body: 'Missing required parameters' };
  }

  if (typeof client_id !== 'string' || typeof documentId !== 'string' || typeof workspaceId !== 'string' || typeof elementId !== 'string') {
    oalog(log, 'invalid parameter types');
    closealog(log);
    return { status: 400, body: 'invalid parameter types' };
  }

  const appName = APP_NAME || '';

  const redirectUrl = `https://oauth.onshape.com/oauth/authorize?response_type=code&client_id=${encodeURIComponent(client_id)}&redirect_uri=${encodeURIComponent(`https://ftconshape.com/${appName}/?documentId=${documentId}&workspaceId=${workspaceId}&elementId=${elementId}`)}`;
  oalog(log, 'Redirecting to: ' + redirectUrl);
  closealog(log);
  return { status: 302, headers: { Location: redirectUrl } };
}

module.exports = exports.default;

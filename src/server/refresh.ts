import fetch from "node-fetch";
import { HttpResponseInit } from "@azure/functions";

export default async function (_context: any, req: any): Promise<HttpResponseInit> {
  const url = req.query.url || (req.body && req.body.url);
  if (!url) return { status: 400, body: "missing url" };

  try {
    const response = await fetch(url, { method: req.method, headers: req.headers, body: req.rawBody && Buffer.from(req.rawBody) });
    const body = await response.text();
    return { status: response.status, body, headers: Object.fromEntries(response.headers.entries()) };
  } catch (err: any) {
    return { status: 502, body: String(err.message || err) };
  }
}

module.exports = exports.default;

import fetch from "node-fetch";
import { HttpResponseInit } from "@azure/functions";

export default async function (_context: any, req: any): Promise<HttpResponseInit> {
  const url = req.query.url || (req.body && req.body.url);
  if (!url) return { status: 400, body: "missing url" };

  try {
    const response = await fetch(url, { method: 'GET', headers: req.headers });
    const text = await response.text();
    return { status: response.status, body: text };
  } catch (err: any) {
    return { status: 502, body: String(err.message || err) };
  }
}

module.exports = exports.default;

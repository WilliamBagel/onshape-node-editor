import { HttpResponseInit } from "@azure/functions";

export default async function (_context: any, req: any): Promise<HttpResponseInit> {
  const url = req.query.url || (req.body && req.body.url);
  if (!url) return { status: 400, body: "missing url" };
  return { status: 302, headers: { Location: url } };
}

module.exports = exports.default;

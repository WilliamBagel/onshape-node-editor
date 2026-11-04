export const ENABLE_LOG = process.env.ENABLE_LOG === '1' || process.env.ENABLE_LOG === 'true';
export const LOG_FILENAME = process.env.LOG_FILENAME || 'server.log';
export const CLIENT_ID = process.env.CLIENT_ID || '';
export const CLIENT_SECRET = process.env.CLIENT_SECRET || '';
export const CLIENT_URL = process.env.CLIENT_URL || ''; // token endpoint
export const APP_NAME = process.env.APP_NAME || '';
// #45: comma-separated additional allowed CORS origins. The default
// (GitHub Pages origin) is applied in security.ts; this is only extras.
export const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || process.env.CORS_ALLOWED_ORIGIN || '';
// #51: canonical public base URL of this server (e.g.
// https://myapp.azurewebsites.net). When set, /oauthsignin uses it for the
// `redirect_uri` instead of trusting the Host / X-Forwarded-* headers.
export const SERVER_BASE_URL = process.env.SERVER_BASE_URL || process.env.CANONICAL_BASE_URL || '';
// #39: upstream fetch deadline in ms (1000–30000, default 8000) and the
// request-body cap in bytes (1–5 MB, default 2 MB).
export const UPSTREAM_TIMEOUT_MS = process.env.UPSTREAM_TIMEOUT_MS || '';
export const MAX_BODY_BYTES = process.env.MAX_BODY_BYTES || '';

import * as fs from 'fs';
export const ENABLE_LOG = process.env.ENABLE_LOG === '1' || process.env.ENABLE_LOG === 'true';
export const LOG_FILENAME = process.env.LOG_FILENAME || 'server.log';
export const CLIENT_ID = process.env.CLIENT_ID || '';
export const CLIENT_SECRET = process.env.CLIENT_SECRET || '';
export const CLIENT_URL = process.env.CLIENT_URL || ''; // token endpoint
export const APP_NAME = process.env.APP_NAME || '';

export function openalog() {
  if (!ENABLE_LOG) return null;
  try {
    return fs.createWriteStream(LOG_FILENAME, { flags: 'a' });
  } catch (e) {
    return null;
  }
}

export function oalog(stream: fs.WriteStream | null, str: string) {
  if (!stream) return;
  stream.write(str + '\n');
}

export function closealog(stream: fs.WriteStream | null) {
  if (!stream) return;
  stream.end();
}

export const ENABLE_LOG = process.env.ENABLE_LOG === '1' || process.env.ENABLE_LOG === 'true';
export const LOG_FILENAME = process.env.LOG_FILENAME || 'server.log';
export const CLIENT_ID = process.env.CLIENT_ID || '';
export const CLIENT_SECRET = process.env.CLIENT_SECRET || '';
export const CLIENT_URL = process.env.CLIENT_URL || ''; // token endpoint
export const APP_NAME = process.env.APP_NAME || '';
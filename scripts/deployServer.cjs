// Zip-deploys dist/server to an Azure App Service Web App via the Kudu
// zipdeploy endpoint (`<name>.scm.azurewebsites.net/api/zipdeploy`) (#28).
// The same endpoint serves both Function Apps and Web Apps; nothing about
// this script is Functions-specific.
//
// Required environment (root .env or shell):
//   AZURE_PUBLISH_USER   SCM/publish username (fallback AZURE_USERNAME)
//   AZURE_PUBLISH_PASS   SCM/publish password (fallback AZURE_PASSWORD)
//   AZURE_WEBAPP_NAME    Web App name; AZURE_FUNCTIONAPP_NAME is still
//                        accepted as a fallback for existing .env files.
//
// Exits 1 loudly when any of them is missing or when `npm ci` fails.

const fs = require('fs');
const path = require('path');
const https = require('https');
const AdmZip = require('adm-zip');
require('dotenv').config();

const root = path.resolve(__dirname, '..');
const serverDir = path.join(root, 'dist', 'server');

const user = process.env.AZURE_PUBLISH_USER || process.env.AZURE_USERNAME;
const pass = process.env.AZURE_PUBLISH_PASS || process.env.AZURE_PASSWORD;
const appName = process.env.AZURE_WEBAPP_NAME || process.env.AZURE_FUNCTIONAPP_NAME;

if (!user || !pass || !appName) {
  console.error('Missing AZURE_PUBLISH_USER/AZURE_PUBLISH_PASS and AZURE_WEBAPP_NAME environment variables.');
  process.exit(1);
}

if (!fs.existsSync(serverDir)) {
  console.error('server dir not found, run `pnpm run build:server` first');
  process.exit(1);
}

// Install production dependencies inside dist/server to ensure runtime modules are present
console.log('Installing production dependencies into', serverDir);
const { spawnSync } = require('child_process');
const npmCmd = 'npm';

function runSpawn(cmd, args, cwd) {
  return spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: true });
}

console.log('Running npm ci in deploy step');
const install = runSpawn(npmCmd, ['ci', '--no-audit', '--no-fund', '--omit=dev'], serverDir);
if (install.status !== 0) {
  console.error('npm ci failed; refusing to deploy an incomplete package.');
  process.exit(1);
}

const zip = new AdmZip();
zip.addLocalFolder(serverDir);
const buffer = zip.toBuffer();

const options = {
  hostname: `${appName}.scm.azurewebsites.net`,
  path: '/api/zipdeploy',
  method: 'POST',
  headers: {
    'Content-Type': 'application/zip',
    'Content-Length': buffer.length,
  },
  auth: `${user}:${pass}`,
};

const req = https.request(options, (res) => {
  console.log('status', res.statusCode);
  res.setEncoding('utf8');
  res.on('data', (d) => process.stdout.write(d));
  res.on('end', () => process.exit(res.statusCode >= 400 ? 1 : 0));
});

req.on('error', (e) => {
  console.error(e);
  process.exit(1);
});

req.write(buffer);
req.end();

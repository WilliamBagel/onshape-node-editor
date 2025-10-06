const fs = require('fs');
const path = require('path');
const https = require('https');
const AdmZip = require('adm-zip');
require('dotenv').config();

const root = path.resolve(__dirname, '..');
const serverDir = path.join(root, 'dist', 'server');

const user = process.env.AZURE_PUBLISH_USER || process.env.AZURE_USERNAME;
const pass = process.env.AZURE_PUBLISH_PASS || process.env.AZURE_PASSWORD;
const appName = process.env.AZURE_FUNCTIONAPP_NAME;

if (!user || !pass || !appName) {
  console.error('Missing AZURE_PUBLISH_USER/AZURE_PUBLISH_PASS and AZURE_FUNCTIONAPP_NAME environment variables.');
  process.exit(1);
}

if (!fs.existsSync(serverDir)) {
  console.error('server dir not found, run `npm run build:server` first');
  process.exit(1);
}

// Install production dependencies inside dist/server to ensure runtime modules are present
console.log('Installing production dependencies into', serverDir);
const { spawnSync } = require('child_process');
const npmCmd = 'npm';
// try npm ci, fall back to npm install --omit=dev if no lockfile
function runSpawn(cmd, args, cwd) {
  return spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: true });
}

console.log('Running npm ci/install in deploy step');
let install = runSpawn(npmCmd, ['ci', '--no-audit', '--no-fund', '--omit=dev'], serverDir);
if (install.status !== 0) {
  if (install.error) console.warn('npm ci error:', install.error && install.error.stack || install.error);
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
    'Content-Length': buffer.length
  },
  auth: `${user}:${pass}`
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

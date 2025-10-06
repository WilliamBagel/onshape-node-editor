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
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
// try npm ci, fall back to npm install --production if no lockfile
let install = spawnSync(npmCmd, ['ci', '--omit=dev'], { cwd: serverDir, stdio: 'inherit' });
if (install.status !== 0) {
  console.log('npm ci failed or no lockfile, falling back to npm install --production');
  install = spawnSync(npmCmd, ['install', '--production', '--no-audit', '--no-fund'], { cwd: serverDir, stdio: 'inherit' });
  if (install.status !== 0) {
    console.error('npm install --production failed in', serverDir);
    // fallback: copy deps from root node_modules if present for the required packages
    try {
      const rootPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      const serverPkg = JSON.parse(fs.readFileSync(path.join(serverDir, 'package.json'), 'utf8'));
      const deps = Object.keys(serverPkg.dependencies || {});
      const rootNode = path.join(root, 'node_modules');
      const targetNode = path.join(serverDir, 'node_modules');
      if (fs.existsSync(rootNode)) {
        if (!fs.existsSync(targetNode)) fs.mkdirSync(targetNode, { recursive: true });
        for (const d of deps) {
          const src = path.join(rootNode, d);
          const dest = path.join(targetNode, d);
          if (fs.existsSync(src) && !fs.existsSync(dest)) {
            // naive copy of folder
            const cspawn = spawnSync(npmCmd, ['pack', d], { cwd: root, stdio: 'inherit' });
            if (cspawn.status === 0) {
              // find the .tgz created
              const files = fs.readdirSync(root).filter(f => f.startsWith(d.replace('/', '-') ) && f.endsWith('.tgz'));
              if (files.length) {
                const tgz = files[0];
                const extract = spawnSync(npmCmd, ['install', tgz, '--no-save'], { cwd: serverDir, stdio: 'inherit' });
                try { fs.unlinkSync(path.join(root, tgz)); } catch (e) { }
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('fallback copy dependencies failed', e && e.stack || e);
      process.exit(1);
    }
  }
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

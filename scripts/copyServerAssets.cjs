const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'dist', 'server');
const buildDir = path.join(root, 'dist', 'server-src');

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
      copyRecursive(path.join(src, item), path.join(dest, item));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// remove previous outDir
if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}
ensureDir(outDir);

// copy host.json if present
const hostSrc = path.join(root, 'src', 'server', 'host.json');
if (fs.existsSync(hostSrc)) {
  fs.copyFileSync(hostSrc, path.join(outDir, 'host.json'));
}

// For each function (files with .function.json in src/server), create a folder and copy built JS and function.json
const serverSrc = path.join(root, 'src', 'server');
const items = fs.readdirSync(serverSrc);
for (const item of items) {
  if (item.endsWith('.function.json')) {
    const name = item.replace('.function.json', '');
    const funcDir = path.join(outDir, name);
    ensureDir(funcDir);

    // copy function.json
    fs.copyFileSync(path.join(serverSrc, item), path.join(funcDir, 'function.json'));

    // look for compiled JS in buildDir with same name (name + .js)
    const candidate = path.join(buildDir, name + '.js');
    if (fs.existsSync(candidate)) {
      fs.copyFileSync(candidate, path.join(funcDir, 'index.js'));
    } else {
      // fallback: copy the TS file so user can compile or runtime may not accept TS
      const tsCandidate = path.join(serverSrc, name + '.ts');
      if (fs.existsSync(tsCandidate)) {
        fs.copyFileSync(tsCandidate, path.join(funcDir, 'index.js'));
      }
    }
    // copy shared compiled modules (like config.js) into function folder if present
    const sharedFiles = ['config.js'];
    for (const sf of sharedFiles) {
      const srcShared = path.join(buildDir, sf);
      if (fs.existsSync(srcShared)) {
        fs.copyFileSync(srcShared, path.join(funcDir, sf));
      }
    }
  }
}

// write minimal package.json for function app (node-fetch dependency)
// Include @azure/functions version from root package.json if available
let azureFunctionsVersion = '^4.8.0';
try {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  azureFunctionsVersion = (rootPkg.dependencies && rootPkg.dependencies['@azure/functions']) || (rootPkg.devDependencies && rootPkg.devDependencies['@azure/functions']) || azureFunctionsVersion;
} catch (e) {
  // ignore
}

const pkg = {
  name: 'onshape-node-editor-functions',
  version: '1.0.0',
  // main points to the compiled index bundle which registers functions with the programming model
  main: 'index.js',
  dependencies: {
    'node-fetch': '^2.6.7',
    '@azure/functions': azureFunctionsVersion
  }
};
fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify(pkg, null, 2));

// copy built index.js (the registration file) if it exists
const builtIndex = path.join(buildDir, 'index.js');
if (fs.existsSync(builtIndex)) {
  fs.copyFileSync(builtIndex, path.join(outDir, 'index.js'));
}
// copy server package-lock.json into dist so consumers can run `npm ci` deterministically
const serverLockSrc = path.join(root, 'src', 'server', 'package-lock.json');
if (fs.existsSync(serverLockSrc)) {
  fs.copyFileSync(serverLockSrc, path.join(outDir, 'package-lock.json'));
} else {
  // fallback: write the minimal lock derived from our pkg object so installs are predictable
  const minimalLock = {
    name: pkg.name,
    version: pkg.version,
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: pkg.name,
        version: pkg.version,
        dependencies: pkg.dependencies
      }
    }
  };
  fs.writeFileSync(path.join(outDir, 'package-lock.json'), JSON.stringify(minimalLock, null, 2));
}

// Attempt a deterministic install in the output folder so dist/server/node_modules is present
function runNpmCiInOutDir() {
  try {
    console.log('Running npm ci in', outDir);
    // Use shell true to be robust on Windows; inherit stdio so user sees progress
    const res = spawnSync('npm', ['ci', '--no-audit', '--no-fund', '--omit=dev'], { cwd: outDir, stdio: 'inherit', shell: true });
    if (res.status === 0) {
      console.log('npm ci completed successfully');
      return;
    }
    console.warn('npm ci failed with exit code', res.status, '- attempting npm install --omit=dev as fallback');
    const res2 = spawnSync('npm', ['install', '--no-audit', '--no-fund', '--omit=dev'], { cwd: outDir, stdio: 'inherit', shell: true });
    if (res2.status === 0) {
      console.log('npm install --omit=dev completed successfully');
      return;
    }
    console.warn('npm install --omit=dev also failed with exit code', res2.status, '\nDist may be missing node_modules.');
  } catch (err) {
    console.warn('Exception while running npm install:', err && err.stack || err);
  }
}

runNpmCiInOutDir();
console.log('Server assets copied to', outDir);

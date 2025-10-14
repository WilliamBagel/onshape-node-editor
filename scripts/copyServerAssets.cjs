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

// copy env file if present
const envSrc = path.join(root, 'src', 'server', '.env');
if (fs.existsSync(envSrc)) {
  fs.copyFileSync(envSrc, path.join(outDir, '.env'));
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
    const sharedJS = ['config.js'];
    for (const sf of sharedJS) {
      const srcShared = path.join(buildDir, sf);
      if (fs.existsSync(srcShared)) {
        fs.copyFileSync(srcShared, path.join(funcDir, sf));
      }
    }
    // copy shared json (like config.json) into function folder if present
    const sharedFiles = ['config.json'];
    for (const sf of sharedFiles) {
      const srcShared = path.join(serverSrc, sf);
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
    '@azure/functions': azureFunctionsVersion,
    "dotenv": "^17.2.3",
  }
};
fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify(pkg, null, 2));

// copy built index.js (the registration file) if it exists
const builtIndex = path.join(buildDir, 'index.js');
if (fs.existsSync(builtIndex)) {
  fs.copyFileSync(builtIndex, path.join(outDir, 'index.js'));
}
// copy server package-lock.json into dist so consumers can run `npm ci` deterministically
const serverLockSrc = path.join(root, 'scripts', 'server-lock', 'package-lock.json');
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

console.log('Server assets copied to', outDir);

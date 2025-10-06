const fs = require('fs');
const path = require('path');

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
  }
}

// write minimal package.json for function app (node-fetch dependency)
const pkg = {
  name: 'onshape-node-editor-functions',
  version: '1.0.0',
  // main points to the compiled index bundle which registers functions with the programming model
  main: 'index.js',
  dependencies: {
    'node-fetch': '^2.6.7'
  }
};
fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify(pkg, null, 2));

// copy built index.js (the registration file) if it exists
const builtIndex = path.join(buildDir, 'index.js');
if (fs.existsSync(builtIndex)) {
  fs.copyFileSync(builtIndex, path.join(outDir, 'index.js'));
}
console.log('Server assets copied to', outDir);

// Assembles the Azure Web App deployment tree in dist/server (#28).
//
// The server is a plain Node HTTP app (src/server/index.ts listens on
// process.env.PORT), so this is a flat copy of the compiled handlers plus a
// package.json with a `start` script. There is no host.json / function.json
// scaffolding any more.
//
// IMPORTANT (#23): this script must never copy src/server/.env (or any other
// credential file) into dist/server. Secrets belong in the Web App's
// Application Settings, not in the deployment package.

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'dist', 'server');
const buildDir = path.join(root, 'dist', 'server-src');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// remove previous outDir
if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}
ensureDir(outDir);

// copy the compiled handlers listed in the allowlist (one per src/server/*.ts)
// flat into dist/server. The allowlist is derived from the sources, so a file
// whose source was deleted can never be copied: tsc is run on a clean
// dist/server-src (see cleanServerBuild.cjs), but if a stale file does appear
// in the build dir it is an orphan and the build fails here.
if (!fs.existsSync(buildDir)) {
  console.error('build dir not found, run `pnpm run build:server` (tsc step) first');
  process.exit(1);
}
const srcDir = path.join(root, 'src', 'server');
const allowlist = new Set(
  fs.readdirSync(srcDir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => f.slice(0, -'.ts'.length) + '.js')
);
const built = fs.readdirSync(buildDir).filter((f) => f.endsWith('.js'));
const orphans = built.filter((f) => !allowlist.has(f));
if (orphans.length > 0) {
  console.error('ORPHAN compiled files with no src/server counterpart:', orphans.join(', '));
  console.error('Clean the build (pnpm run build:server does this) or remove the stale source.');
  process.exit(1);
}
for (const item of allowlist) {
  const src = path.join(buildDir, item);
  if (!fs.existsSync(src)) {
    console.error('compiled file missing from build dir (tsc incomplete?):', item);
    process.exit(1);
  }
  fs.copyFileSync(src, path.join(outDir, item));
}
console.log('copied', allowlist.size, 'compiled modules (allowlist from src/server):', [...allowlist].join(', '));

// write minimal package.json for the Web App (node-fetch + dotenv only)
const pkg = {
  name: 'onshape-node-editor-server',
  version: '1.0.0',
  // index.js starts the plain Node HTTP server on process.env.PORT
  main: 'index.js',
  scripts: {
    start: 'node index.js',
  },
  engines: {
    node: '^20.19.0 || >=22.12.0',
  },
  dependencies: {
    'node-fetch': '^2.6.7',
    dotenv: '^17.2.3',
  },
};
fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify(pkg, null, 2));

// copy server-lock package-lock.json into dist so the deploy step can run
// `npm ci` deterministically
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
        dependencies: pkg.dependencies,
      },
    },
  };
  fs.writeFileSync(path.join(outDir, 'package-lock.json'), JSON.stringify(minimalLock, null, 2));
}

console.log('Server assets copied to', outDir);

// Fail when dist/server contains a JS file with no src/server counterpart (#40).
//
// Deployment (scripts/deployServer.cjs) zips dist/server, so any file there
// ships to the Azure Web App. A deleted or renamed source must not linger as
// an undeployed-but-zipped orphan (dist/server/redirect.js was the original
// case: it hardcoded a Pages URL and built an OAuth redirect from query
// params despite having no source).
//
// Usage: node scripts/checkServerOrphans.cjs
// Run after `pnpm run build:server` (needs dist/server to exist).
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src', 'server');
const outDir = path.join(root, 'dist', 'server');

if (!fs.existsSync(outDir)) {
  console.error('dist/server not found, run `pnpm run build:server` first');
  process.exit(1);
}

const sourceNames = new Set(
  fs.readdirSync(srcDir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => f.slice(0, -'.ts'.length) + '.js')
);

// Files the deploy assembler is allowed to add alongside compiled output.
const allowedExtras = new Set(['package.json', 'package-lock.json']);

const orphans = fs.readdirSync(outDir)
  .filter((f) => f.endsWith('.js') && !sourceNames.has(f) && !allowedExtras.has(f));

if (orphans.length > 0) {
  console.error('ORPHAN FILES in dist/server with no src/server counterpart:');
  for (const f of orphans) console.error('  -', f);
  console.error('Fix: remove the stale source or add it to the allowlist in scripts/copyServerAssets.cjs.');
  process.exit(1);
}
console.log('No orphan files in dist/server (' + sourceNames.size + ' compiled modules checked).');

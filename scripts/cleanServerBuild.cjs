// Clean stale server build output before compiling (#40).
//
// `tsc -p tsconfig.server.json` is incremental and never deletes outDir, so a
// removed src/server/*.ts would leave its dist/server-src/*.js behind and
// copyServerAssets.cjs would ship it. Deleting both dirs up front makes the
// build deterministic: dist/server contains exactly what tsc compiled from
// the current src/server sources.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
for (const dir of ['dist/server-src', 'dist/server']) {
  const p = path.join(root, dir);
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
    console.log('cleaned', dir);
  }
}

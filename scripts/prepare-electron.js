const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const standaloneDir = path.join(root, '.next', 'standalone');
const electronStandaloneDir = path.join(root, '.next', 'electron-standalone');
const staticSource = path.join(root, '.next', 'static');
const staticTarget = path.join(standaloneDir, '.next', 'static');
const publicSource = path.join(root, 'public');
const publicTarget = path.join(standaloneDir, 'public');

function copyDirectory(source, target, options = {}) {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, {
    recursive: true,
    ...options,
  });
}

const serverEntry = path.join(standaloneDir, 'server.js');
if (!fs.existsSync(serverEntry)) {
  throw new Error(
    'Missing .next/standalone/server.js. Run the desktop build with ELECTRON_BUILD=1 first.',
  );
}

// Next standalone does not automatically include these static directories.
copyDirectory(staticSource, staticTarget);
copyDirectory(publicSource, publicTarget);

// pnpm represents packages in node_modules with symlinks/junctions. electron-builder
// extraResources must receive real files, otherwise packages such as `next` can be
// missing after installation. Create a fully materialized desktop server tree.
copyDirectory(standaloneDir, electronStandaloneDir, { dereference: true });

const stagedServerEntry = path.join(electronStandaloneDir, 'server.js');
const stagedNextPackage = path.join(
  electronStandaloneDir,
  'node_modules',
  'next',
  'package.json',
);

if (!fs.existsSync(stagedServerEntry)) {
  throw new Error(`Desktop staging is missing server.js: ${stagedServerEntry}`);
}

if (!fs.existsSync(stagedNextPackage)) {
  throw new Error(
    `Desktop staging is missing the Next.js runtime dependency: ${stagedNextPackage}`,
  );
}

console.log(`Prepared Electron server bundle: ${electronStandaloneDir}`);
console.log('Verified bundled runtime dependency: node_modules/next/package.json');

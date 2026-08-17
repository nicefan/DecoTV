const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const standaloneDir = path.join(root, '.next', 'standalone');
const staticSource = path.join(root, '.next', 'static');
const staticTarget = path.join(standaloneDir, '.next', 'static');
const publicSource = path.join(root, 'public');
const publicTarget = path.join(standaloneDir, 'public');

function copyDirectory(source, target) {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, { recursive: true });
}

if (!fs.existsSync(path.join(standaloneDir, 'server.js'))) {
  throw new Error(
    'Missing .next/standalone/server.js. Run the desktop build with ELECTRON_BUILD=1 first.',
  );
}

copyDirectory(staticSource, staticTarget);
copyDirectory(publicSource, publicTarget);

console.log('Prepared Next.js standalone output for Electron.');

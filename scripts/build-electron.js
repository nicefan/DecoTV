const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const electronDir = path.join(root, 'electron');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const electronBuilder = path.join(
  electronDir,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder',
);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    stdio: 'inherit',
    env: { ...process.env, ...options.env },
    shell: process.platform === 'win32',
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

run(pnpm, ['build'], { env: { ELECTRON_BUILD: '1' } });
run(pnpm, ['desktop:prepare']);
run(pnpm, ['install', '--no-frozen-lockfile'], { cwd: electronDir });
run(electronBuilder, ['--config', path.join(root, 'electron-builder.yml')], {
  cwd: root,
});

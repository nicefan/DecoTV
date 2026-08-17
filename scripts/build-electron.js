const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    stdio: 'inherit',
    env: { ...process.env, ...options.env },
    shell: false,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

run(pnpm, ['build'], { env: { ELECTRON_BUILD: '1' } });
run(pnpm, ['desktop:prepare']);
run(pnpm, ['install', '--dir', 'electron', '--no-frozen-lockfile']);
run(npx, ['--yes', 'electron-builder', '--config', 'electron-builder.yml'], {
  cwd: path.join(root, 'electron'),
});

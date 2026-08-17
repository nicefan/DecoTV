const { app, BrowserWindow, dialog, shell } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

let mainWindow = null;
let serverProcess = null;
let logFile = null;

function writeLog(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    if (!logFile) {
      logFile = path.join(app.getPath('userData'), 'decotv-desktop.log');
    }
    fs.appendFileSync(logFile, line, 'utf8');
  } catch (_) {}
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : null;
      server.close(() => {
        if (!port) reject(new Error('Unable to allocate a local port'));
        else resolve(port);
      });
    });
  });
}

function waitForServer(url, timeoutMs = 30000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get(url, (response) => {
        response.resume();
        writeLog(`Server responded with HTTP ${response.statusCode}`);
        resolve();
      });

      request.on('error', (error) => {
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`DecoTV server did not start in time: ${error.message}`));
          return;
        }
        setTimeout(attempt, 250);
      });

      request.setTimeout(1500, () => request.destroy());
    };

    attempt();
  });
}

function startServer(port) {
  const serverRoot = path.join(process.resourcesPath, 'app-server');
  const serverEntry = path.join(serverRoot, 'server.js');

  writeLog(`resourcesPath=${process.resourcesPath}`);
  writeLog(`serverRoot=${serverRoot}`);
  writeLog(`serverEntry=${serverEntry}`);

  if (!fs.existsSync(serverEntry)) {
    throw new Error(`Bundled Next.js server not found: ${serverEntry}`);
  }

  serverProcess = spawn(process.execPath, [serverEntry], {
    cwd: serverRoot,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      HOSTNAME: '127.0.0.1',
      PORT: String(port),
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  });

  serverProcess.stdout?.on('data', (data) => writeLog(`[server stdout] ${String(data).trim()}`));
  serverProcess.stderr?.on('data', (data) => writeLog(`[server stderr] ${String(data).trim()}`));
  serverProcess.on('error', (error) => writeLog(`[server error] ${error.stack || error.message}`));
  serverProcess.on('exit', (code, signal) => {
    writeLog(`Server exited (code=${code}, signal=${signal})`);
  });
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    shell.openExternal(targetUrl);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    const currentOrigin = new URL(url).origin;
    if (!targetUrl.startsWith(currentOrigin)) {
      event.preventDefault();
      shell.openExternal(targetUrl);
    }
  });

  mainWindow.loadURL(url);
}

async function startDesktopApp() {
  writeLog(`App starting. version=${app.getVersion()} packaged=${app.isPackaged}`);
  const port = await getFreePort();
  const url = `http://127.0.0.1:${port}`;
  writeLog(`Allocated port ${port}`);
  startServer(port);
  await waitForServer(url);
  createWindow(url);
  writeLog('BrowserWindow created');
}

app.whenReady().then(() => {
  startDesktopApp().catch((error) => {
    writeLog(`[fatal] ${error.stack || error.message}`);
    dialog.showErrorBox(
      'DecoTV 启动失败',
      `${error.message}\n\n日志位置：${logFile || path.join(app.getPath('userData'), 'decotv-desktop.log')}`,
    );
    app.quit();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
});

const { app, BrowserWindow, dialog, shell, utilityProcess } = require('electron');
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
  let stderrTail = '';

  writeLog(`resourcesPath=${process.resourcesPath}`);
  writeLog(`serverRoot=${serverRoot}`);
  writeLog(`serverEntry=${serverEntry}`);

  if (!fs.existsSync(serverEntry)) {
    throw new Error(`Bundled Next.js server not found: ${serverEntry}`);
  }

  let rejectEarlyExit;
  const earlyExit = new Promise((_, reject) => {
    rejectEarlyExit = reject;
  });

  serverProcess = utilityProcess.fork(serverEntry, [], {
    cwd: serverRoot,
    stdio: 'pipe',
    serviceName: 'DecoTV Next.js Server',
    env: {
      ...process.env,
      HOSTNAME: '127.0.0.1',
      PORT: String(port),
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  });

  serverProcess.on('spawn', () => {
    writeLog(`Server utility process spawned pid=${serverProcess.pid}`);
  });
  serverProcess.stdout?.on('data', (data) => {
    writeLog(`[server stdout] ${String(data).trim()}`);
  });
  serverProcess.stderr?.on('data', (data) => {
    const text = String(data);
    stderrTail = `${stderrTail}${text}`.slice(-12000);
    writeLog(`[server stderr] ${text.trim()}`);
  });
  serverProcess.on('error', (type, location, report) => {
    const message = `Server process error: type=${type} location=${location} report=${report || ''}`;
    writeLog(message);
    rejectEarlyExit(new Error(message));
  });
  serverProcess.on('exit', (code) => {
    writeLog(`Server exited (code=${code})`);
    if (code !== 0) {
      const details = stderrTail.trim();
      rejectEarlyExit(
        new Error(
          details
            ? `DecoTV server exited with code ${code}:\n\n${details}`
            : `DecoTV server exited with code ${code} before listening on the local port.`,
        ),
      );
    }
  });

  return earlyExit;
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
  const serverFailure = startServer(port);
  await Promise.race([waitForServer(url), serverFailure]);
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
  if (serverProcess) serverProcess.kill();
});

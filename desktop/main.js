// Electron 主进程:在本机启动内置的 Node 服务(零依赖核心,SQLite 走 better-sqlite3 回退),
// 再用窗口加载 http://127.0.0.1:<port>。案件数据保存在系统用户数据目录,不出本机。
const { app, BrowserWindow, shell, dialog } = require("electron");
const path = require("node:path");
const net = require("node:net");

function freePort() {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, { method: "HEAD" });
      if (response.ok || response.status === 404) return true;
    } catch (_) { /* not up yet */ }
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

async function startServer(port) {
  process.env.PORT = String(port);
  process.env.HENGFA_DATA_DIR = path.join(app.getPath("userData"), "data");
  process.env.HENGFA_ADMIN_EMAIL = process.env.HENGFA_ADMIN_EMAIL || "admin@hengfa.local";
  process.env.HENGFA_ADMIN_PASSWORD = process.env.HENGFA_ADMIN_PASSWORD || "Hengfa-Desktop-2026";
  // 复制进来的核心应用(由 copy-app.mjs 放到 ./app)。
  await import(path.join(__dirname, "app", "server.mjs"));
}

function createWindow(port) {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "衡法 AI 办案台",
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  win.removeMenu?.();
  win.loadURL(`http://127.0.0.1:${port}/`);
  // 外部链接用系统浏览器打开,避免在应用窗口内导航离站。
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  return win;
}

app.whenReady().then(async () => {
  try {
    const port = await freePort();
    await startServer(port);
    if (!(await waitForServer(port))) throw new Error("本地服务启动超时");
    createWindow(port);
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(port); });
  } catch (error) {
    dialog.showErrorBox("启动失败", String(error && error.stack || error));
    app.quit();
  }
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

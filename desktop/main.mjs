// Desktop app (Electron) for CCNA: On Call.
//
// The window shows exactly the same static files as the web version, served on
// a private app:// origin, so every change to the game reaches both. What only
// the desktop app adds lives here and in preload.cjs:
//   - its own storage: progress is kept in the app's data folder for the
//     signed-in OS account, apart from any browser that runs the web version
//   - data packs: an imported question bank or handbook is copied into that
//     folder and served in place of data/questions.js or data/notes.js
//   - updates: new GitHub releases are found and installed from inside the app
//
//   npm run desktop                       run from the source tree
//   npm run desktop -- --unlock-all       with every level open
//   npm run desktop -- --fake-update      pretend a new release is out (tries the update UI)
//   npm run desktop -- --smoke=out.png    load, save a screenshot, print a report, quit

import { app, BrowserWindow, Menu, Notification, dialog, ipcMain, protocol, shell } from "electron";
import electronUpdater from "electron-updater";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveFile, packKind, PACKS, TYPES } from "./files.mjs";

const { autoUpdater } = electronUpdater;
const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const arg = name => process.argv.find(a => a === `--${name}` || a.startsWith(`--${name}=`));
const argValue = name => (arg(name) || "").split("=").slice(1).join("=");
const SMOKE = arg("smoke") ? argValue("smoke") || "smoke.png" : null;
const FAKE_UPDATE = !!arg("fake-update");
const CHECK_EVERY = 4 * 60 * 60 * 1000;

// ---------------------------------------------------------------- storage
// One folder per OS account (Windows %APPDATA%, macOS ~/Library/Application
// Support, Linux ~/.config). Progress (localStorage), imported data packs and
// window settings all live here. A run from the source tree uses its own folder
// so trying a change never touches the progress of an installed copy.
app.setName("CCNA On Call");
if (!arg("user-data-dir")) app.setPath("userData", path.join(app.getPath("appData"), app.isPackaged ? "CCNA On Call" : "CCNA On Call (dev)"));
const userDir = app.getPath("userData");
const packDir = path.join(userDir, "data");

// A personal build carries the owner's data packs inside the app. Copy them to
// the data folder on first start, so they are still there after an update to a
// public build (which does not have them).
function seedPacks() {
  for (const name of PACKS) {
    const own = path.join(appRoot, "data", name), mine = path.join(packDir, name);
    try {
      if (fs.existsSync(own) && !fs.existsSync(mine)) { fs.mkdirSync(packDir, { recursive: true }); fs.copyFileSync(own, mine); }
    } catch (e) { console.error("could not copy data pack", name, e.message); }
  }
}

// ---------------------------------------------------------------- app:// origin
protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

function serve(req) {
  const file = resolveFile(new URL(req.url).pathname, { appRoot, packDir });
  if (!file) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
  return fs.promises.readFile(file)
    .then(buf => new Response(buf, { headers: { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" } }))
    .catch(() => new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } }));
}

// ---------------------------------------------------------------- window
let win = null;
const START = "app://ccna/index.html" + (arg("unlock-all") ? "?unlock=all" : "");

function createWindow() {
  win = new BrowserWindow({
    width: 1320, height: 880, minWidth: 820, minHeight: 560, show: !SMOKE,
    backgroundColor: "#0a0f15", title: "CCNA: On Call", autoHideMenuBar: true,
    webPreferences: { preload: path.join(here, "preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  // links out of the game open in the system browser; the window never leaves app://
  const external = url => { if (/^https:\/\//.test(url)) shell.openExternal(url); };
  win.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("app://ccna/")) { e.preventDefault(); external(url); } });
  win.on("closed", () => { win = null; });
  win.loadURL(START);
  if (SMOKE) win.webContents.once("did-finish-load", () => setTimeout(smoke, 1500));
}

async function smoke() {
  // past the exam chooser on a fresh data folder, so the screenshot shows the home screen
  await win.webContents.executeJavaScript(`document.querySelector("main.chooser .btn.primary")?.click()`);
  if (FAKE_UPDATE) await checkForUpdate();
  await new Promise(r => setTimeout(r, 700));
  const report = await win.webContents.executeJavaScript(`({
    title: document.title,
    desktop: !!window.ccnaDesktop,
    topbar: !!document.querySelector(".topbar .brand"),
    screen: document.querySelector("main")?.className || null,
    text: (document.querySelector("main")?.innerText || "").slice(0, 160),
    origin: location.origin,
  })`);
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.resolve(SMOKE), img.toPNG());
  console.log(JSON.stringify({ ...report, userData: userDir, screenshot: path.resolve(SMOKE) }, null, 2));
  app.exit(report.topbar && report.desktop ? 0 : 1);
}

// ---------------------------------------------------------------- data packs
async function importPack() {
  const pick = await dialog.showOpenDialog(win, {
    title: "Import a question bank or handbook",
    buttonLabel: "Import",
    filters: [{ name: "Data pack", extensions: ["js"] }],
    properties: ["openFile"],
  });
  if (pick.canceled || !pick.filePaths[0]) return { ok: false };
  const src = pick.filePaths[0];
  let text;
  try { text = fs.readFileSync(src, "utf8"); } catch (e) { return fail(`Could not read the file: ${e.message}`); }
  const kind = packKind(text);
  if (!kind) return fail("This file is not a data pack. A question bank starts with window.CCNA_QUESTIONS = and a handbook with window.CCNA_NOTES = (see data/README.md).");
  fs.mkdirSync(packDir, { recursive: true });
  fs.writeFileSync(path.join(packDir, kind), text);
  await dialog.showMessageBox(win, { type: "info", message: kind === "questions.js" ? "Question bank imported" : "Handbook imported", detail: `It is kept in ${packDir} and stays there through updates. The game reloads now to use it.` });
  win.webContents.reload();
  return { ok: true, kind };
  function fail(msg) { dialog.showMessageBox(win, { type: "warning", message: "Nothing was imported", detail: msg }); return { ok: false, error: msg }; }
}

function dataInfo() {
  return { userData: userDir, packDir, packs: PACKS.filter(n => fs.existsSync(path.join(packDir, n))), version: app.getVersion() };
}

// ---------------------------------------------------------------- updates
// The installers are attached to each GitHub release by the Desktop builds
// workflow, with the latest*.yml files electron-updater reads. Windows (NSIS)
// and Linux (AppImage) install an update in place. macOS only installs updates
// into a signed app, so until the builds are signed a Mac gets the notice and a
// button that opens the download page.
let update = { status: "idle", current: app.getVersion() };
const selfUpdate = process.platform === "win32" || (process.platform === "linux" && !!process.env.APPIMAGE);
const releasesUrl = () => {
  try {
    const yml = fs.readFileSync(path.join(process.resourcesPath, "app-update.yml"), "utf8");
    const owner = yml.match(/^owner:\s*(\S+)/m)?.[1], repo = yml.match(/^repo:\s*(\S+)/m)?.[1];
    return owner && repo ? `https://github.com/${owner}/${repo}/releases/latest` : null;
  } catch { return null; }
};

function setUpdate(patch) {
  const was = update.status;
  update = { ...update, ...patch };
  if (win) win.webContents.send("update:state", update);
  if (update.status === "available" && was !== "available" && Notification.isSupported()) {
    const n = new Notification({ title: "CCNA: On Call update", body: `Version ${update.version} is out. Click Update in the top bar to install it.` });
    n.on("click", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
    n.show();
  }
}

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.logger = null;
autoUpdater.on("checking-for-update", () => setUpdate({ status: "checking", error: null }));
autoUpdater.on("update-available", i => setUpdate({ status: "available", version: i.version, manual: !selfUpdate, error: null }));
autoUpdater.on("update-not-available", () => setUpdate({ status: "latest" }));
autoUpdater.on("download-progress", p => setUpdate({ status: "downloading", percent: Math.round(p.percent) }));
autoUpdater.on("update-downloaded", () => { setUpdate({ status: "ready" }); setTimeout(() => autoUpdater.quitAndInstall(false, true), 800); });
autoUpdater.on("error", e => setUpdate({ status: "error", error: String(e && e.message || e).split("\n")[0] }));

async function checkForUpdate() {
  if (FAKE_UPDATE) { setUpdate({ status: "available", version: "99.0.0", manual: false, error: null }); return update; }
  if (!app.isPackaged) { setUpdate({ status: "dev" }); return update; }
  if (["downloading", "ready"].includes(update.status)) return update;
  try { await autoUpdater.checkForUpdates(); } catch (e) { setUpdate({ status: "error", error: String(e.message || e).split("\n")[0] }); }
  return update;
}

async function startUpdate() {
  if (update.status !== "available") return update;
  if (FAKE_UPDATE) {
    for (let p = 0; p <= 100; p += 20) { setUpdate({ status: "downloading", percent: p }); await new Promise(r => setTimeout(r, 400)); }
    setUpdate({ status: "available", error: "This was a pretend update (--fake-update), so nothing was installed." });
    return update;
  }
  if (update.manual) { const url = releasesUrl(); if (url) shell.openExternal(url); return update; }
  setUpdate({ status: "downloading", percent: 0 });
  try { await autoUpdater.downloadUpdate(); } catch (e) { setUpdate({ status: "error", error: String(e.message || e).split("\n")[0] }); }
  return update;
}

// ---------------------------------------------------------------- menu and IPC
function buildMenu() {
  const mac = process.platform === "darwin";
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(mac ? [{ role: "appMenu" }] : []),
    { label: "File", submenu: [
      { label: "Import question bank or handbook…", click: importPack },
      { label: "Open data folder", click: () => { fs.mkdirSync(packDir, { recursive: true }); shell.openPath(userDir); } },
      { type: "separator" },
      { label: "Check for updates", click: checkForUpdate },
      { type: "separator" },
      mac ? { role: "close" } : { role: "quit" },
    ] },
    { role: "editMenu" },
    { label: "View", submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }] },
    { role: "windowMenu" },
  ]));
}

ipcMain.handle("update:get", () => update);
ipcMain.handle("update:check", () => checkForUpdate());
ipcMain.handle("update:start", () => startUpdate());
ipcMain.handle("data:info", () => dataInfo());
ipcMain.handle("data:import", () => importPack());
ipcMain.handle("data:open", () => { fs.mkdirSync(packDir, { recursive: true }); return shell.openPath(userDir); });

// ---------------------------------------------------------------- start
if (!SMOKE && !app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on("window-all-closed", () => { if (process.platform !== "darwin" || SMOKE) app.quit(); });
app.on("activate", () => { if (!win) createWindow(); });

app.whenReady().then(() => {
  seedPacks();
  protocol.handle("app", serve);
  buildMenu();
  createWindow();
  if (!SMOKE) {
    setTimeout(checkForUpdate, FAKE_UPDATE ? 2000 : 8000);
    if (app.isPackaged) setInterval(checkForUpdate, CHECK_EVERY);
  }
});

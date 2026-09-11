import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PiCommand, RpcExtensionUIResponse, StartPiOptions } from "@shared/protocol";
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from "electron";
import windowStateKeeper from "electron-window-state";
import { PiRegistry } from "./pi/registry";

const PAPER_LIGHT = "#f7f7f6";
const PAPER_DARK = "#131314";
const paperColor = () => (nativeTheme.shouldUseDarkColors ? PAPER_DARK : PAPER_LIGHT);

let mainWindow: BrowserWindow | undefined;
const pi = new PiRegistry(() => mainWindow);

function createWindow(): BrowserWindow {
  const state = windowStateKeeper({ defaultWidth: 1440, defaultHeight: 900 });
  const win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 960,
    minHeight: 600,
    title: "PID",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: paperColor(),
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  state.manage(win);
  nativeTheme.on("updated", () => win.setBackgroundColor(paperColor()));
  win.once("ready-to-show", () => win.show());

  // Headless verification hook: PID_SCREENSHOT=/path.png captures the window and quits.
  const shot = process.env.PID_SCREENSHOT;
  if (shot) {
    win.webContents.once("did-finish-load", () => {
      const delay = Number(process.env.PID_SCREENSHOT_DELAY ?? 800);
      setTimeout(async () => {
        const image = await win.webContents.capturePage();
        await writeFile(shot, image.toPNG());
        app.quit();
      }, delay);
    });
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (url !== win.webContents.getURL()) {
      e.preventDefault();
      void shell.openExternal(url);
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }
  return win;
}

ipcMain.handle("app:info", () => ({
  version: app.getVersion(),
  electron: process.versions.electron,
  platform: process.platform,
  // Dev hooks for headless smoke tests: open a folder and send one prompt on launch.
  devOpenFolder: process.env.PID_OPEN_FOLDER,
  devPrompt: process.env.PID_PROMPT,
  devFollowUp: process.env.PID_FOLLOWUP,
}));

ipcMain.handle("folder:pick", async () => {
  const r = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
  return r.canceled ? undefined : r.filePaths[0];
});

ipcMain.handle("pi:start", (_e, opts: StartPiOptions) => pi.start(opts));
ipcMain.handle("pi:command", (_e, key: string, command: PiCommand) => pi.command(key, command));
ipcMain.handle("pi:uiResponse", (_e, key: string, response: RpcExtensionUIResponse) =>
  pi.respondUI(key, response),
);
ipcMain.handle("pi:stop", (_e, key: string) => pi.stop(key));

app.whenReady().then(() => {
  mainWindow = createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

app.on("before-quit", () => pi.stopAll());
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

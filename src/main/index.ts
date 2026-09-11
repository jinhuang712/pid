import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AddWorktreeOptions, RemoveWorktreeOptions } from "@shared/git";
import type { PiCommand, RpcExtensionUIResponse, StartPiOptions } from "@shared/protocol";
import type { SearchScope } from "@shared/sessions";
import type { PidSettings } from "@shared/settings";
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from "electron";
import windowStateKeeper from "electron-window-state";
import { listFiles } from "./files";
import { addWorktree, removeWorktree, repoInfo, worktreeSafety } from "./git";
import { installMenu } from "./menu";
import { listExtensions, listSkills, readMcp, readPiHome } from "./pi/ecosystem";
import { PiRegistry } from "./pi/registry";
import { dropIndex, searchSessions } from "./pi/search";
import { readSessionMessages } from "./pi/session-read";
import { listAllSessions, listSessions } from "./pi/sessions";
import { forgetFolder, loadState, rememberFolder } from "./pid-state";
import { applyTheme, loadSettings, saveSettings } from "./settings";

const PAPER_LIGHT = "#f4f3ef";
const PAPER_DARK = "#121211";
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
  devOpenSession: process.env.PID_OPEN_SESSION,
  devDraft: process.env.PID_DRAFT,
  devSearch: process.env.PID_SEARCH,
  devPage: process.env.PID_PAGE,
}));

ipcMain.handle("folder:pick", async () => {
  const r = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
  return r.canceled ? undefined : r.filePaths[0];
});

ipcMain.handle("folders:recent", () => loadState().recentFolders);
ipcMain.handle("folders:remember", (_e, dir: string) => rememberFolder(dir));
ipcMain.handle("folders:forget", (_e, dir: string) => forgetFolder(dir));
ipcMain.handle("git:repo", (_e, cwd: string) => repoInfo(cwd));
ipcMain.handle("git:worktreeAdd", (_e, o: AddWorktreeOptions) => addWorktree(o));
ipcMain.handle("git:worktreeSafety", (_e, cwd: string, path: string) => worktreeSafety(cwd, path));
ipcMain.handle("git:worktreeRemove", (_e, o: RemoveWorktreeOptions) => removeWorktree(o));
ipcMain.handle("settings:get", () => loadSettings());
ipcMain.handle("settings:set", (_e, s: PidSettings) => saveSettings(s));
ipcMain.handle("pi:home", () => readPiHome());
ipcMain.handle("eco:skills", (_e, cwd?: string) => listSkills(cwd));
ipcMain.handle("eco:extensions", (_e, cwd?: string) => listExtensions(cwd));
ipcMain.handle("eco:mcp", (_e, cwd?: string) => readMcp(cwd));
ipcMain.handle("shell:reveal", (_e, path: string) => shell.showItemInFolder(path));
ipcMain.handle("shell:openPath", (_e, path: string) => shell.openPath(path));
ipcMain.handle("files:list", (_e, cwd: string) => listFiles(cwd));
ipcMain.handle("sessions:list", (_e, cwd: string) => listSessions(cwd));
ipcMain.handle("sessions:listAll", () => listAllSessions());
ipcMain.handle("sessions:search", (_e, query: string, scope: SearchScope) => searchSessions(query, scope));
ipcMain.handle("sessions:dropIndex", () => dropIndex());
ipcMain.handle("sessions:read", (_e, path: string) => readSessionMessages(path));

ipcMain.handle("pi:start", (_e, opts: StartPiOptions) => pi.start(opts));
ipcMain.handle("pi:command", (_e, key: string, command: PiCommand) => pi.command(key, command));
ipcMain.handle("pi:uiResponse", (_e, key: string, response: RpcExtensionUIResponse) =>
  pi.respondUI(key, response),
);
ipcMain.handle("pi:stop", (_e, key: string) => pi.stop(key));

app.whenReady().then(() => {
  applyTheme(); // decide the theme before the first frame
  installMenu(() => mainWindow);
  mainWindow = createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

app.on("before-quit", () => pi.stopAll());
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

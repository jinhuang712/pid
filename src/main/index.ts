import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ResourceToggle } from "@shared/ecosystem";
import type { ListOptions } from "@shared/glob";
import type { PiCommand, PiDialogResponse, StartPiOptions } from "@shared/protocol";
import type { SearchScope } from "@shared/sessions";
import type { PidSettings } from "@shared/settings";
import { isWebUrl } from "@shared/url";
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from "electron";
import windowStateKeeper from "electron-window-state";
import { listFiles, saveClipboardImage, statPaths, thumbnail } from "./files";
import { suggestFolders } from "./folders";
import { repoInfo } from "./git";
import { installMenu } from "./menu";
import { runDiagnostics } from "./pi/diagnostics";
import { configureAgentDir, listExtensions, listSkills, readPiHome } from "./pi/ecosystem";
import { PiRegistry } from "./pi/registry";
import { dropIndex, searchSessions, stopSearchWorker, warmSearchIndex } from "./pi/search-client";
import { readSessionBranch, readSessionMessages } from "./pi/session-read";
import { listAllSessions, listSessions } from "./pi/sessions";
import { readAppendSystemPrompt, writeAppendSystemPrompt } from "./pi/system-prompt";
import { setResourceState } from "./pi/toggles";
import {
  flushState,
  forgetFolder,
  loadState,
  type OpenSession,
  rememberFolder,
  saveOpenSessions,
} from "./pid-state";
import {
  applyAppearance,
  applyTheme,
  flushSettings,
  loadSettings,
  nudgeScale,
  saveSettings,
} from "./settings";
import { warmShellEnv } from "./shell-env";

const PAPER_LIGHT = "#f4f3ef";
const PAPER_DARK = "#121211";
const paperColor = () => (nativeTheme.shouldUseDarkColors ? PAPER_DARK : PAPER_LIGHT);

let mainWindow: BrowserWindow | undefined;
const pi = new PiRegistry(() => mainWindow);
// Plan quota belongs to the account, not to a session: one reading for whichever model is in front
// of the user, published to the window that asked for it.

/** File tokens in the timeline may carry "~/…"; Electron's shell wants a real absolute path. */
const expandHome = (path: string) => path.replace(/^~(?=\/|$)/, homedir());

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
    trafficLightPosition: { x: 18, y: 20 },
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
  // Zoom resets on every load, so the stored interface scale is re-applied with the first frame.
  win.webContents.on("did-finish-load", () => applyAppearance(win));
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

  // The renderer routes link clicks itself (Markdown.tsx); these two are the safety net so the
  // window never navigates away. A relative href resolves against the app's own file:// URL,
  // which is not a place to send the OS, so only web URLs go out.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isWebUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (url === win.webContents.getURL()) return;
    e.preventDefault();
    if (isWebUrl(url)) void shell.openExternal(url);
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
  devAttach: process.env.PID_ATTACH,
}));

ipcMain.handle("folder:pick", async () => {
  const r = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
  return r.canceled ? undefined : r.filePaths[0];
});

ipcMain.handle("folders:recent", () => loadState().recentFolders);
ipcMain.handle("folders:remember", (_e, dir: string) => rememberFolder(dir));
ipcMain.handle("folders:forget", (_e, dir: string) => forgetFolder(dir));
ipcMain.handle("folders:suggest", (_e, query: string) => suggestFolders(query, loadState().recentFolders));
ipcMain.handle("state:openSessions", () => {
  const st = loadState();
  return { openSessions: st.openSessions, activeSession: st.activeSession };
});
ipcMain.handle("state:saveOpenSessions", (_e, open: OpenSession[], active?: string) =>
  saveOpenSessions(open, active),
);
ipcMain.handle("git:repo", (_e, cwd: string) => repoInfo(cwd));
ipcMain.handle("settings:get", () => loadSettings());
ipcMain.handle("settings:set", (_e, s: PidSettings) => {
  const saved = saveSettings(s);
  applyAppearance(mainWindow, saved);
  return saved;
});
ipcMain.handle("pi:home", () => readPiHome());
ipcMain.handle("eco:skills", (_e, cwd?: string) => listSkills(cwd));
ipcMain.handle("eco:extensions", (_e, cwd?: string) => listExtensions(cwd));
ipcMain.handle("eco:setResource", (_e, req: ResourceToggle) => setResourceState(req));
ipcMain.handle("eco:appendSystemPrompt", () => readAppendSystemPrompt());
ipcMain.handle("eco:setAppendSystemPrompt", (_e, text: string) => writeAppendSystemPrompt(text));
ipcMain.handle("shell:reveal", (_e, path: string) => shell.showItemInFolder(expandHome(path)));
ipcMain.handle("shell:openPath", (_e, path: string) => shell.openPath(expandHome(path)));
ipcMain.handle("shell:openExternal", async (_e, url: string) => {
  if (isWebUrl(url)) await shell.openExternal(url);
});
ipcMain.handle("files:list", (_e, cwd: string, opts?: ListOptions) => listFiles(cwd, opts));
ipcMain.handle("files:stat", (_e, paths: string[]) => statPaths(paths));
ipcMain.handle("files:thumbnail", (_e, path: string) => thumbnail(path));
ipcMain.handle("files:saveClipboardImage", (_e, bytes: Uint8Array, mime: string) =>
  saveClipboardImage(bytes, mime),
);
ipcMain.handle("files:pick", async (_e, kind: "file" | "folder") => {
  const r = await dialog.showOpenDialog({
    properties: kind === "folder" ? ["openDirectory", "multiSelections"] : ["openFile", "multiSelections"],
  });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle("sessions:list", (_e, cwd: string) => listSessions(cwd));
ipcMain.handle("sessions:listAll", () => listAllSessions());
ipcMain.handle("sessions:search", (_e, query: string, scope: SearchScope) => searchSessions(query, scope));
ipcMain.handle("sessions:dropIndex", () => dropIndex());
ipcMain.handle("sessions:read", (_e, path: string) => readSessionMessages(path));
ipcMain.handle("sessions:readBranch", (_e, path: string) => readSessionBranch(path));

ipcMain.handle("pi:start", (_e, opts: StartPiOptions) => pi.start(opts));
ipcMain.handle("pi:command", (_e, key: string, command: PiCommand) => pi.command(key, command));
ipcMain.handle("pi:uiResponse", (_e, key: string, response: PiDialogResponse) => pi.respondUI(key, response));
ipcMain.handle("pi:stop", (_e, key: string) => pi.stop(key));
ipcMain.handle("pi:diagnostics", () => runDiagnostics());

app.whenReady().then(() => {
  applyTheme(); // decide the theme before the first frame
  installMenu(
    () => mainWindow,
    (steps) => {
      const saved = nudgeScale(steps);
      applyAppearance(mainWindow, saved);
      mainWindow?.webContents.send("settings:changed", saved);
    },
  );
  mainWindow = createWindow();
  // Pay the slow start-up costs now, off the click path: the login-shell PATH probe, Pi's own
  // agent-directory resolution, and the search index.
  void warmShellEnv();
  void configureAgentDir();
  setTimeout(warmSearchIndex, 3000);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

/**
 * Quitting kills the pi processes: they are children of PID and cannot outlive it.
 * When a turn is still running, follow the setting: ask, let it finish first, or just quit.
 */
let quitting = false;
app.on("before-quit", (e) => {
  if (quitting) return;
  const busy = pi.busyCount();
  const policy = loadSettings().sessions.onQuitWhileRunning;
  if (busy === 0 || policy === "quit") {
    quitting = true;
    pi.stopAll();
    return;
  }
  e.preventDefault();
  const finishThenQuit = () => {
    mainWindow?.hide();
    void pi.whenAllIdle().then(() => {
      quitting = true;
      pi.stopAll();
      app.quit();
    });
  };
  if (policy === "finish") return finishThenQuit();
  void dialog
    .showMessageBox({
      type: "question",
      message: `${busy} session${busy === 1 ? " is" : "s are"} still running.`,
      detail:
        "Pi runs inside PID; quitting stops it. You can let the current turns finish first — the window hides and PID quits when they are done.",
      buttons: ["Finish turns, then quit", "Quit now", "Cancel"],
      defaultId: 0,
      cancelId: 2,
    })
    .then(({ response }) => {
      if (response === 0) finishThenQuit();
      else if (response === 1) {
        quitting = true;
        pi.stopAll();
        app.quit();
      }
    });
});
app.on("will-quit", () => {
  flushState(); // debounced writes must land before the process ends
  flushSettings();
  stopSearchWorker();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

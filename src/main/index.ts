import { readFile, realpath, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ResourceToggle } from "@shared/ecosystem";
import type { ListOptions } from "@shared/glob";
import type { NotifyRequest } from "@shared/notifications";
import type { PiCommand, PiDialogResponse, StartPiOptions } from "@shared/protocol";
import type { SearchScope } from "@shared/sessions";
import type { PidSettings } from "@shared/settings";
import { isProgramPath, isWebUrl } from "@shared/url";
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, protocol, session, shell } from "electron";
import windowStateKeeper from "electron-window-state";
import { installDebugDump } from "./debug-dump";
import { listFiles, saveClipboardImage, statPaths, thumbnail } from "./files";
import { suggestFolders } from "./folders";
import { repoInfo } from "./git";
import { installMenu } from "./menu";
import { openNotificationSettings, showNotification } from "./notifications";
import { runDiagnostics } from "./pi/diagnostics";
import { configureAgentDir, listExtensions, listSkills, readPiHome } from "./pi/ecosystem";
import { bundlePlugin, discoverPlugins, JSX_SHIM, reactShim, uiShim } from "./pi/plugins";
import { PiRegistry } from "./pi/registry";
import {
  dropIndex,
  readSessionBranch,
  readSessionMessages,
  searchSessions,
  stopSearchWorker,
  warmSearchIndex,
} from "./pi/search-client";
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
  const paint = () => win.setBackgroundColor(paperColor());
  nativeTheme.on("updated", paint);
  // A window that is gone must not be written to: its theme listener goes with it, and
  // `mainWindow` stops pointing at it — which is what the menu and the interface-scale items send
  // through.
  win.on("closed", () => {
    nativeTheme.off("updated", paint);
    if (mainWindow === win) mainWindow = undefined;
  });
  // Zoom resets on every load, so the stored interface scale is re-applied with the first frame.
  win.webContents.on("did-finish-load", () => applyAppearance(win));
  // A headless smoke run drives the same window the user would see, but never shows it: the
  // renderer paints either way and the probes read the real DOM, so nobody gets a popup.
  const headless = Boolean(process.env.PID_HEADLESS || process.env.PID_DUMP_DIR);
  if (!headless) win.once("ready-to-show", () => win.show());

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
    void win.loadURL("pid://app/index.html");
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
  // Headless smoke runs: the dump directory, so the renderer knows to publish its probe.
  devDump: process.env.PID_DUMP_DIR,
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
ipcMain.handle("notify:show", (_e, req: NotifyRequest) =>
  showNotification(req, {
    focused: Boolean(mainWindow?.isFocused()),
    // The click lands back in the window, which knows what an open session is. Focus first: a
    // banner is read because the window was not in front, so a click has to bring it back.
    onOpen: (r) => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send("notify:open", r);
    },
  }),
);
ipcMain.handle("notify:openSettings", () => openNotificationSettings());
ipcMain.handle("shell:reveal", (_e, path: string) => shell.showItemInFolder(expandHome(path)));
ipcMain.handle("shell:openPath", async (_e, path: string) => {
  const full = expandHome(path);
  // A transcript link is untrusted text (a model wrote it, or a file it quoted), and `openPath`
  // hands the path to LaunchServices. What the path really *is* decides, because a link can carry
  // the name of a document and point at a program: a program is revealed in Finder, where the user
  // still has to choose it, and a document opens as before.
  const real = await realpath(full).catch(() => full);
  if (isProgramPath(full) || isProgramPath(real)) return shell.showItemInFolder(full);
  return shell.openPath(full);
});
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

/**
 * Where a plugin's code is fetched from.
 *
 * Privileged so the renderer can `import()` it: an ES module will not load from a scheme the
 * browser does not consider standard and secure, and `file:` is refused across origins.
 */
/**
 * The window's own origin.
 *
 * A `file:` document has an opaque origin and Chromium refuses to import a module into one from
 * anywhere else — the request never reaches a handler. A second scheme does not help either: the
 * import is still cross-origin. So the app and everything it imports share one origin, and a
 * plugin is served from a path under it.
 */
protocol.registerSchemesAsPrivileged([
  { scheme: "pid", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

/** Plugin entries by id, refreshed whenever the window asks for the list. */
const pluginEntries = new Map<string, string>();

/** What the shims re-export; the window reports its own lists so they cannot drift from it. */
let hostExports: { ui: string[]; react: string[] } = { ui: [], react: [] };

const MEDIA: Record<string, string> = {
  html: "text/html",
  js: "text/javascript",
  css: "text/css",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  woff2: "font/woff2",
};

/**
 * Everything the window loads: its own build under `/`, and a plugin's bundle under `/plugin/<id>`.
 * Nothing outside `out/renderer` is reachable by path, and a plugin is reachable only by an id the
 * last discovery put in the map.
 */
function serveApp(): void {
  const root = join(__dirname, "../renderer");
  const js = (body: string) =>
    new Response(body, { headers: { "content-type": "text/javascript; charset=utf-8" } });
  protocol.handle("pid", async (req) => {
    const rel = new URL(req.url).pathname.replace(/^\/+/, "") || "index.html";
    if (rel === "plugin/jsx-runtime") return js(JSX_SHIM);
    if (rel === "plugin/ui") return js(uiShim(hostExports.ui));
    if (rel === "plugin/react") return js(reactShim(hostExports.react));
    if (rel.startsWith("plugin/")) {
      const id = rel.slice("plugin/".length).replace(/\.js$/, "");
      const entry = pluginEntries.get(id);
      if (!entry) return new Response("no such plugin", { status: 404 });
      try {
        return js(await bundlePlugin(entry));
      } catch (e) {
        // A plugin that will not build must say so in the window rather than fail silently: the
        // module throws on import, and the slot around it reports the message to its author.
        const message = e instanceof Error ? e.message : String(e);
        return js(`throw new Error(${JSON.stringify(`${id}: ${message}`)});`);
      }
    }
    const file = join(root, rel);
    if (!file.startsWith(root)) return new Response("no", { status: 403 });
    try {
      const body = await readFile(file);
      const ext = rel.split(".").pop() ?? "";
      return new Response(body, { headers: { "content-type": MEDIA[ext] ?? "application/octet-stream" } });
    } catch {
      return new Response("not found", { status: 404 });
    }
  });
}

ipcMain.handle(
  "plugins:list",
  async (_e, cwd: string | undefined, exports: { ui: string[]; react: string[] }) => {
    hostExports = exports;
    // Safe mode: hold Shift at launch, or set the variable, and nothing third-party is loaded.
    if (process.env.PID_SAFE_MODE) return [];
    const found = await discoverPlugins(cwd);
    pluginEntries.clear();
    for (const p of found) pluginEntries.set(p.id, p.entry);
    return found.map((p) => p.id);
  },
);

/**
 * One PID at a time.
 *
 * A second instance would open the same session files — Pi's session format assumes one writer —
 * and rewrite the same state files whole. It comes forward as the first instead of starting.
 */
const primary = app.requestSingleInstanceLock();
if (!primary) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

app.whenReady().then(() => {
  if (!primary) return; // quitting: this instance must not open a window on the way out
  // A headless run hides the window, but on macOS the Dock icon alone steals focus from whatever
  // the user is doing — which is the popup, as far as they are concerned. Hide that too.
  if (process.env.PID_HEADLESS || process.env.PID_DUMP_DIR) void app.dock?.hide();
  // Nothing in PID asks for a device: the window draws a conversation and a plugin composes PID's
  // own primitives. Electron approves permission requests by default, so the refusal is explicit.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  installDebugDump();
  applyTheme(); // decide the theme before the first frame
  serveApp();
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

/**
 * Stop the workers, then quit for real.
 *
 * Pi's runtime emits `session_shutdown` from its own dispose, which is where an extension closes
 * what it opened; quitting straight through would take the process tree down under it. The four
 * call sites below all preventDefault first, so this second `quit` is the one that runs.
 */
function quitAfterStopping() {
  quitting = true;
  void pi.stopAll().then(() => app.quit());
}

app.on("before-quit", (e) => {
  if (quitting) return;
  const busy = pi.busyCount();
  const policy = loadSettings().sessions.onQuitWhileRunning;
  if (busy === 0 || policy === "quit") {
    e.preventDefault();
    return quitAfterStopping();
  }
  e.preventDefault();
  const finishThenQuit = () => {
    mainWindow?.hide();
    void pi.whenAllIdle().then(quitAfterStopping);
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
      else if (response === 1) quitAfterStopping();
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

import { app, type BrowserWindow, Menu, type MenuItemConstructorOptions, shell } from "electron";

export type MenuCommand =
  | "new-session"
  | "home"
  | "open-folder"
  | "search"
  | "fork"
  | "compact"
  | "abort"
  | "close-session"
  | "page:sessions"
  | "page:skills"
  | "page:extensions"
  | "page:settings";

/**
 * Native application menu. Every entry maps to a renderer command; nothing here talks to Pi directly.
 * Zoom is the exception: it is a stored appearance setting, so it goes through `onScale` rather
 * than Electron's `zoomIn`/`zoomOut` roles, which would drift away from the Settings pane.
 *
 * `menuTemplate` is separate from `installMenu` so tests can read the accelerators and fire the
 * click handlers without an Electron app behind them.
 */
export function menuTemplate(
  send: (cmd: MenuCommand) => () => void,
  onScale: (steps: number) => void,
): MenuItemConstructorOptions[] {
  const isMac = process.platform === "darwin";
  return [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { label: "Settings…", accelerator: "Cmd+,", click: send("page:settings") },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        // Cmd+T is the tab gesture and Cmd+N the window one; PID has tabs, so new-session is Cmd+T.
        { label: "New Session", accelerator: "CmdOrCtrl+T", click: send("new-session") },
        { label: "Home", accelerator: "CmdOrCtrl+N", click: send("home") },
        { label: "Open Folder…", accelerator: "CmdOrCtrl+O", click: send("open-folder") },
        { type: "separator" },
        { label: "Search Sessions…", accelerator: "CmdOrCtrl+K", click: send("search") },
        ...(isMac ? [] : [{ type: "separator" as const }, { role: "quit" as const }]),
      ],
    },
    { role: "editMenu" },
    {
      label: "Session",
      submenu: [
        { label: "Fork…", accelerator: "CmdOrCtrl+Shift+F", click: send("fork") },
        { label: "Compact Context", accelerator: "CmdOrCtrl+Shift+C", click: send("compact") },
        { label: "Abort Run", accelerator: "CmdOrCtrl+.", click: send("abort") },
        { type: "separator" },
        { label: "Close Session", accelerator: "CmdOrCtrl+W", click: send("close-session") },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Sessions", accelerator: "CmdOrCtrl+1", click: send("page:sessions") },
        { label: "Skills", accelerator: "CmdOrCtrl+2", click: send("page:skills") },
        { label: "Extensions", accelerator: "CmdOrCtrl+3", click: send("page:extensions") },
        { label: "Settings", accelerator: "CmdOrCtrl+4", click: send("page:settings") },
        { type: "separator" },
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { label: "Bigger Interface", accelerator: "CmdOrCtrl+Plus", click: () => onScale(1) },
        // ⌘+ needs Shift on most layouts; ⌘= is the one people actually press.
        { label: "Bigger Interface", accelerator: "CmdOrCtrl+=", visible: false, click: () => onScale(1) },
        { label: "Smaller Interface", accelerator: "CmdOrCtrl+-", click: () => onScale(-1) },
        { label: "Actual Size", accelerator: "CmdOrCtrl+0", click: () => onScale(0) },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }],
    },
    {
      role: "help",
      submenu: [
        {
          label: "Pi Documentation",
          click: () => void shell.openExternal("https://github.com/earendil-works/pi"),
        },
      ],
    },
  ];
}

export function installMenu(win: () => BrowserWindow | undefined, onScale: (steps: number) => void) {
  const send = (cmd: MenuCommand) => (): void => {
    win()?.webContents.send("menu:command", cmd);
  };
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate(send, onScale)));
}

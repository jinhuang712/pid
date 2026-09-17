import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { Bridge } from "./bridge-types";

function on<T>(channel: string, listener: (payload: T) => void) {
  const handler = (_e: Electron.IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);
}

const bridge: Bridge = {
  appInfo: () => ipcRenderer.invoke("app:info"),
  onMenuCommand: (l) => on("menu:command", l),
  pathOf: (file) => {
    try {
      return webUtils.getPathForFile(file) || undefined;
    } catch {
      return undefined;
    }
  },
  pickFolder: () => ipcRenderer.invoke("folder:pick"),
  folders: {
    recent: () => ipcRenderer.invoke("folders:recent"),
    remember: (dir) => ipcRenderer.invoke("folders:remember", dir),
    forget: (dir) => ipcRenderer.invoke("folders:forget", dir),
    suggest: (query) => ipcRenderer.invoke("folders:suggest", query),
  },
  openSessions: {
    get: () => ipcRenderer.invoke("state:openSessions"),
    save: (open, active) => ipcRenderer.invoke("state:saveOpenSessions", open, active),
  },
  notify: {
    show: (req) => ipcRenderer.invoke("notify:show", req),
    openSettings: () => ipcRenderer.invoke("notify:openSettings"),
    onOpen: (l) => on("notify:open", l),
  },
  files: {
    list: (cwd) => ipcRenderer.invoke("files:list", cwd),
    stat: (paths) => ipcRenderer.invoke("files:stat", paths),
    thumbnail: (path) => ipcRenderer.invoke("files:thumbnail", path),
    pick: (kind) => ipcRenderer.invoke("files:pick", kind),
    saveClipboardImage: (bytes, mime) => ipcRenderer.invoke("files:saveClipboardImage", bytes, mime),
  },
  git: {
    repo: (cwd) => ipcRenderer.invoke("git:repo", cwd),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (s) => ipcRenderer.invoke("settings:set", s),
    onChange: (l) => on("settings:changed", l),
  },
  eco: {
    home: () => ipcRenderer.invoke("pi:home"),
    skills: (cwd) => ipcRenderer.invoke("eco:skills", cwd),
    extensions: (cwd) => ipcRenderer.invoke("eco:extensions", cwd),
    setResource: (req) => ipcRenderer.invoke("eco:setResource", req),
    appendSystemPrompt: () => ipcRenderer.invoke("eco:appendSystemPrompt"),
    setAppendSystemPrompt: (text) => ipcRenderer.invoke("eco:setAppendSystemPrompt", text),
  },
  plugins: {
    list: (cwd, exports) => ipcRenderer.invoke("plugins:list", cwd, exports),
  },
  shell: {
    reveal: (path) => ipcRenderer.invoke("shell:reveal", path),
    openPath: (path) => ipcRenderer.invoke("shell:openPath", path),
    openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  },
  sessions: {
    list: (cwd) => ipcRenderer.invoke("sessions:list", cwd),
    listAll: () => ipcRenderer.invoke("sessions:listAll"),
    read: (path) => ipcRenderer.invoke("sessions:read", path),
    readBranch: (path) => ipcRenderer.invoke("sessions:readBranch", path),
    search: (query, scope) => ipcRenderer.invoke("sessions:search", query, scope),
    dropIndex: () => ipcRenderer.invoke("sessions:dropIndex"),
  },
  pi: {
    start: (opts) => ipcRenderer.invoke("pi:start", opts),
    command: (key, command) => ipcRenderer.invoke("pi:command", key, command),
    uiResponse: (key, response) => ipcRenderer.invoke("pi:uiResponse", key, response),
    stop: (key) => ipcRenderer.invoke("pi:stop", key),
    diagnostics: () => ipcRenderer.invoke("pi:diagnostics"),
    onEvent: (l) => on("pi:event", l),
    onExit: (l) => on("pi:exit", l),
  },
};

contextBridge.exposeInMainWorld("bridge", bridge);

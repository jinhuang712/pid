import { contextBridge, ipcRenderer } from "electron";
import type { Bridge } from "./bridge-types";

function on<T>(channel: string, listener: (payload: T) => void) {
  const handler = (_e: Electron.IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);
}

const bridge: Bridge = {
  appInfo: () => ipcRenderer.invoke("app:info"),
  pickFolder: () => ipcRenderer.invoke("folder:pick"),
  folders: {
    recent: () => ipcRenderer.invoke("folders:recent"),
    remember: (dir) => ipcRenderer.invoke("folders:remember", dir),
  },
  files: {
    list: (cwd) => ipcRenderer.invoke("files:list", cwd),
  },
  sessions: {
    list: (cwd) => ipcRenderer.invoke("sessions:list", cwd),
    listAll: () => ipcRenderer.invoke("sessions:listAll"),
    read: (path) => ipcRenderer.invoke("sessions:read", path),
  },
  pi: {
    start: (opts) => ipcRenderer.invoke("pi:start", opts),
    command: (key, command) => ipcRenderer.invoke("pi:command", key, command),
    uiResponse: (key, response) => ipcRenderer.invoke("pi:uiResponse", key, response),
    stop: (key) => ipcRenderer.invoke("pi:stop", key),
    onEvent: (l) => on("pi:event", l),
    onExit: (l) => on("pi:exit", l),
  },
};

contextBridge.exposeInMainWorld("bridge", bridge);

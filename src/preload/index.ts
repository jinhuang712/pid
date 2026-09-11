import { contextBridge, ipcRenderer } from "electron";
import type { Bridge } from "./bridge-types";

const bridge: Bridge = {
  appInfo: () => ipcRenderer.invoke("app:info"),
};

contextBridge.exposeInMainWorld("bridge", bridge);

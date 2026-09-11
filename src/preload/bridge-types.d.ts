export interface AppInfo {
  version: string;
  electron: string;
  platform: NodeJS.Platform;
}

export interface Bridge {
  appInfo(): Promise<AppInfo>;
}

declare global {
  interface Window {
    bridge: Bridge;
  }
}

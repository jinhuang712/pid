import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

/** PID-owned desktop state. Not agent state; losing this file loses nothing about Pi. */
export interface PidState {
  recentFolders: string[];
}

const file = () => join(app.getPath("userData"), "pid-state.json");

export function loadState(): PidState {
  try {
    const raw = JSON.parse(readFileSync(file(), "utf8")) as Partial<PidState>;
    return {
      recentFolders: Array.isArray(raw.recentFolders)
        ? raw.recentFolders.filter((x) => typeof x === "string")
        : [],
    };
  } catch {
    return { recentFolders: [] };
  }
}

export function saveState(state: PidState) {
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(file(), JSON.stringify(state, null, 2));
}

export function rememberFolder(dir: string): string[] {
  const s = loadState();
  s.recentFolders = [dir, ...s.recentFolders.filter((f) => f !== dir)].slice(0, 20);
  saveState(s);
  return s.recentFolders;
}

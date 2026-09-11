import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

/** PID-owned desktop state. Not agent state; losing this file loses nothing about Pi. */
export interface OpenSession {
  cwd: string;
  path: string;
}

export interface PidState {
  recentFolders: string[];
  /** Sessions that had a live process when PID last saved state; restored on launch. */
  openSessions: OpenSession[];
  activeSession?: string;
}

const file = () => join(app.getPath("userData"), "pid-state.json");

export function loadState(): PidState {
  try {
    const raw = JSON.parse(readFileSync(file(), "utf8")) as Partial<PidState>;
    return {
      recentFolders: Array.isArray(raw.recentFolders)
        ? raw.recentFolders.filter((x) => typeof x === "string")
        : [],
      openSessions: Array.isArray(raw.openSessions)
        ? raw.openSessions.filter((x) => x && typeof x.cwd === "string" && typeof x.path === "string")
        : [],
      activeSession: typeof raw.activeSession === "string" ? raw.activeSession : undefined,
    };
  } catch {
    return { recentFolders: [], openSessions: [] };
  }
}

export function saveState(state: PidState) {
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(file(), JSON.stringify(state, null, 2));
}

export function forgetFolder(dir: string): string[] {
  const s = loadState();
  s.recentFolders = s.recentFolders.filter((f) => f !== dir);
  saveState(s);
  return s.recentFolders;
}

export function rememberFolder(dir: string): string[] {
  const s = loadState();
  s.recentFolders = [dir, ...s.recentFolders.filter((f) => f !== dir)].slice(0, 20);
  saveState(s);
  return s.recentFolders;
}

export function saveOpenSessions(openSessions: OpenSession[], activeSession?: string) {
  const s = loadState();
  s.openSessions = openSessions;
  s.activeSession = activeSession;
  saveState(s);
}

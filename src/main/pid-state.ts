import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
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

/**
 * The file is read once and then served from memory: the main process is the only writer,
 * so re-reading it before every write only costs a synchronous disk round-trip on the IPC thread.
 */
let cached: PidState | undefined;
/** Serialized form of what is on disk (or scheduled to be), to skip writes that change nothing. */
let written: string | undefined;
let timer: NodeJS.Timeout | undefined;
const DEBOUNCE_MS = 400;

/** One entry per session file: a session has at most one live process, so a repeat is a stale save. */
export function dedupeSessions(open: OpenSession[]): OpenSession[] {
  const seen = new Set<string>();
  return open.filter((o) => {
    if (seen.has(o.path)) return false;
    seen.add(o.path);
    return true;
  });
}

function readState(): PidState {
  try {
    const raw = JSON.parse(readFileSync(file(), "utf8")) as Partial<PidState>;
    return {
      recentFolders: Array.isArray(raw.recentFolders)
        ? raw.recentFolders.filter((x) => typeof x === "string")
        : [],
      openSessions: dedupeSessions(
        Array.isArray(raw.openSessions)
          ? raw.openSessions.filter((x) => x && typeof x.cwd === "string" && typeof x.path === "string")
          : [],
      ),
      activeSession: typeof raw.activeSession === "string" ? raw.activeSession : undefined,
    };
  } catch {
    return { recentFolders: [], openSessions: [] };
  }
}

export function loadState(): PidState {
  if (!cached) {
    // `written` stays unset: the loaded form may differ from the file (duplicates dropped on read),
    // so the first save after launch always lands.
    cached = readState();
  }
  return cached;
}

/** Remember the new state and write it soon, off the IPC thread; bursts collapse into one write. */
export function saveState(state: PidState) {
  cached = state;
  if (timer) return;
  timer = setTimeout(() => {
    timer = undefined;
    void flushAsync();
  }, DEBOUNCE_MS);
}

async function flushAsync() {
  if (!cached) return;
  const json = JSON.stringify(cached, null, 2);
  if (json === written) return;
  written = json;
  try {
    await mkdir(app.getPath("userData"), { recursive: true });
    await writeFile(file(), json);
  } catch {
    written = undefined; // retry on the next save
  }
}

/** Synchronous flush for quit: whatever is pending must land before the process ends. */
export function flushState() {
  if (timer) {
    clearTimeout(timer);
    timer = undefined;
  }
  if (!cached) return;
  const json = JSON.stringify(cached, null, 2);
  if (json === written) return;
  try {
    mkdirSync(app.getPath("userData"), { recursive: true });
    writeFileSync(file(), json);
    written = json;
  } catch {
    // nothing left to do at quit
  }
}

export function forgetFolder(dir: string): string[] {
  const s = loadState();
  const next = { ...s, recentFolders: s.recentFolders.filter((f) => f !== dir) };
  saveState(next);
  return next.recentFolders;
}

export function rememberFolder(dir: string): string[] {
  const s = loadState();
  const next = { ...s, recentFolders: [dir, ...s.recentFolders.filter((f) => f !== dir)].slice(0, 20) };
  saveState(next);
  return next.recentFolders;
}

export function saveOpenSessions(openSessions: OpenSession[], activeSession?: string) {
  saveState({ ...loadState(), openSessions: dedupeSessions(openSessions), activeSession });
}

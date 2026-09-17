/**
 * The sessions PID has open, as a record of what the user asked for.
 *
 * This is what `pid-state.json` holds, and it is deliberately not a projection of the live
 * processes: Pi owns the session files, PID owns the wish to have one open in a tab. A process
 * that could not be resumed, that exited, or that is still starting changes nothing here — it is a
 * label on the entry, never a reason to drop it. Only the user closes a session.
 */
export interface OpenEntry {
  cwd: string;
  path: string;
}

export interface OpenSessionsState {
  /** The list, in the order the tabs were opened. The only thing that is saved. */
  entries: OpenEntry[];
  /**
   * Why an entry is not open right now, by session file. Never saved: a failure belongs to this run
   * of PID, and the next launch is a fresh attempt.
   */
  failures: Record<string, string>;
}

export const emptyOpenSessions = (): OpenSessionsState => ({ entries: [], failures: {} });

export type OpenSessionsAction =
  /** Union: the user opened a session, or the saved list arrived at launch. */
  | { type: "open"; entries: OpenEntry[] }
  /** The user closed the tab. The only way an entry leaves the list. */
  | { type: "close"; paths: string[] }
  /** Pi moved the process to another session file (fork, `/switch`). */
  | { type: "move"; from: string; to: OpenEntry }
  /** Starting it failed; the entry stays and carries the reason. */
  | { type: "fail"; entry: OpenEntry; reason: string }
  /** It is up; a reason recorded earlier no longer applies. */
  | { type: "ok"; path: string };

export function openSessionsReducer(s: OpenSessionsState, a: OpenSessionsAction): OpenSessionsState {
  switch (a.type) {
    case "open": {
      const known = new Set(s.entries.map((e) => e.path));
      const added = a.entries.filter((e) => e.path && !known.has(e.path));
      if (added.length === 0) return s;
      return { ...s, entries: [...s.entries, ...added] };
    }
    case "close": {
      if (!a.paths.some((p) => s.entries.some((e) => e.path === p))) return s;
      const gone = new Set(a.paths);
      return {
        entries: s.entries.filter((e) => !gone.has(e.path)),
        failures: withoutKeys(s.failures, gone),
      };
    }
    case "move": {
      // The tab keeps its place: a fork or a `/switch` is the same session moving to another file.
      if (a.from === a.to.path) return s;
      const entries = s.entries.filter((e) => e.path !== a.to.path);
      const at = entries.findIndex((e) => e.path === a.from);
      if (at < 0) entries.push(a.to);
      else entries[at] = a.to;
      return { ...s, entries, failures: withoutKeys(s.failures, new Set([a.from])) };
    }
    case "fail": {
      const entries = s.entries.some((e) => e.path === a.entry.path) ? s.entries : [...s.entries, a.entry];
      return { entries, failures: { ...s.failures, [a.entry.path]: a.reason } };
    }
    case "ok": {
      if (!(a.path in s.failures)) return s;
      return { ...s, failures: withoutKeys(s.failures, new Set([a.path])) };
    }
    default:
      return s;
  }
}

function withoutKeys(map: Record<string, string>, gone: Set<string>): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) if (!gone.has(k)) next[k] = v;
  return next;
}

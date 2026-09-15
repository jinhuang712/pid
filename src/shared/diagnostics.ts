/**
 * Which Pi is which. PID runs Pi in its own session workers, from the version it pins; the user
 * usually also has a `pi` on their PATH for the terminal. Both read the same `~/.pi/agent` and
 * write the same session files, so when the two versions drift apart this page says so instead of
 * leaving it to be discovered through a behaviour difference.
 */
export type PiCompat =
  /** Terminal and runtime share major.minor: the same Pi either way. */
  | "tested"
  /** The terminal's pi is newer: it may write sessions or settings this runtime reads differently. */
  | "newer"
  /** The terminal's pi is older: PID may produce sessions it renders differently. */
  | "older"
  | "unknown";

export interface PiDiagnostics {
  /** The Pi version PID runs, pinned in package.json. */
  runtimeVersion: string;
  /** Where the user's own `pi` resolves on the login-shell PATH, when they have one. */
  terminalPath?: string;
  terminalVersion?: string;
  /** Why the terminal probe found nothing. Not having pi installed is fine; PID runs its own. */
  terminalError?: string;
  compat: PiCompat;
  bridgePath?: string;
}

/** Compare major.minor only; patch releases are not treated as drift. */
export function compareCompat(terminal: string | undefined, runtime: string): PiCompat {
  const t = parse(terminal);
  const r = parse(runtime);
  if (!t || !r) return "unknown";
  if (t[0] !== r[0]) return t[0] > r[0] ? "newer" : "older";
  if (t[1] !== r[1]) return t[1] > r[1] ? "newer" : "older";
  return "tested";
}

function parse(v: string | undefined): [number, number] | undefined {
  const m = v?.trim().match(/^v?(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : undefined;
}

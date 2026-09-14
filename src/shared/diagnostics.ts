/**
 * What PID is actually driving. Two Pis are involved: the `pi` binary PID spawns (the user's),
 * and the Pi SDK PID bundles for read-only discovery. This makes both visible, plus the MCP
 * extension and bridge that ride along, so version drift is a fact on screen instead of a guess.
 */
export type PiCompat =
  /** Runtime and bundled SDK share major.minor: the combination PID was built against. */
  | "tested"
  /** Runtime is newer than the SDK: usually fine, config semantics may have moved. */
  | "newer"
  /** Runtime is older than the SDK: PID may show resources Pi cannot load. */
  | "older"
  | "unknown";

export interface PiDiagnostics {
  /** What PID asks the shell for: the configured binary or plain `pi`. */
  piBinary: string;
  /** Where that resolves on the login-shell PATH, if it does. */
  piPath?: string;
  piVersion?: string;
  /** Why the version probe failed, when it did. */
  piError?: string;
  sdkVersion: string;
  compat: PiCompat;
  adapterSource: "user" | "bundled" | "none";
  /** "pid-mcp" or "pi-mcp-adapter", whichever will load. */
  adapterName?: string;
  adapterVersion?: string;
  bridgePath?: string;
}

/** Compare major.minor only; patch releases are not treated as drift. */
export function compareCompat(runtime: string | undefined, sdk: string): PiCompat {
  const r = parse(runtime);
  const s = parse(sdk);
  if (!r || !s) return "unknown";
  if (r[0] !== s[0]) return r[0] > s[0] ? "newer" : "older";
  if (r[1] !== s[1]) return r[1] > s[1] ? "newer" : "older";
  return "tested";
}

function parse(v: string | undefined): [number, number] | undefined {
  const m = v?.trim().match(/^v?(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : undefined;
}

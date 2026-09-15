import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * North Star guardrail: PID must stay structurally mergeable into the Pi
 * monorepo (`pi/apps/pid`) without becoming a second owner of any Pi
 * semantic.
 *
 * `test/protocol-boundary.test.ts` already locks the PID-protocol shape
 * (no `modes/rpc` surface, no agent package in renderer/preload, no
 * ecosystem names, no bundled extensions). These tests lock the rest:
 *
 * - exactly one file drives the live Pi session runtime
 * - Pi's lower-level packages are types only, never runtime code
 * - no Pi private/deep implementation path is reached outside the Pi
 *   bridge directory (tightened to `src/main/pi/compat/` once the
 *   compatibility shims move there)
 * - the `"rpc"` non-TUI host-mode value lives in the worker alone instead
 *   of spreading RPC vocabulary through PID
 */

const SRC = join(import.meta.dirname, "..", "src");
const WORKER = join("src", "main", "pi", "session-worker.ts");
const SEP = "/";
/** Only explicit compatibility shims may touch Pi's private layout. */
const PI_COMPAT_DIR = `src${SEP}main${SEP}pi${SEP}compat${SEP}`;

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, acc);
    else if (/\.tsx?$/.test(name)) acc.push(p);
  }
  return acc;
}

/** Block comments and full-line comments are prose; anything else is code. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const files = sourceFiles(SRC).map((path) => ({
  path,
  rel: path.slice(path.indexOf("src")),
  text: readFileSync(path, "utf8"),
}));

const normalizedRel = (rel: string): string => rel.replace(/\\/g, "/");

describe("north star boundary", () => {
  it("has files to check", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  /** Only the worker may construct or drive an AgentSessionRuntime. */
  it("constructs the Pi session runtime in the worker alone", () => {
    const offenders = files
      .filter((f) => f.rel !== WORKER)
      .filter((f) =>
        /\bcreateAgentSessionRuntime\s*\(|\bcreateAgentSessionFromServices\s*\(|\bcreateAgentSessionServices\s*\(|\bnew AgentSessionRuntime\b/.test(
          f.text,
        ),
      )
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  /**
   * `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai` are not
   * re-exported by the runtime package, so PID imports message/model
   * shapes from them directly. Those imports must stay `import type` /
   * `export type`: erased at compile time, never runtime coupling to
   * another Pi layer.
   */
  it("keeps Pi's lower-level packages type-only", () => {
    const offenders = files
      .map((f) => ({
        rel: f.rel,
        code: stripComments(f.text)
          .replace(/\bimport\s+type[\s\S]*?;/g, "")
          .replace(/\bexport\s+type[\s\S]*?;/g, ""),
      }))
      .filter((f) => /@earendil-works\/pi-(agent-core|ai)\b/.test(f.code))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  /**
   * Only `src/main/pi/compat/` may reach into Pi's private layout (the HTTP
   * dispatcher deep import). Every unavoidable use of Pi's unexported
   * implementation lives behind that directory's UPSTREAM API GAP markers,
   * so a hidden second coupling cannot grow anywhere else.
   */
  it("reaches into no Pi private path outside the compat directory", () => {
    const offenders = files
      .filter((f) => !normalizedRel(f.rel).startsWith(PI_COMPAT_DIR))
      .filter((f) => {
        const code = stripComments(f.text);
        return /pi-coding-agent\/dist\//.test(code) || /\bhttp-dispatcher\b/.test(code);
      })
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  /**
   * PID binds extensions with Pi's non-TUI host mode even though it never
   * touches Pi's RPC transport. Until upstream offers better vocabulary,
   * that compatibility value must not leak out of the worker: no second
   * file gets to speak `"rpc"`.
   */
  it("keeps the rpc host-mode value in the worker alone", () => {
    const offenders = files
      .filter((f) => f.rel !== WORKER)
      .filter((f) => /("|')rpc\1/.test(stripComments(f.text)))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });
});

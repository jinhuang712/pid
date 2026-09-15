import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PID's protocol is PID's.
 *
 * `pi --mode rpc` is a second-class surface of Pi — its own docs already lag its code, and
 * upstream has a replacement protocol in development. PID used to describe its whole UI in those
 * types, which meant a change under `modes/rpc` could stop the window compiling. Now one file
 * touches Pi's agent API and everything else speaks `@shared/protocol`.
 *
 * These tests fail if that boundary erodes.
 */

const SRC = join(import.meta.dirname, "..", "src");
const BRIDGE = join("src", "main", "pi", "session-worker.ts");

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, acc);
    else if (/\.tsx?$/.test(name)) acc.push(p);
  }
  return acc;
}

const files = sourceFiles(SRC).map((path) => ({
  path,
  rel: path.slice(path.indexOf("src")),
  text: readFileSync(path, "utf8"),
}));

describe("protocol boundary", () => {
  it("has files to check", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("names none of Pi's RPC wire types", () => {
    const offenders = files
      .filter((f) => /\bRpc(Command|Response|SessionState|ExtensionUI\w*|SlashCommand)\b/.test(f.text))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("reaches into no `modes/` subpath of the agent package", () => {
    const offenders = files.filter((f) => /pi-coding-agent\/[^"']*modes/.test(f.text)).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  /**
   * The window and the preload bridge must not import the agent package at all: everything they
   * need is already declared in `@shared/protocol`, shaped from Pi's stable core types.
   */
  it("keeps the agent package out of the renderer and preload", () => {
    const offenders = files
      .filter((f) => /^src[/\\](renderer|preload)[/\\]/.test(f.rel))
      .filter((f) => f.text.includes("@earendil-works/pi-coding-agent"))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  /** Discovery and settings read the agent package too; only the worker may run a session on it. */
  it("builds a session runtime in the worker alone", () => {
    const offenders = files
      .filter((f) => f.rel !== BRIDGE)
      .filter((f) => /\bcreateAgentSessionRuntime\s*\(|\bnew AgentSessionRuntime\b/.test(f.text))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });
});

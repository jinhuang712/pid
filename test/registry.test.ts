import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * One writer per session file.
 *
 * Pi's session format takes no lock, so the invariant is PID's to keep. A renderer reload (⌘R)
 * forgets the worker keys it was holding and asks for the same sessions again; the registry has to
 * hand back what already owns those files instead of forking a second runtime that appends to
 * them.
 */

const h = vi.hoisted(() => ({
  made: [] as Array<{ cwd: string; sessionPath?: string; kill: () => void }>,
}));

vi.mock("../src/main/shell-env", () => ({ warmShellEnv: async () => {} }));

vi.mock("../src/main/pi/session-process", () => ({
  SessionProcess: class {
    cwd: string;
    sessionPath?: string;
    busy = false;
    started: Promise<unknown>;
    private gone = false;
    constructor(opts: { cwd: string; sessionPath?: string }) {
      this.cwd = opts.cwd;
      this.sessionPath = opts.sessionPath;
      this.started = Promise.resolve({ sessionFile: opts.sessionPath });
      h.made.push(this as unknown as (typeof h.made)[number]);
    }
    kill() {
      this.gone = true;
    }
    get exited() {
      return this.gone;
    }
  },
}));

import { PiRegistry } from "../src/main/pi/registry";

beforeEach(() => {
  h.made.length = 0;
});

const registry = () => new PiRegistry(() => undefined);

describe("session workers", () => {
  it("hands back the worker that already owns the session file", async () => {
    const pi = registry();
    const first = await pi.start({ cwd: "/tmp/p", sessionPath: "/tmp/s.jsonl" });
    const again = await pi.start({ cwd: "/tmp/p", sessionPath: "/tmp/s.jsonl" });

    expect(h.made).toHaveLength(1);
    expect(again.key).toBe(first.key);
    expect(again.state).toEqual({ sessionFile: "/tmp/s.jsonl" });
  });

  it("keeps one worker per file, not one per folder", async () => {
    const pi = registry();
    const a = await pi.start({ cwd: "/tmp/p", sessionPath: "/tmp/a.jsonl" });
    const b = await pi.start({ cwd: "/tmp/p", sessionPath: "/tmp/b.jsonl" });

    expect(h.made).toHaveLength(2);
    expect(b.key).not.toBe(a.key);
  });

  it("gives a session with no file yet a worker of its own", async () => {
    const pi = registry();
    const a = await pi.start({ cwd: "/tmp/p" });
    const b = await pi.start({ cwd: "/tmp/p" });

    expect(h.made).toHaveLength(2);
    expect(b.key).not.toBe(a.key);
  });

  it("forks again once the worker for that file is gone", async () => {
    const pi = registry();
    const first = await pi.start({ cwd: "/tmp/p", sessionPath: "/tmp/s.jsonl" });
    h.made[0]?.kill();
    const second = await pi.start({ cwd: "/tmp/p", sessionPath: "/tmp/s.jsonl" });

    expect(h.made).toHaveLength(2);
    expect(second.key).not.toBe(first.key);
  });
});

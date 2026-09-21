import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A stopped session disposes its runtime first.
 *
 * Pi's runtime emits `session_shutdown` from `dispose()`, which is where an extension closes what
 * it opened — a socket, a spawned process. SIGTERM alone skips it, so the worker is asked and only
 * killed when it does not answer.
 */

const h = vi.hoisted(() => {
  interface Fake {
    handlers: Map<string, Array<(...args: unknown[]) => void>>;
    posted: Array<{ kind: string }>;
    killed: number;
  }
  const children: Fake[] = [];
  const make = () => {
    const fake: Fake = { handlers: new Map(), posted: [], killed: 0 };
    const fire = (ev: string, ...args: unknown[]) => {
      for (const cb of fake.handlers.get(ev) ?? []) cb(...args);
    };
    const child = {
      on: (ev: string, cb: (...args: unknown[]) => void) => {
        fake.handlers.set(ev, [...(fake.handlers.get(ev) ?? []), cb]);
        return child;
      },
      postMessage: (msg: { kind: string }) => {
        fake.posted.push(msg);
      },
      kill: () => {
        fake.killed += 1;
        // SIGTERM takes the process down, and that exit is what the worker's owner waits for.
        fire("exit", 0);
      },
      stderr: { setEncoding: () => {}, on: () => {} },
      stdout: { setEncoding: () => {}, on: () => {} },
    };
    children.push(fake);
    return child;
  };
  const emit = (i: number, ev: string, ...args: unknown[]) => {
    for (const cb of children[i]?.handlers.get(ev) ?? []) cb(...args);
  };
  return { children, make, emit };
});

vi.mock("electron", () => ({ utilityProcess: { fork: () => h.make() } }));
vi.mock("../src/main/shell-env", () => ({ shellEnv: () => ({}), warmShellEnv: async () => ({}) }));

import { SessionProcess } from "../src/main/pi/session-process";

const worker = () => {
  const proc = new SessionProcess({ cwd: "/tmp/p", onEvent: () => {}, onExit: () => {} });
  // Starting is not what this file tests, and the registry is what answers this promise there.
  void proc.started.catch(() => {});
  return proc;
};

const last = () => {
  const fake = h.children.at(-1);
  if (!fake) throw new Error("no worker was forked");
  return fake;
};

beforeEach(() => {
  h.children.length = 0;
  vi.useFakeTimers();
});

describe("stopping a session worker", () => {
  it("asks the runtime to dispose before taking the process down", () => {
    const proc = worker();
    proc.kill();

    expect(last().posted).toContainEqual({ kind: "dispose" });
    expect(last().killed).toBe(0); // the grace period, not an instant kill
    vi.advanceTimersByTime(2000);
    expect(last().killed).toBe(1);
  });

  it("stops the process as soon as the runtime says it is disposed", () => {
    const proc = worker();
    proc.kill();
    h.emit(h.children.length - 1, "message", { kind: "disposed" });

    expect(last().killed).toBe(1);
    vi.advanceTimersByTime(2000);
    expect(last().killed).toBe(1); // the fallback is cleared, not left armed
  });

  it("resolves done once the process is gone, which is what a quit waits on", async () => {
    const proc = worker();
    proc.kill();
    h.emit(h.children.length - 1, "message", { kind: "disposed" });

    await expect(proc.done).resolves.toBeUndefined();
  });

  it("disposes once when it is asked to stop twice", () => {
    // `pi:stop` from the window and `stopAll` on quit can both reach the same worker.
    const proc = worker();
    proc.kill();
    proc.kill();

    expect(last().posted.filter((m) => m.kind === "dispose")).toHaveLength(1);
  });
});

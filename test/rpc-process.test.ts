import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

// Never probe the login shell from tests; the fake pi only needs node.
vi.mock("../src/main/shell-env", () => ({
  shellEnv: () => process.env,
  warmShellEnv: () => Promise.resolve(process.env),
}));

const { PiProcess } = await import("../src/main/pi/rpc-process");

const fakePi = resolve(__dirname, "fixtures/fake-pi");

type Exit = { code: number | null; signal: NodeJS.Signals | null; stderr: string };

function start(mode: string, binary = fakePi) {
  process.env.FAKE_PI_MODE = mode;
  const exits: Exit[] = [];
  let resolveExit: (e: Exit) => void = () => {};
  const exited = new Promise<Exit>((r) => {
    resolveExit = r;
  });
  const proc = new PiProcess({
    cwd: process.cwd(),
    binary,
    onEvent: () => {},
    onExit: (code, signal, stderr) => {
      const e = { code, signal, stderr };
      exits.push(e);
      resolveExit(e);
    },
  });
  return { proc, exits, exited };
}

describe("PiProcess lifecycle", () => {
  it("answers a request when pi is healthy", async () => {
    const { proc } = start("normal");
    const state = await proc.request({ type: "get_state" }, 5000);
    expect(state.sessionId).toBe("fake");
    proc.kill();
  });

  it("rejects pending requests and reports exit exactly once when the binary is missing", async () => {
    const { proc, exits, exited } = start("normal", "/definitely/not/a/pi-binary");
    await expect(proc.request({ type: "get_state" })).rejects.toThrow(/failed to start|ENOENT/);
    const e = await exited;
    expect(e.stderr).toMatch(/ENOENT/);
    await new Promise((r) => setTimeout(r, 50));
    expect(exits).toHaveLength(1);
    expect(proc.exited).toBe(true);
    await expect(proc.request({ type: "get_state" })).rejects.toThrow(/not running/);
  });

  it("rejects the request when pi dies mid-request", async () => {
    const { proc, exited } = start("crash-on-request");
    await expect(proc.request({ type: "get_state" })).rejects.toThrow(/pi exited \(3\)/);
    const e = await exited;
    expect(e.code).toBe(3);
  });

  it("reports an early crash with its stderr", async () => {
    const { proc, exited } = start("exit-immediately");
    const e = await exited;
    expect(e.code).toBe(2);
    expect(e.stderr).toContain("refusing to start");
    expect(proc.exited).toBe(true);
  });

  it("times out a handshake against a hung binary without killing the process", async () => {
    const { proc } = start("silent");
    await expect(proc.request({ type: "get_state" }, 200)).rejects.toThrow(
      /did not answer get_state within 200ms/,
    );
    expect(proc.exited).toBe(false);
    proc.kill();
  });
});

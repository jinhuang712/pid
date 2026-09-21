import { describe, expect, it, vi } from "vitest";

/**
 * The preload bridge is the window's only way to the main process, and a dropped argument is
 * invisible everywhere else: TypeScript accepts a narrower parameter list, and the handler runs
 * happily on its defaults.
 *
 * That is how `files:list` shipped without ever forwarding the Settings that narrow the list —
 * "show hidden files" and the ignore patterns were a silent no-op — while `listFiles` itself was
 * correct and covered. So these assertions read the bridge the preload really publishes, with the
 * electron surface it needs faked, and check the channel receives what the caller passed.
 */

const mocks = vi.hoisted(() => ({
  calls: [] as { channel: string; args: unknown[] }[],
  bridge: undefined as unknown,
}));

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, api: unknown) => {
      mocks.bridge = api;
    },
  },
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]) => {
      mocks.calls.push({ channel, args });
      return Promise.resolve(undefined);
    },
    on: () => {},
    off: () => {},
  },
  webUtils: { getPathForFile: () => undefined },
}));

import "../src/preload/index";

/** Only the methods these assertions call, so nothing here claims to be the whole bridge. */
interface Exercised {
  files: {
    list: (cwd: string, opts?: unknown) => unknown;
    saveClipboardImage: (bytes: unknown, mime: string) => unknown;
  };
  sessions: { search: (query: string, scope: unknown) => unknown };
  plugins: { list: (cwd: unknown, exports: unknown) => unknown };
  settings: { set: (s: unknown) => unknown };
  shell: { openPath: (path: string) => unknown };
}

const bridge = () => mocks.bridge as Exercised;

/** The last channel the bridge called, and what it sent. */
async function sent(run: () => unknown): Promise<{ channel: string; args: unknown[] }> {
  mocks.calls.length = 0;
  await run();
  const call = mocks.calls.at(-1);
  if (!call) throw new Error("the bridge made no ipc call");
  return call;
}

describe("the preload bridge", () => {
  it("carries the file-search settings through to files:list", async () => {
    const opts = { showHidden: true, ignorePatterns: ["dist/"] };
    expect(await sent(() => bridge().files.list("/tmp", opts))).toEqual({
      channel: "files:list",
      args: ["/tmp", opts],
    });
  });

  it("forwards the arguments of every other multi-argument call", async () => {
    expect(await sent(() => bridge().files.saveClipboardImage("bytes", "image/png"))).toEqual({
      channel: "files:saveClipboardImage",
      args: ["bytes", "image/png"],
    });
    expect(await sent(() => bridge().sessions.search("needle", { scope: "all" }))).toEqual({
      channel: "sessions:search",
      args: ["needle", { scope: "all" }],
    });
    expect(await sent(() => bridge().plugins.list("/tmp", { ui: ["Button"], react: [] }))).toEqual({
      channel: "plugins:list",
      args: ["/tmp", { ui: ["Button"], react: [] }],
    });
  });

  it("passes a single argument rather than none", async () => {
    const settings = { appearance: {} };
    expect(await sent(() => bridge().settings.set(settings))).toEqual({
      channel: "settings:set",
      args: [settings],
    });
    expect(await sent(() => bridge().shell.openPath("/tmp/a.txt"))).toEqual({
      channel: "shell:openPath",
      args: ["/tmp/a.txt"],
    });
  });
});

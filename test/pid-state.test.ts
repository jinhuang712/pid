import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The state file's home is `app.getPath("userData")`; a temp directory makes it real without an app.
const here = vi.hoisted(() => ({ dir: "" }));
vi.mock("electron", () => ({ app: { getPath: () => here.dir } }));

/** A fresh module per call: the file is read once and cached, so each test needs its own copy. */
async function pidState() {
  vi.resetModules();
  return import("../src/main/pid-state");
}

const stateFile = () => join(here.dir, "pid-state.json");

beforeEach(() => {
  here.dir = mkdtempSync(join(tmpdir(), "pid-state-"));
});

afterEach(() => {
  rmSync(here.dir, { recursive: true, force: true });
});

describe("pid state: writing", () => {
  it("writes through a staged file, so a reader never sees half of it", async () => {
    const m = await pidState();
    m.saveOpenSessions([{ cwd: "/repo", path: "/s/a.jsonl" }], "/s/a.jsonl");
    m.flushState();

    const written = JSON.parse(readFileSync(stateFile(), "utf8"));
    expect(written.version).toBe(m.STATE_VERSION);
    expect(written.openSessions).toEqual([{ cwd: "/repo", path: "/s/a.jsonl" }]);
    expect(written.activeSession).toBe("/s/a.jsonl");
    expect(existsSync(`${stateFile()}.tmp`)).toBe(false);
  });

  it("keeps a saved list across a reload", async () => {
    const first = await pidState();
    first.saveOpenSessions(
      [
        { cwd: "/repo", path: "/s/a.jsonl" },
        { cwd: "/other", path: "/s/b.jsonl" },
      ],
      "/s/b.jsonl",
    );
    first.flushState();

    const second = await pidState();
    expect(second.loadState().openSessions).toEqual([
      { cwd: "/repo", path: "/s/a.jsonl" },
      { cwd: "/other", path: "/s/b.jsonl" },
    ]);
    expect(second.loadState().activeSession).toBe("/s/b.jsonl");
  });
});

describe("pid state: reading a file that is not what we wrote", () => {
  it("keeps an unreadable file as .corrupt instead of replacing it with an empty list", async () => {
    writeFileSync(stateFile(), '{"recentFolders":["/repo"],"openSess');
    const m = await pidState();

    expect(m.loadState().openSessions).toEqual([]);
    expect(readFileSync(`${stateFile()}.corrupt`, "utf8")).toContain("openSess");

    // The next save starts from what is left, and does not touch the kept copy.
    m.saveOpenSessions([{ cwd: "/repo", path: "/s/a.jsonl" }]);
    m.flushState();
    expect(JSON.parse(readFileSync(stateFile(), "utf8")).openSessions).toHaveLength(1);
    expect(readFileSync(`${stateFile()}.corrupt`, "utf8")).toContain("openSess");
  });

  it("reads a list written before entries were unique, without doubling it", async () => {
    const one = { cwd: "/repo", path: "/s/a.jsonl" };
    writeFileSync(stateFile(), JSON.stringify({ openSessions: [one, one, { cwd: 1, path: 2 }] }));
    const m = await pidState();
    expect(m.loadState().openSessions).toEqual([one]);
  });

  it("still reads a file with no version field", async () => {
    writeFileSync(stateFile(), JSON.stringify({ openSessions: [{ cwd: "/repo", path: "/s/a.jsonl" }] }));
    const m = await pidState();
    expect(m.loadState().openSessions).toHaveLength(1);
  });
});

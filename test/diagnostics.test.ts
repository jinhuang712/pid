import { VERSION } from "@earendil-works/pi-coding-agent";
import { compareCompat } from "@shared/diagnostics";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/main/shell-env", () => ({
  shellEnv: () => process.env,
  warmShellEnv: () => Promise.resolve(process.env),
}));
const { resolveOnPath } = await import("../src/main/pi/diagnostics");

describe("resolveOnPath", () => {
  it("finds a command on PATH and rejects a missing one", () => {
    const env = { PATH: `/definitely/missing:${process.execPath.replace(/\/node$/, "")}` };
    expect(resolveOnPath("node", env)).toBe(process.execPath);
    expect(resolveOnPath("no-such-binary-xyz", env)).toBeUndefined();
  });
  it("accepts an absolute path only if it exists", () => {
    expect(resolveOnPath(process.execPath, {})).toBe(process.execPath);
    expect(resolveOnPath("/nope/pi", {})).toBeUndefined();
  });
});

describe("compareCompat", () => {
  it("treats the same major.minor as tested regardless of patch", () => {
    expect(compareCompat("0.85.1", "0.85.1")).toBe("tested");
    expect(compareCompat("0.85.7", "0.85.1")).toBe("tested");
    expect(compareCompat("v0.85.0", "0.85.1")).toBe("tested");
  });
  it("flags a newer or older runtime", () => {
    expect(compareCompat("0.86.0", "0.85.1")).toBe("newer");
    expect(compareCompat("1.0.0", "0.85.1")).toBe("newer");
    expect(compareCompat("0.84.9", "0.85.1")).toBe("older");
  });
  it("is unknown when a version is missing or unparsable", () => {
    expect(compareCompat(undefined, "0.85.1")).toBe("unknown");
    expect(compareCompat("dev", "0.85.1")).toBe("unknown");
    expect(compareCompat("0.85.1", "unknown")).toBe("unknown");
  });
});

describe("runtime version source", () => {
  it("reads Pi's version through its public entry, not its package.json", () => {
    // The package's exports map blocks the package.json subpath, so requiring
    // it throws ERR_PACKAGE_PATH_NOT_EXPORTED and the row stuck on "unknown".
    expect(VERSION).toMatch(/^v?\d+\.\d+/);
    expect(compareCompat("0.85.1", VERSION)).not.toBe("unknown");
  });
});

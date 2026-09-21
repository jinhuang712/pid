import { describe, expect, it, vi } from "vitest";

// The class forks a real utility process and reads the login shell; this file only exercises the
// one flag a quit decision reads, so neither is reachable from here.
vi.mock("electron", () => ({ utilityProcess: { fork: () => undefined } }));
vi.mock("../src/main/shell-env", () => ({ shellEnv: () => ({}), warmShellEnv: async () => ({}) }));

import { turnInFlight } from "../src/main/pi/session-process";

const event = (type: string, rest: Record<string, unknown> = {}) => ({ type, ...rest }) as never;

describe("a turn in flight", () => {
  it("stays busy across a retry, which is the part a quit must not interrupt", () => {
    expect(turnInFlight(event("agent_end", { willRetry: true }), true)).toBe(true);
  });

  it("ends when the turn is over for good", () => {
    expect(turnInFlight(event("agent_end", { willRetry: false }), true)).toBe(false);
    expect(turnInFlight(event("agent_settled"), true)).toBe(false);
  });

  it("turns busy on the start of a turn, including a retried one", () => {
    expect(turnInFlight(event("agent_start"), false)).toBe(true);
  });

  it("leaves the flag alone for events that say nothing about it", () => {
    expect(turnInFlight(event("thinking_level_changed"), true)).toBe(true);
    expect(turnInFlight(event("thinking_level_changed"), false)).toBe(false);
  });
});

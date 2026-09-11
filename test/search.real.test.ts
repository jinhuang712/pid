import { describe, expect, it } from "vitest";
import { searchSessions } from "../src/main/pi/search";

// Runs against the real ~/.pi/agent/sessions; opt in with PID_REAL_SESSIONS=1.
describe.skipIf(!process.env.PID_REAL_SESSIONS)("searchSessions (real sessions)", () => {
  it("finds content across all folders and scopes by cwd", async () => {
    const all = await searchSessions("note.txt", {});
    expect(all.length).toBeGreaterThan(0);
    expect(all[0].snippet.toLowerCase()).toContain("note.txt");
    const scoped = await searchSessions("note.txt", { cwd: all[0].session.cwd });
    expect(scoped.every((h) => h.session.cwd === all[0].session.cwd)).toBe(true);
    const none = await searchSessions("zzqqxxyy-no-such-term", {});
    expect(none).toEqual([]);
  }, 30000);
});

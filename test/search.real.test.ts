import { describe, expect, it } from "vitest";
import { searchSessions } from "../src/main/pi/search";

// Runs against the real ~/.pi/agent/sessions; opt in with PID_REAL_SESSIONS=1.
describe.skipIf(!process.env.PID_REAL_SESSIONS)("searchSessions (real sessions, BM25)", () => {
  it("finds conversation content across all folders and scopes by cwd", async () => {
    const all = await searchSessions("note.txt", {});
    expect(all.length).toBeGreaterThan(0);
    const best = all[0];
    expect(best.kind === "title" || best.snippet.toLowerCase().includes("note.txt")).toBe(true);
    const scoped = await searchSessions("note.txt", { cwd: best.session.cwd });
    expect(scoped.every((h) => h.session.cwd === best.session.cwd)).toBe(true);
    expect(await searchSessions("zzqqxxyy-no-such-term", {})).toEqual([]);
    const cjk = await searchSessions("缓存", {});
    expect(Array.isArray(cjk)).toBe(true);
  }, 60000);
});

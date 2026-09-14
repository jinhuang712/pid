import type { SessionSummary } from "@shared/sessions";
import { describe, expect, it } from "vitest";
import {
  MAX_MESSAGES,
  MAX_TOTAL_CHARS,
  type SessionReference,
  expandReferences,
  refDisplay,
  refMatches,
  refToken,
  renderReference,
} from "../src/renderer/session-reference";

const session: SessionSummary = {
  path: "/tmp/s.jsonl",
  id: "01a08eb2-74e4-7740-a79d-92ddc4bcb638",
  cwd: "/repo",
  created: "2026-09-11T00:00:00.000Z",
  modified: "2026-09-11T00:00:00.000Z",
  messageCount: 2,
  firstMessage: "debug the cache",
};

const ref = (n: number, len = 10): SessionReference => ({
  token: refToken(session),
  session,
  messages: Array.from({ length: n }, (_, i) => ({ role: i % 2 ? "assistant" : "user", text: `m${i} `.padEnd(len, "x") })),
});

describe("renderReference", () => {
  it("uses the full session id as token and label(shortid) as display form", () => {
    expect(refToken(session)).toBe("$01a08eb2-74e4-7740-a79d-92ddc4bcb638");
    expect(refDisplay(session)).toBe("$debug the cache(01a08eb2)");
    expect(refDisplay({ ...session, name: "fix (the) $bug" })).toBe("$fix the bug(01a08eb2)");
    expect(refDisplay({ ...session, firstMessage: "" })).toBe("$session(01a08eb2)");
    expect(refMatches(session, "01a08eb2")).toBe(true);
    expect(refMatches(session, refToken(session))).toBe(true);
    expect(refMatches(session, "$ffffffff")).toBe(false);
  });
  it("includes at most MAX_MESSAGES from the tail and states the scope", () => {
    const r = renderReference(ref(50));
    expect(r.included).toBe(MAX_MESSAGES);
    expect(r.total).toBe(50);
    expect(r.text).toContain(`scope="last ${MAX_MESSAGES} of 50 messages`);
    expect(r.text).toContain("m49");
    expect(r.text).not.toContain("[user] m0 ");
  });
  it("respects the total character budget", () => {
    const r = renderReference(ref(20, 5000));
    expect(r.chars).toBeLessThan(MAX_TOTAL_CHARS + 600);
    expect(r.included).toBeLessThan(20);
  });
  it("keeps the newest messages when the character budget truncates", () => {
    const r = renderReference(ref(20, 5000));
    const body = r.text.split("\n").slice(1, -1);
    expect(body.at(-1)).toContain("m19 ");
    expect(body[0]).toContain(`m${20 - r.included} `);
    expect(r.text).not.toContain("[user] m0 ");
    expect(r.text).toContain(`scope="last ${r.included} of 20 messages`);
  });
});

describe("expandReferences", () => {
  it("leaves prompts without tokens untouched", () => {
    expect(expandReferences("hello $unknown", [ref(2)])).toEqual({ text: "hello $unknown", used: [] });
  });
  it("spells raw tokens in display form and appends the visible block once", () => {
    const r = ref(3);
    const { text, used } = expandReferences(`compare with ${r.token} and ${refDisplay(session)}`, [r]);
    expect(used).toHaveLength(1);
    expect(text.split("$debug the cache(01a08eb2)")).toHaveLength(3);
    expect(text).not.toContain(r.token.slice(0, 20) + " ");
    expect(text.match(/<session-reference /g)).toHaveLength(1);
    expect(text).toContain("explicitly attached by the user");
  });
});

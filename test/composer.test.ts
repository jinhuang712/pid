import type { SessionSummary } from "@shared/sessions";
import { describe, expect, it } from "vitest";
import type { Attachment } from "../src/renderer/attachments";
import type { SessionReference } from "../src/renderer/session-reference";
import { type ComposerScopes, composerReducer, HOME_SCOPE } from "../src/renderer/state/composer";

const session: SessionSummary = {
  path: "/tmp/s.jsonl",
  id: "01a08eb2-74e4-7740-a79d-92ddc4bcb638",
  cwd: "/repo",
  created: "2026-09-11T00:00:00.000Z",
  modified: "2026-09-11T00:00:00.000Z",
  messageCount: 0,
  firstMessage: "",
};
const ref = (token: string): SessionReference => ({ token, session, messages: [] });
const file = (path: string): Attachment => ({ path, name: path.split("/").pop() ?? path, kind: "file" });

const run = (actions: Parameters<typeof composerReducer>[1][], init: ComposerScopes = {}) =>
  actions.reduce(composerReducer, init);

describe("composer scopes", () => {
  it("keeps draft, refs, and attachments apart per session", () => {
    const s = run([
      { type: "draft", scope: "A", text: "fix the bug" },
      { type: "add-ref", scope: "A", ref: ref("$aaa") },
      { type: "add-attachments", scope: "A", attachments: [file("/x/foo.go")] },
      { type: "draft", scope: "B", text: "unrelated" },
    ]);
    expect(s.A).toEqual({
      draft: "fix the bug",
      refs: [ref("$aaa")],
      attachments: [file("/x/foo.go")],
      links: [],
    });
    expect(s.B).toEqual({ draft: "unrelated", refs: [], attachments: [], links: [] });
    expect(s[HOME_SCOPE]).toBeUndefined();
  });

  it("dedupes refs by token and attachments by path", () => {
    const s = run([
      { type: "add-ref", scope: "A", ref: ref("$aaa") },
      { type: "add-ref", scope: "A", ref: ref("$aaa") },
      { type: "add-attachments", scope: "A", attachments: [file("/a"), file("/b")] },
      { type: "add-attachments", scope: "A", attachments: [file("/b")] },
    ]);
    expect(s.A.refs).toHaveLength(1);
    expect(s.A.attachments.map((a) => a.path)).toEqual(["/a", "/b"]);
  });

  it("consume drops only what was sent, keeping later additions", () => {
    const s = run([
      { type: "add-ref", scope: "A", ref: ref("$aaa") },
      { type: "add-ref", scope: "A", ref: ref("$bbb") },
      { type: "add-attachments", scope: "A", attachments: [file("/a"), file("/late")] },
      { type: "consume", scope: "A", refs: [ref("$aaa")], attachments: [file("/a")], links: [] },
    ]);
    expect(s.A.refs.map((r) => r.token)).toEqual(["$bbb"]);
    expect(s.A.attachments.map((a) => a.path)).toEqual(["/late"]);
  });

  it("restore-draft puts the failed text back without losing new typing", () => {
    expect(run([{ type: "restore-draft", scope: "A", text: "lost" }]).A.draft).toBe("lost");
    const s = run([
      { type: "draft", scope: "A", text: "typed since" },
      { type: "restore-draft", scope: "A", text: "lost" },
    ]);
    expect(s.A.draft).toBe("lost\ntyped since");
  });

  it("move carries a pending placeholder's draft to the live key", () => {
    const s = run([
      { type: "draft", scope: "pending:1", text: "hello" },
      { type: "move", from: "pending:1", to: "live-key" },
    ]);
    expect(s["pending:1"]).toBeUndefined();
    expect(s["live-key"].draft).toBe("hello");
  });

  it("clear forgets a closed session", () => {
    const s = run([{ type: "draft", scope: "A", text: "x" }, { type: "clear", scope: "A" }]);
    expect(s.A).toBeUndefined();
  });
});

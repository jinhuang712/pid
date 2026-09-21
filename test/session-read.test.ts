import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readSessionBranch, readSessionMessages, readSessionTranscript } from "../src/main/pi/session-read";

const line = (o: unknown) => JSON.stringify(o);

describe("readSessionMessages", () => {
  it("follows the active branch from the leaf and drops tool traffic", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pid-"));
    const file = join(dir, "s.jsonl");
    writeFileSync(
      file,
      [
        line({ type: "session", version: 3, id: "x", timestamp: "t", cwd: "/r" }),
        line({ type: "model_change", id: "a", parentId: null, provider: "p", modelId: "m" }),
        line({ type: "message", id: "b", parentId: "a", message: { role: "user", content: [{ type: "text", text: "Q1" }] } }),
        line({ type: "message", id: "c", parentId: "b", message: { role: "assistant", content: [{ type: "thinking", thinking: "hmm" }, { type: "text", text: "A1" }, { type: "toolCall", id: "t", name: "read", arguments: {} }] } }),
        line({ type: "message", id: "d", parentId: "c", message: { role: "toolResult", toolCallId: "t", toolName: "read", content: [{ type: "text", text: "file body" }] } }),
        // abandoned branch off "b"
        line({ type: "message", id: "e", parentId: "b", message: { role: "assistant", content: [{ type: "text", text: "OLD" }] } }),
        // active leaf continues from "d"
        line({ type: "message", id: "f", parentId: "d", message: { role: "assistant", content: [{ type: "text", text: "A2" }] } }),
        "",
      ].join("\n"),
    );
    const msgs = await readSessionMessages(file);
    expect(msgs).toEqual([
      { role: "user", text: "Q1" },
      { role: "assistant", text: "A1" },
      { role: "assistant", text: "A2" },
    ]);
  });

  /**
   * A compacted session is shorter than its file: the summary stands in for what came before, and
   * the preview has to say what the session says, or the timeline changes under the user a moment
   * after it appears.
   */
  it("previews what the session's context holds, not what it summarized away", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pid-"));
    const file = join(dir, "c.jsonl");
    writeFileSync(
      file,
      [
        line({ type: "session", version: 3, id: "x", timestamp: "t", cwd: "/r" }),
        line({ type: "message", id: "a", parentId: null, message: { role: "user", content: [{ type: "text", text: "old question" }] } }),
        line({ type: "message", id: "b", parentId: "a", message: { role: "assistant", content: [{ type: "text", text: "old answer" }] } }),
        line({ type: "compaction", id: "c", parentId: "b", summary: "they discussed the cache", tokensBefore: 100, firstKeptEntryId: "d", timestamp: "t" }),
        line({ type: "message", id: "d", parentId: "c", message: { role: "user", content: [{ type: "text", text: "new question" }] } }),
        "",
      ].join("\n"),
    );

    // The summary, then the one message the compaction kept.
    const branch = await readSessionBranch(file);
    expect(branch).toHaveLength(2);
    expect(JSON.stringify(branch)).toContain("they discussed the cache");
    expect(JSON.stringify(branch)).not.toContain("old answer");

    // The text view has no role to report a summary under, so it carries what a person typed.
    expect((await readSessionMessages(file)).map((m) => m.text)).toEqual(["new question"]);

    // Search wants recall, so it reads the branch whatever the context still carries.
    expect((await readSessionTranscript(file)).map((m) => m.text)).toEqual([
      "old question",
      "old answer",
      "new question",
    ]);
  });

  /**
   * A hand-edited file can name a loop. The walk has to end anyway: it runs in the search worker,
   * where "never returns" is a wedged ⌘K rather than an error anyone sees.
   */
  it("ends when a parent chain loops back on itself", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pid-"));
    const file = join(dir, "loop.jsonl");
    writeFileSync(
      file,
      [
        line({ type: "session", version: 3, id: "x", timestamp: "t", cwd: "/r" }),
        line({ type: "message", id: "a", parentId: "b", message: { role: "user", content: [{ type: "text", text: "first" }] } }),
        line({ type: "message", id: "b", parentId: "a", message: { role: "assistant", content: [{ type: "text", text: "second" }] } }),
        "",
      ].join("\n"),
    );

    expect((await readSessionTranscript(file)).map((m) => m.text)).toEqual(["first", "second"]);
  });
});

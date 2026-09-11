import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readSessionMessages } from "../src/main/pi/session-read";

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
});

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detachFork } from "../src/main/pi/detach-fork";

const line = (o: unknown) => JSON.stringify(o);

describe("detachFork", () => {
  it("drops parentSession from the header and keeps every other line byte for byte", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pid-"));
    const file = join(dir, "s.jsonl");
    const body = [
      line({ type: "message", id: "a", parentId: null, message: { role: "user", content: "hi" } }),
      line({ type: "message", id: "b", parentId: "a", message: { role: "assistant", content: "yo" } }),
    ].join("\n");
    writeFileSync(
      file,
      `${line({ type: "session", version: 3, id: "x", cwd: "/p", parentSession: "/p/old.jsonl" })}\n${body}\n`,
    );
    await detachFork(file);
    const [header, ...rest] = readFileSync(file, "utf8").split("\n");
    expect(JSON.parse(header)).toEqual({ type: "session", version: 3, id: "x", cwd: "/p" });
    expect(rest.join("\n")).toBe(`${body}\n`);
  });

  it("leaves a file without parentSession untouched", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pid-"));
    const file = join(dir, "s.jsonl");
    const raw = `${line({ type: "session", version: 3, id: "x", cwd: "/p" })}\n`;
    writeFileSync(file, raw);
    await detachFork(file);
    expect(readFileSync(file, "utf8")).toBe(raw);
  });
});

import { describe, expect, it } from "vitest";
import { stripPromptBlocks } from "../src/shared/prompt-blocks";
import {
  appendAttachments,
  type Attachment,
  fmtSize,
  kindOf,
  parseAttachments,
  parseReferences,
  parseSkillBlock,
  segment,
  toAttachment,
  urlsIn,
} from "../src/renderer/attachments";

const a = (path: string, kind: Attachment["kind"]): Attachment => ({
  path,
  kind,
  name: path.split("/").pop() ?? path,
});

describe("kindOf", () => {
  it("classifies by directory flag, then extension", () => {
    expect(kindOf({ path: "/x/src", exists: true, isDirectory: true, size: 3 })).toBe("folder");
    expect(kindOf({ path: "/x/Shot 1.PNG", exists: true, isDirectory: false, size: 1 })).toBe("image");
    expect(kindOf({ path: "/x/spec.pdf", exists: true, isDirectory: false, size: 1 })).toBe("pdf");
    expect(kindOf({ path: "/x/notes.md", exists: true, isDirectory: false, size: 1 })).toBe("file");
  });
  it("keeps the absolute path and marks missing ones", () => {
    const t = toAttachment({ path: "/x/gone.txt", exists: false, isDirectory: false, size: 0 });
    expect(t).toMatchObject({ path: "/x/gone.txt", name: "gone.txt", missing: true });
  });
  it("formats sizes for files and counts for folders", () => {
    expect(fmtSize({ ...a("/x/a", "file"), size: 900 })).toBe("900 B");
    expect(fmtSize({ ...a("/x/a", "file"), size: 2048 })).toBe("2.0 KB");
    expect(fmtSize({ ...a("/x/a", "image"), size: 3 * 1024 * 1024 })).toBe("3.0 MB");
    expect(fmtSize({ ...a("/x/d", "folder"), size: 1 })).toBe("1 item");
  });
});

describe("attachments block", () => {
  it("appends one line per attachment with the absolute path and round-trips", () => {
    const list = [a("/Users/me/Shots/Screen Shot 1.png", "image"), a("/Users/me/src", "folder")];
    const text = appendAttachments("look at this", list);
    expect(text).toBe(
      "look at this\n\n<attachments>\nimage  /Users/me/Shots/Screen Shot 1.png\nfolder /Users/me/src\n</attachments>",
    );
    const back = parseAttachments(text);
    expect(back.body).toBe("look at this");
    expect(back.attachments).toEqual(list);
  });
  it("leaves text without a block alone", () => {
    expect(appendAttachments("hi", [])).toBe("hi");
    expect(parseAttachments("hi <attachments> not closed")).toEqual({
      body: "hi <attachments> not closed",
      attachments: [],
    });
  });
});

describe("segment", () => {
  it("finds urls, session tokens with labels, and @mentions", () => {
    const s = segment('see https://example.com/a?b=1, then $01a08eb2 ("debug the cache") and @src/x.ts.');
    expect(s.map((x) => x.type)).toEqual(["text", "url", "text", "session", "text", "mention", "text"]);
    expect(s[1]).toMatchObject({ href: "https://example.com/a?b=1" });
    expect(s[3]).toMatchObject({ token: "$01a08eb2", label: "debug the cache" });
    expect(s[5]).toMatchObject({ path: "src/x.ts" });
  });
  it("does not treat emails or mid-word $ as tokens", () => {
    expect(segment("mail me@host.com about cost$12345678").every((x) => x.type === "text")).toBe(true);
  });
  it("dedupes urls", () => {
    expect(urlsIn("https://a.dev https://a.dev http://b.dev/x")).toEqual(["https://a.dev", "http://b.dev/x"]);
  });
});

describe("parseReferences", () => {
  it("splits the visible session blocks off the body", () => {
    const text =
      'compare $01a08eb2 ("debug")\n\nReferenced sessions (explicitly attached by the user):\n' +
      '<session-reference token="$01a08eb2" title="debug" folder="/repo" scope="last 2 of 2 messages, tool calls and thinking omitted">\n' +
      "[user] hi\n[assistant] yo\n</session-reference>";
    const r = parseReferences(text);
    expect(r.body).toBe('compare $01a08eb2 ("debug")');
    expect(r.references).toHaveLength(1);
    expect(r.references[0]).toMatchObject({ token: "$01a08eb2", title: "debug", folder: "/repo" });
    expect(r.references[0].text).toBe("[user] hi\n[assistant] yo");
  });
});

describe("stripPromptBlocks", () => {
  it("keeps only the words the user typed", () => {
    const text =
      'fix this $01a08eb2 ("debug")\n\nReferenced sessions (explicitly attached by the user):\n' +
      '<session-reference token="$01a08eb2" title="d" folder="/r" scope="s">\nx\n</session-reference>\n\n' +
      "<attachments>\nimage  /a/b.png\n</attachments>";
    expect(stripPromptBlocks(text)).toBe('fix this $01a08eb2 ("debug")');
    expect(stripPromptBlocks("<attachments>\nfolder /x\n</attachments>")).toBe("");
    expect(stripPromptBlocks("plain")).toBe("plain");
  });
});

describe("parseSkillBlock", () => {
  const block = (args = "") =>
    `<skill name="acme-status" location="/w/skills/acme-status/SKILL.md">\n# ACME Status\n\nRun the probes.\n</skill>${args ? `\n\n${args}` : ""}`;
  it("folds Pi's expanded skill back into the typed command", () => {
    const r = parseSkillBlock(block());
    expect(r.body).toBe("/acme-status");
    expect(r.skill).toEqual({
      name: "acme-status",
      location: "/w/skills/acme-status/SKILL.md",
      text: "# ACME Status\n\nRun the probes.",
    });
  });
  it("keeps trailing arguments the user typed after the command", () => {
    expect(parseSkillBlock(block("region hk")).body).toBe("/acme-status region hk");
  });
  it("leaves ordinary messages alone, even ones mentioning <skill", () => {
    expect(parseSkillBlock('what does <skill name="x"> mean?')).toEqual({ body: 'what does <skill name="x"> mean?' });
  });
  it("titles a skill session by the command, not the SKILL.md heading", () => {
    expect(stripPromptBlocks(block("region hk"))).toBe("/acme-status region hk");
    expect(stripPromptBlocks(`${block()}\n\n<attachments>\nfile   /x/a.txt\n</attachments>`)).toBe("/acme-status");
  });
});

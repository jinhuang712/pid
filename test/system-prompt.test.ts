import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configureAgentDir } from "../src/main/pi/ecosystem";

/** Reads and writes go to a throwaway agent dir (PI_CODING_AGENT_DIR); the real ~/.pi is untouched. */
let agent: string;
const prevAgentDir = process.env.PI_CODING_AGENT_DIR;

beforeAll(async () => {
  agent = join(mkdtempSync(join(tmpdir(), "pid-system-prompt-")), "agent");
  process.env.PI_CODING_AGENT_DIR = agent;
  // What main does at start-up. agentDir() still re-reads the environment on every call.
  await configureAgentDir();
});
afterAll(() => {
  if (prevAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = prevAgentDir;
});

describe("append system prompt file", () => {
  it("points at APPEND_SYSTEM.md in the agent dir and reports absence", async () => {
    const { appendSystemPromptPath, readAppendSystemPrompt } = await import("../src/main/pi/system-prompt");
    expect(appendSystemPromptPath()).toBe(join(agent, "APPEND_SYSTEM.md"));
    expect(readAppendSystemPrompt()).toEqual({ path: join(agent, "APPEND_SYSTEM.md"), text: "", exists: false });
  });

  it("writes the text verbatim, creating the agent dir", async () => {
    const { readAppendSystemPrompt, writeAppendSystemPrompt } = await import("../src/main/pi/system-prompt");
    const text = "- 用中文回答\n- Ask before `git reset --hard`\n";
    expect(writeAppendSystemPrompt(text)).toMatchObject({ text, exists: true });
    expect(readFileSync(join(agent, "APPEND_SYSTEM.md"), "utf8")).toBe(text);
    expect(readAppendSystemPrompt()).toMatchObject({ text, exists: true });
    expect(existsSync(join(agent, `APPEND_SYSTEM.md.${process.pid}.tmp`))).toBe(false);
  });

  it("reads a file written by hand", async () => {
    const { readAppendSystemPrompt } = await import("../src/main/pi/system-prompt");
    writeFileSync(join(agent, "APPEND_SYSTEM.md"), "hand written");
    expect(readAppendSystemPrompt().text).toBe("hand written");
  });

  it("removes the file when the text is blank so Pi falls back to its default prompt", async () => {
    const { readAppendSystemPrompt, writeAppendSystemPrompt } = await import("../src/main/pi/system-prompt");
    expect(writeAppendSystemPrompt("  \n\t")).toMatchObject({ text: "", exists: false });
    expect(existsSync(join(agent, "APPEND_SYSTEM.md"))).toBe(false);
    expect(readAppendSystemPrompt().exists).toBe(false);
    expect(() => writeAppendSystemPrompt("")).not.toThrow();
  });
});

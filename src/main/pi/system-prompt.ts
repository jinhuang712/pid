import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AppendSystemPrompt } from "@shared/ecosystem";
import { agentDir } from "./ecosystem";

/**
 * The global append-system-prompt file, Pi's own mechanism for user rules that ride on top of the
 * built-in system prompt: Pi's resource loader picks up ~/.pi/agent/APPEND_SYSTEM.md on every
 * start when it exists (a trusted project's <cwd>/.pi/APPEND_SYSTEM.md wins over it). PID owns no
 * copy of the text; the Settings page edits this file in place, and an empty box removes it so the
 * system prompt goes back to Pi's default plus AGENTS.md. Takes effect on the next session start.
 */

export const APPEND_SYSTEM_FILE = "APPEND_SYSTEM.md";

export function appendSystemPromptPath(): string {
  return join(agentDir(), APPEND_SYSTEM_FILE);
}

export function readAppendSystemPrompt(): AppendSystemPrompt {
  const path = appendSystemPromptPath();
  if (!existsSync(path)) return { path, text: "", exists: false };
  return { path, text: readFileSync(path, "utf8"), exists: true };
}

export function writeAppendSystemPrompt(text: string): AppendSystemPrompt {
  const path = appendSystemPromptPath();
  if (text.trim() === "") {
    if (existsSync(path)) unlinkSync(path);
    return { path, text: "", exists: false };
  }
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text, "utf8");
  renameSync(tmp, path);
  return { path, text, exists: true };
}

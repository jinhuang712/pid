/**
 * The kinds of structured widget PID can read, and how to read each one.
 *
 * This table is the whole of PID's knowledge about extension presentation. The reducer walks it;
 * nothing else in PID names a kind, asks whether a particular extension is installed, or branches
 * on one being there. Supporting a new kind is an entry here plus something to draw it — not a
 * condition threaded through the window.
 *
 * A kind is a shape of data, not a product. `mcp-status` is "what MCP servers are doing", whoever
 * publishes it; `usage` is "how much of the plan is gone", whoever fetched it.
 */

import { parseWidgetKey } from "./extension-widgets";
import { type McpOAuthOutcome, type McpStatusSnapshot, parseMcpOAuth, parseMcpStatus } from "./mcp-status";
import { type ProviderUsage, parseProviderUsage } from "./usage";
import { parseWorktree, type WorktreeBinding } from "./worktree";

/** What each kind parses to. Adding a member here is what makes a kind exist. */
export interface KindData {
  "mcp-status": McpStatusSnapshot;
  "mcp-oauth": McpOAuthOutcome;
  usage: ProviderUsage;
  binding: WorktreeBinding;
}

export type Kind = keyof KindData;

type Parsers = { [K in Kind]: (lines: string[] | undefined) => KindData[K] | undefined };

const PARSE: Parsers = {
  "mcp-status": parseMcpStatus,
  "mcp-oauth": parseMcpOAuth,
  usage: parseProviderUsage,
  binding: parseWorktree,
};

export const KINDS = Object.keys(PARSE) as Kind[];

/** Everything a session has published, by kind. Absent means no extension has filled it. */
export type Published = { [K in Kind]?: KindData[K] };

/**
 * Read a widget into the kind it claims, or undefined when it claims none PID knows.
 *
 * Version 1 only, deliberately: a `usage/v2` PID has not been taught is not a `usage/v1` with
 * extra fields, and guessing would be the start of a compatibility layer.
 */
export function readKind(
  key: string,
  lines: string[] | undefined,
): { kind: Kind; data: unknown } | undefined {
  const parsed = parseWidgetKey(key);
  if (!parsed || parsed.version !== 1) return undefined;
  const kind = parsed.kind as Kind;
  const parse = PARSE[kind] as ((l: string[] | undefined) => unknown) | undefined;
  return parse ? { kind, data: parse(lines) } : undefined;
}

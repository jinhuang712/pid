import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, UserMessage } from "@earendil-works/pi-ai";
import { fmtCost, fmtDuration, fmtTokens } from "../turn-summary";
import type { Marker } from "./conversation";

/** A message together with its absolute index in the conversation. */
export interface Indexed {
  index: number;
  m: AgentMessage;
}

/**
 * One exchange: the user message that opened it and everything Pi produced in reply. A turn is
 * settled once its `turn` marker exists (agent_end, or the next user message in loaded history).
 */
export interface Turn {
  start: number;
  end: number;
  user?: Indexed & { m: UserMessage };
  /** Every non-user message of the turn, in order; tool results ride along for `toolRuns`. */
  replies: Indexed[];
  summary?: Marker;
  /** Compaction and retry markers that fell inside this turn. */
  markers: Marker[];
}

export function groupTurns(messages: AgentMessage[], markers: Marker[]): Turn[] {
  const turns: Turn[] = [];
  let cur: Turn | undefined;
  for (const [index, m] of messages.entries()) {
    if (m.role === "user") {
      cur = { start: index, end: index, user: { index, m }, replies: [], markers: [] };
      turns.push(cur);
      continue;
    }
    if (!cur) {
      cur = { start: index, end: index, replies: [], markers: [] };
      turns.push(cur);
    }
    cur.end = index;
    cur.replies.push({ index, m });
  }
  for (const k of markers) {
    const t = turns.find((t) => k.afterIndex >= t.start && k.afterIndex <= t.end);
    if (!t) continue;
    if (k.kind === "turn") t.summary = k;
    else t.markers.push(k);
  }
  return turns;
}

/**
 * The reply split into what the user asked for and how Pi got there. The answer is the trailing
 * text of the last assistant message; every thinking block, tool call, and interim text before it
 * is a step.
 */
export interface Split {
  steps: Indexed[];
  answer?: AssistantMessage;
  /** The answer is gateway text rather than model output; the real reply is likely in the steps. */
  suspect?: boolean;
}

export function splitReply(replies: Indexed[]): Split {
  let lastAt = -1;
  for (let i = replies.length - 1; i >= 0; i--) {
    if (replies[i].m.role === "assistant") {
      lastAt = i;
      break;
    }
  }
  if (lastAt < 0) return { steps: replies };
  const last = replies[lastAt].m as AssistantMessage;
  let cut = 0;
  for (const [i, c] of last.content.entries()) if (c.type !== "text") cut = i + 1;
  const steps = replies.slice(0, lastAt);
  if (cut > 0)
    steps.push({ index: replies[lastAt].index, m: { ...last, content: last.content.slice(0, cut) } });
  const tail = last.content.slice(cut);
  // Error and abort footers live on the message; keep them with the answer even when no text made it.
  const answer =
    tail.length > 0 || last.stopReason === "error" || last.stopReason === "aborted"
      ? { ...last, content: tail }
      : undefined;
  return { steps, answer, suspect: answer && looksInjected(answer) ? true : undefined };
}

/**
 * Anthropic-compat gateways sometimes put their own text in the assistant content channel — a
 * `--- BANNER ---` context note, or a placeholder standing in for content they dropped — while the
 * model's actual reply lands in the thinking block. Two shapes, both seen from
 * aliyun-workspace/deepseek-v4.1-flash:
 *   `--- CONTEXT UPDATE (ignore if irrelevant) ---`
 *   `[System: Empty message content sanitised to satisfy protocol]`
 */
function looksInjected(m: AssistantMessage): boolean {
  const text = m.content
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("")
    .trim();
  if (!text) return false;
  const first = text.split("\n")[0].trim();
  return /^---\s+\S.*\S\s+---$/.test(first) || /^\[System:[^\]]*\]$/.test(text);
}

const EDITING_TOOLS = new Set(["edit", "write"]);

/**
 * `Worked for 1m 53s · 4 tool calls · edited 2 files · 66.6k tokens (75% cached) · $0.42`.
 * Parts that are zero or unknown are left out; zero cost (a subscription plan) shows nothing.
 */
export function describeTurn(turn: Turn): string {
  const usage = turn.summary?.usage;
  const duration = turn.summary?.durationMs;
  let calls = 0;
  const edited = new Set<string>();
  for (const { m } of turn.replies) {
    if (m.role !== "assistant") continue;
    for (const c of m.content) {
      if (c.type !== "toolCall") continue;
      calls++;
      const path = (c.arguments as Record<string, unknown> | undefined)?.path;
      if (EDITING_TOOLS.has(c.name) && typeof path === "string") edited.add(path);
    }
  }
  const parts = [duration === undefined ? "Worked" : `Worked for ${fmtDuration(duration)}`];
  if (calls > 0) parts.push(`${calls} tool call${calls === 1 ? "" : "s"}`);
  if (edited.size > 0) parts.push(`edited ${edited.size} file${edited.size === 1 ? "" : "s"}`);
  if (usage) {
    const prompt = usage.input + usage.cacheRead + usage.cacheWrite;
    const tokens = prompt + usage.output;
    if (tokens > 0) {
      const cached = usage.cacheRead > 0 ? ` (${Math.round((usage.cacheRead / prompt) * 100)}% cached)` : "";
      parts.push(`${fmtTokens(tokens)} tokens${cached}`);
    }
    const cost = fmtCost(usage.cost.total);
    if (cost) parts.push(cost);
  }
  return parts.join(" · ");
}

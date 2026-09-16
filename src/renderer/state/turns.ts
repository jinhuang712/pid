import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, UserMessage } from "@earendil-works/pi-ai";
import { fmtCost, fmtDuration, fmtTokens, type Usage } from "../turn-summary";
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
 * The answer of an in-flight message: the text after its last non-text block, once any of it has
 * arrived. Undefined while the model is still working — text the model types between tool calls
 * is a step, not the answer, and there is no way to tell them apart until either another block
 * follows (it was interim) or the turn settles (it was the answer). The caller folds the steps
 * while this is defined and unfolds them when work resumes, which is the honest reading of both.
 */
export function liveAnswer(m: AssistantMessage): AssistantMessage | undefined {
  let cut = 0;
  for (const [i, c] of m.content.entries()) if (c.type !== "text") cut = i + 1;
  const tail = m.content.slice(cut);
  const hasText = tail.some((c) => c.type === "text" && c.text.length > 0);
  return hasText ? { ...m, content: tail } : undefined;
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

/** Tool calls in the replies, counting the in-flight message's calls too, and the files they edited. */
function countWork(replies: Indexed[], streaming?: AssistantMessage): { calls: number; edited: Set<string> } {
  let calls = 0;
  const edited = new Set<string>();
  // Replies can hold non-assistant messages (tool results) with no content blocks to count; the
  // in-flight message is an assistant by construction, so its role check is elided by the cast.
  const messages = (streaming ? [...replies.map(({ m }) => m), streaming] : replies.map(({ m }) => m)) as
    | AgentMessage[]
    | AssistantMessage[];
  for (const m of messages) {
    if ("role" in m && m.role !== "assistant") continue;
    for (const c of m.content) {
      if (c.type !== "toolCall") continue;
      calls++;
      const path = (c.arguments as Record<string, unknown> | undefined)?.path;
      if (EDITING_TOOLS.has(c.name) && typeof path === "string") edited.add(path);
    }
  }
  return { calls, edited };
}

/** Token count with cache share, then cost — the tail every turn line ends with. */
function pushUsage(parts: string[], usage: Usage | undefined): void {
  if (!usage) return;
  const prompt = usage.input + usage.cacheRead + usage.cacheWrite;
  const tokens = prompt + usage.output;
  if (tokens > 0) {
    const cached = usage.cacheRead > 0 ? ` (${Math.round((usage.cacheRead / prompt) * 100)}% cached)` : "";
    parts.push(`${fmtTokens(tokens)} tokens${cached}`);
  }
  const cost = fmtCost(usage.cost.total);
  if (cost) parts.push(cost);
}

/**
 * `Worked for 1m 53s · 4 tool calls · edited 2 files · 66.6k tokens (75% cached) · $0.42`.
 * Parts that are zero or unknown are left out; zero cost (a subscription plan) shows nothing.
 */
export function describeTurn(turn: Turn): string {
  const usage = turn.summary?.usage;
  const duration = turn.summary?.durationMs;
  const { calls, edited } = countWork(turn.replies);
  const parts = [duration === undefined ? "Worked" : `Worked for ${fmtDuration(duration)}`];
  if (calls > 0) parts.push(`${calls} tool call${calls === 1 ? "" : "s"}`);
  if (edited.size > 0) parts.push(`edited ${edited.size} file${edited.size === 1 ? "" : "s"}`);
  pushUsage(parts, usage);
  return parts.join(" · ");
}

/** What the live line is built from while the turn is still running. */
export interface TurnLive {
  /** Wall clock at agent_start; drives the ticking duration. */
  startedAt?: number;
  /** Usage summed over the messages that have completed; the in-flight one's is unknown until it ends. */
  usage?: Usage;
  /** The in-flight assistant message, whose tool calls count before it completes. */
  streaming?: AssistantMessage;
}

/**
 * The same line while the turn runs: `Working for 1m 53s · 4 tool calls · …`. The duration is
 * measured at render time — the line re-renders on every streamed delta, so it keeps pace with
 * the answer it sits above. The usage is what has accrued so far, never the final number.
 */
export function describeTurnLive(turn: Turn, live: TurnLive, now: () => number = Date.now): string {
  const { calls, edited } = countWork(turn.replies, live.streaming);
  const parts = [
    live.startedAt === undefined
      ? "Working"
      : `Working for ${fmtDuration(Math.max(0, now() - live.startedAt))}`,
  ];
  if (calls > 0) parts.push(`${calls} tool call${calls === 1 ? "" : "s"}`);
  if (edited.size > 0) parts.push(`edited ${edited.size} file${edited.size === 1 ? "" : "s"}`);
  pushUsage(parts, live.usage);
  return parts.join(" · ");
}

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, ToolCall, ToolResultMessage } from "@earendil-works/pi-ai";
import type { PiAgentEvent } from "@shared/protocol";
import { addUsage, emptyUsage, summarizeTurn, type Usage } from "../turn-summary";

export interface ToolRun {
  toolCallId: string;
  toolName: string;
  args: unknown;
  status: "running" | "done";
  isError?: boolean;
  result?: ToolResultMessage;
}

export interface Marker {
  /** Rendered after messages[afterIndex] (−1 = before the first message). */
  afterIndex: number;
  kind: "compaction" | "retry" | "turn" | "command" | "command-failed";
  text: string;
  /** Hover detail, used by turn markers for the token breakdown. */
  detail?: string;
  /** Turn markers: what the collapsed step line is built from. */
  usage?: Usage;
  durationMs?: number;
}

/**
 * A `#` action or slash command PID issued itself (reload, compact, abort…) that has not settled yet.
 * Shown as a live row at the tail; on completion it becomes a `command` / `command-failed` marker.
 */
export interface CommandRun {
  id: number;
  text: string;
}

export interface ConversationState {
  messages: AgentMessage[];
  markers: Marker[];
  commands: CommandRun[];
  /** Usage of the last assistant message; drives the context gauge. */
  lastUsage?: AssistantMessage["usage"];
  compacting: boolean;
  /** Assistant message currently being streamed, rebuilt from deltas. */
  streaming?: AssistantMessage;
  isStreaming: boolean;
  /** Wall clock at agent_start; drives the live elapsed counter while running. */
  turnStartedAt?: number;
  /** Usage summed over the assistant messages of the running turn. */
  turnUsage?: Usage;
  /**
   * Usage summed over every assistant message in the session, loaded history included. What this
   * conversation has cost so far, as opposed to `turnUsage`'s current turn.
   */
  sessionUsage?: Usage;
  toolRuns: Record<string, ToolRun>;
  queue: { steering: readonly string[]; followUp: readonly string[] };
  lastError?: string;
}

export const emptyConversation = (): ConversationState => ({
  messages: [],
  markers: [],
  commands: [],
  compacting: false,
  isStreaming: false,
  toolRuns: {},
  queue: { steering: [], followUp: [] },
});

export function fromMessages(messages: AgentMessage[]): ConversationState {
  const s = emptyConversation();
  s.messages = messages;
  let turn: Usage | undefined;
  // Loaded history has no agent_start clock; the span from the user message to the last reply stands in.
  let startedAt = 0;
  let endedAt = 0;
  const closeTurn = (afterIndex: number) => {
    const durationMs = startedAt > 0 && endedAt > startedAt ? endedAt - startedAt : undefined;
    const summary = turn && summarizeTurn(turn, durationMs);
    if (summary && turn) s.markers.push({ afterIndex, kind: "turn", ...summary, usage: turn, durationMs });
    turn = undefined;
  };
  for (const [i, m] of messages.entries()) {
    if (m.role === "user") {
      if (turn) closeTurn(i - 1);
      startedAt = m.timestamp;
      endedAt = 0;
    }
    if (m.role === "assistant") {
      s.lastUsage = m.usage;
      turn = addUsage(turn ?? emptyUsage(), m.usage);
      s.sessionUsage = addUsage(s.sessionUsage ?? emptyUsage(), m.usage);
      endedAt = m.timestamp;
    }
    if (m.role === "toolResult") {
      s.toolRuns[m.toolCallId] = {
        toolCallId: m.toolCallId,
        toolName: m.toolName,
        args: undefined,
        status: "done",
        isError: m.isError,
        result: m,
      };
    }
  }
  closeTurn(messages.length - 1);
  return s;
}

/** A PID-issued command started: show it live at the tail until `commandEnd` settles it. */
export function commandStart(state: ConversationState, id: number, text: string): ConversationState {
  return { ...state, commands: [...state.commands, { id, text }] };
}

/**
 * A PID-issued command settled. `text` undefined keeps nothing in the timeline — for commands whose
 * outcome pi already reports through its own events (compaction_end).
 */
export function commandEnd(
  state: ConversationState,
  id: number,
  outcome: { ok: true; text?: string } | { ok: false; text: string },
): ConversationState {
  const commands = state.commands.filter((c) => c.id !== id);
  if (outcome.text === undefined) return { ...state, commands };
  return {
    ...state,
    commands,
    markers: [
      ...state.markers,
      {
        afterIndex: state.messages.length - 1,
        kind: outcome.ok ? "command" : "command-failed",
        text: outcome.text,
      },
    ],
  };
}

export function reduce(
  state: ConversationState,
  ev: PiAgentEvent,
  now: () => number = Date.now,
): ConversationState {
  switch (ev.type) {
    case "agent_start":
      return {
        ...state,
        isStreaming: true,
        lastError: undefined,
        turnStartedAt: now(),
        turnUsage: emptyUsage(),
      };
    case "agent_end": {
      const durationMs = state.turnStartedAt === undefined ? undefined : now() - state.turnStartedAt;
      const summary = state.turnUsage && summarizeTurn(state.turnUsage, durationMs);
      return {
        ...state,
        isStreaming: false,
        streaming: undefined,
        turnStartedAt: undefined,
        turnUsage: undefined,
        markers: summary
          ? [
              ...state.markers,
              {
                afterIndex: state.messages.length - 1,
                kind: "turn",
                ...summary,
                usage: state.turnUsage,
                durationMs,
              },
            ]
          : state.markers,
      };
    }
    case "compaction_start":
      return { ...state, compacting: true };
    case "compaction_end": {
      const summary = ev.aborted
        ? "compaction aborted"
        : ev.errorMessage
          ? `compaction failed: ${ev.errorMessage}`
          : `context compacted (${ev.reason})${ev.result ? ` · ${ev.result.tokensBefore.toLocaleString()} tokens before` : ""}`;
      return {
        ...state,
        compacting: false,
        markers: [
          ...state.markers,
          { afterIndex: state.messages.length - 1, kind: "compaction", text: summary },
        ],
      };
    }
    case "auto_retry_start":
      return {
        ...state,
        markers: [
          ...state.markers,
          {
            afterIndex: state.messages.length - 1,
            kind: "retry",
            text: `retry ${ev.attempt}/${ev.maxAttempts} in ${Math.round(ev.delayMs / 1000)}s · ${ev.errorMessage}`,
          },
        ],
      };
    case "queue_update":
      return { ...state, queue: { steering: ev.steering, followUp: ev.followUp } };
    case "message_start": {
      const m = ev.message as AgentMessage;
      if (m.role === "assistant") return { ...state, streaming: { ...m, content: [...m.content] } };
      if (m.role === "user") return { ...state, messages: [...state.messages, m] };
      return state;
    }
    case "message_update": {
      if (!state.streaming) return state;
      return { ...state, streaming: applyDelta(state.streaming, ev.assistantMessageEvent) };
    }
    case "message_end": {
      const m = ev.message as AgentMessage;
      if (m.role === "user") return state; // already shown at message_start
      const next: ConversationState = { ...state, messages: [...state.messages, m] };
      if (m.role === "assistant") {
        next.streaming = undefined;
        next.lastUsage = m.usage;
        next.sessionUsage = addUsage(state.sessionUsage ?? emptyUsage(), m.usage);
        if (state.turnUsage) next.turnUsage = addUsage(state.turnUsage, m.usage);
        if (m.stopReason === "error" && m.errorMessage) next.lastError = m.errorMessage;
      }
      if (m.role === "toolResult") {
        const run = state.toolRuns[m.toolCallId];
        next.toolRuns = {
          ...state.toolRuns,
          [m.toolCallId]: {
            ...(run ?? { toolCallId: m.toolCallId, toolName: m.toolName, args: undefined }),
            status: "done",
            isError: m.isError,
            result: m,
          },
        };
      }
      return next;
    }
    case "tool_execution_start":
      return {
        ...state,
        toolRuns: {
          ...state.toolRuns,
          [ev.toolCallId]: {
            toolCallId: ev.toolCallId,
            toolName: ev.toolName,
            args: ev.args,
            status: "running",
          },
        },
      };
    case "tool_execution_end": {
      const run = state.toolRuns[ev.toolCallId];
      if (!run) return state;
      return {
        ...state,
        toolRuns: { ...state.toolRuns, [ev.toolCallId]: { ...run, status: "done", isError: ev.isError } },
      };
    }
    default:
      return state;
  }
}

type Delta = Extract<PiAgentEvent, { type: "message_update" }>["assistantMessageEvent"];

function applyDelta(msg: AssistantMessage, d: Delta): AssistantMessage {
  const content = [...msg.content];
  const next: AssistantMessage = { ...msg, content };
  const at = (i: number) => content[i];
  switch (d.type) {
    case "text_start":
      content[d.contentIndex] = { type: "text", text: "" };
      break;
    case "text_delta": {
      const c = at(d.contentIndex);
      content[d.contentIndex] = { type: "text", text: (c?.type === "text" ? c.text : "") + d.delta };
      break;
    }
    case "text_end":
      content[d.contentIndex] = { type: "text", text: d.content };
      break;
    case "thinking_start":
      content[d.contentIndex] = { type: "thinking", thinking: "" };
      break;
    case "thinking_delta": {
      const c = at(d.contentIndex);
      content[d.contentIndex] = {
        type: "thinking",
        thinking: (c?.type === "thinking" ? c.thinking : "") + d.delta,
      };
      break;
    }
    case "thinking_end":
      content[d.contentIndex] = { type: "thinking", thinking: d.content };
      break;
    case "toolcall_start":
      content[d.contentIndex] = {
        type: "toolCall",
        id: d.id,
        name: d.toolName,
        arguments: {},
      } satisfies ToolCall;
      break;
    case "toolcall_delta":
      // arguments arrive complete in toolcall_end; the partial JSON is not worth rendering
      break;
    case "toolcall_end":
      content[d.contentIndex] = d.toolCall;
      break;
    case "done":
      return d.message;
    case "error":
      return d.error;
    default:
      break;
  }
  return next;
}

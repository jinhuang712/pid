import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, ToolCall, ToolResultMessage } from "@earendil-works/pi-ai";
import type { JsonAgentSessionEvent } from "@shared/protocol";

export interface ToolRun {
  toolCallId: string;
  toolName: string;
  args: unknown;
  status: "running" | "done";
  isError?: boolean;
  result?: ToolResultMessage;
}

export interface ConversationState {
  messages: AgentMessage[];
  /** Assistant message currently being streamed, rebuilt from deltas. */
  streaming?: AssistantMessage;
  isStreaming: boolean;
  toolRuns: Record<string, ToolRun>;
  queue: { steering: readonly string[]; followUp: readonly string[] };
  lastError?: string;
}

export const emptyConversation = (): ConversationState => ({
  messages: [],
  isStreaming: false,
  toolRuns: {},
  queue: { steering: [], followUp: [] },
});

export function fromMessages(messages: AgentMessage[]): ConversationState {
  const s = emptyConversation();
  s.messages = messages;
  for (const m of messages) {
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
  return s;
}

export function reduce(state: ConversationState, ev: JsonAgentSessionEvent): ConversationState {
  switch (ev.type) {
    case "agent_start":
      return { ...state, isStreaming: true, lastError: undefined };
    case "agent_end":
      return { ...state, isStreaming: false, streaming: undefined };
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

type Delta = Extract<JsonAgentSessionEvent, { type: "message_update" }>["assistantMessageEvent"];

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

import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { PiAgentEvent, PiDelta } from "@shared/protocol";

/**
 * UPSTREAM API GAP — host-boundary serialization shim. Lives here so the one
 * place PID reshapes Pi's event stays visible.
 *
 * This exists because Pi does not yet expose a host-safe serialized
 * `AgentSessionEvent`. Reduce one session event to what can cross a process
 * boundary:
 *
 * In-process a `message_update` carries the whole partial message on every delta: large, repeated
 * per token, and full of values structured clone rejects. The window rebuilds the message from the
 * deltas, so only the increment is sent. Every other event passes through untouched.
 *
 * A tool call's id and name are lifted out of the partial before it goes, because they are the one
 * thing `toolcall_start` does not carry on its own.
 *
 * This must never grow into PID-specific agent event semantics: it strips
 * transport-unsuitable weight, nothing more.
 */
export function toJsonEvent(event: AgentSessionEvent): PiAgentEvent {
  if (event.type !== "message_update") return event;
  if (event.message.role !== "assistant") {
    throw new Error("message_update message is not an assistant message");
  }
  return {
    type: "message_update",
    usage: event.message.usage,
    assistantMessageEvent: toDelta(event.assistantMessageEvent),
  };
}

type AssistantMessageEvent = Extract<AgentSessionEvent, { type: "message_update" }>["assistantMessageEvent"];

function toDelta(event: AssistantMessageEvent): PiDelta {
  if (event.type === "toolcall_start") {
    const toolCall = event.partial.content[event.contentIndex];
    if (toolCall?.type !== "toolCall") {
      throw new Error(`toolcall_start content at index ${event.contentIndex} is not a tool call`);
    }
    const { partial: _partial, ...delta } = event;
    return { ...delta, id: toolCall.id, toolName: toolCall.name };
  }
  if (!("partial" in event)) return event;
  const { partial: _partial, ...delta } = event;
  return delta;
}

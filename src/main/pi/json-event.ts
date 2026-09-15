import type { AgentSessionEvent, JsonAgentSessionEvent } from "@earendil-works/pi-coding-agent";

/**
 * Make one AgentSessionEvent safe to send to the renderer.
 *
 * In-process, `message_update` carries the whole partial message on every delta, which is
 * both large and full of things structured clone chokes on. Pi strips it the same way before
 * writing to its RPC stream; this is that transform, kept here because the SDK exports the
 * resulting type but not the function that produces it.
 *
 * Keep in step with `dist/modes/json-event.js` when the pinned Pi version moves.
 */
export function toJsonEvent(event: AgentSessionEvent): JsonAgentSessionEvent {
  if (event.type !== "message_update") return event as JsonAgentSessionEvent;
  if (event.message.role !== "assistant") {
    throw new Error("message_update message is not an assistant message");
  }
  return {
    type: "message_update",
    usage: event.message.usage,
    assistantMessageEvent: toJsonAssistantMessageEvent(event.assistantMessageEvent),
  } as JsonAgentSessionEvent;
}

type AssistantMessageEvent = Extract<AgentSessionEvent, { type: "message_update" }>["assistantMessageEvent"];

function toJsonAssistantMessageEvent(event: AssistantMessageEvent) {
  if (event.type === "toolcall_start") {
    const toolCall = event.partial.content[event.contentIndex];
    if (toolCall?.type !== "toolCall") {
      throw new Error(`toolcall_start content at index ${event.contentIndex} is not a tool call`);
    }
    const { partial: _partial, ...deltaEvent } = event;
    return { ...deltaEvent, id: toolCall.id, toolName: toolCall.name };
  }
  if (!("partial" in event)) return event;
  const { partial: _partial, ...deltaEvent } = event;
  return deltaEvent;
}

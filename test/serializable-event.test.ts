import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { toJsonEvent } from "../src/main/pi/compat/serializable-event";

const usage = { input: 10, output: 5 } as never;

const assistantMessage = {
  role: "assistant",
  content: [{ type: "text", text: "hi" }],
  usage,
} as never;

const update = (assistantMessageEvent: unknown): AgentSessionEvent =>
  ({
    type: "message_update",
    message: assistantMessage,
    assistantMessageEvent,
  }) as never;

/**
 * The compat shim strips transport-unsuitable weight from Pi's event and
 * nothing else: the window rebuilds the assistant message from deltas, so
 * only the increment may cross the process boundary.
 */
describe("serializable event", () => {
  it("passes non-update events through untouched", () => {
    const event = { type: "message_end", message: assistantMessage } as never;
    expect(toJsonEvent(event)).toBe(event);
  });

  it("strips the partial message from a text delta but keeps usage", () => {
    const event = update({
      type: "text_delta",
      contentIndex: 0,
      delta: "hi",
      partial: { huge: "live message so far" },
    });
    const out = toJsonEvent(event);
    expect(out).toEqual({
      type: "message_update",
      usage,
      assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "hi" },
    });
    expect(out).not.toHaveProperty("message");
  });

  it("lifts the tool call id and name out of a toolcall_start", () => {
    const event = update({
      type: "toolcall_start",
      contentIndex: 1,
      partial: {
        content: [
          { type: "text", text: "x" },
          { type: "toolCall", id: "tc1", name: "read" },
        ],
      },
    });
    expect(toJsonEvent(event)).toEqual({
      type: "message_update",
      usage,
      assistantMessageEvent: {
        type: "toolcall_start",
        contentIndex: 1,
        id: "tc1",
        toolName: "read",
      },
    });
  });

  it("refuses a message_update that is not an assistant message", () => {
    const event = {
      type: "message_update",
      message: { role: "user", content: "hi" },
      assistantMessageEvent: { type: "text_delta" },
    } as never;
    expect(() => toJsonEvent(event)).toThrow("not an assistant message");
  });

  it("refuses a toolcall_start pointing at non-tool content", () => {
    const event = update({
      type: "toolcall_start",
      contentIndex: 0,
      partial: { content: [{ type: "text", text: "x" }] },
    });
    expect(() => toJsonEvent(event)).toThrow("is not a tool call");
  });
});

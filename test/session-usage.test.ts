import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { JsonAgentSessionEvent } from "@shared/protocol";
import { describe, expect, it } from "vitest";
import { emptyConversation, fromMessages, reduce } from "../src/renderer/state/conversation";
import { emptyUsage, type Usage } from "../src/renderer/turn-summary";

const usage = (input: number, output: number, cost: number): Usage => ({
  ...emptyUsage(),
  input,
  output,
  totalTokens: input + output,
  cost: { input: cost, output: 0, cacheRead: 0, cacheWrite: 0, total: cost },
});

const user = (timestamp = 0): AgentMessage => ({ role: "user", content: "hi", timestamp }) as never;

const assistant = (u: Usage, timestamp = 0): AssistantMessage => ({
  role: "assistant",
  content: [{ type: "text", text: "ok" }],
  api: "anthropic-messages",
  provider: "anthropic",
  model: "m",
  usage: u,
  stopReason: "stop",
  timestamp,
});

const messageEnd = (m: AgentMessage): JsonAgentSessionEvent =>
  ({ type: "message_end", message: m }) as never;

/**
 * The running cost in the usage bar is the session total, not the turn's. It has to survive both
 * ways a conversation arrives: replayed from a file on open, and streamed in live.
 */
describe("session usage", () => {
  it("sums every assistant message of a loaded history", () => {
    const s = fromMessages([
      user(),
      assistant(usage(100, 10, 0.2)),
      user(),
      assistant(usage(50, 5, 0.1)),
    ]);
    expect(s.sessionUsage?.input).toBe(150);
    expect(s.sessionUsage?.output).toBe(15);
    expect(s.sessionUsage?.cost.total).toBeCloseTo(0.3);
  });

  it("keeps accumulating across turns as messages stream in", () => {
    const events = [
      messageEnd(assistant(usage(100, 10, 0.2))),
      messageEnd(assistant(usage(50, 5, 0.1))),
    ];
    const s = events.reduce((acc, e) => reduce(acc, e), emptyConversation());
    expect(s.sessionUsage?.input).toBe(150);
    expect(s.sessionUsage?.cost.total).toBeCloseTo(0.3);
    // The per-turn total is a different number and stays untouched by this.
    expect(s.turnUsage).toBeUndefined();
  });

  it("ignores messages that carry no usage of their own", () => {
    const toolResult: AgentMessage = {
      role: "toolResult",
      toolCallId: "1",
      toolName: "x",
      content: [],
      isError: false,
      timestamp: 0,
    } as never;
    const s = [messageEnd(assistant(usage(10, 1, 0.01))), messageEnd(toolResult)].reduce(
      (acc, e) => reduce(acc, e),
      emptyConversation(),
    );
    expect(s.sessionUsage?.input).toBe(10);
  });

  it("is absent on a session that has not run anything", () => {
    expect(emptyConversation().sessionUsage).toBeUndefined();
    expect(fromMessages([user()]).sessionUsage).toBeUndefined();
  });
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Static markup needs no bridge; settings fall back to their defaults, where steps fold.
vi.mock("../src/renderer/bridge", () => ({ bridge: {} }));
// Static markup has no DOM for DOMPurify, and the fold is not about markdown: render text as text.
vi.mock("../src/renderer/components/Markdown", () => ({
  Markdown: ({ source }: { source: string }) => React.createElement("p", null, source),
}));

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage as AM } from "@earendil-works/pi-ai";
import { Timeline } from "../src/renderer/components/Timeline";
import type { ConversationState } from "../src/renderer/state/conversation";
import { emptyUsage } from "../src/renderer/turn-summary";

/**
 * When the steps of an open turn fold: not when the turn settles, but when the model starts
 * typing its answer — and back open again when work resumes after a burst of text.
 */

const user = (text: string): AgentMessage => ({ role: "user", content: text, timestamp: 0 }) as never;
const assistant = (content: AM["content"]): AM => ({
  role: "assistant",
  content,
  api: "anthropic-messages",
  provider: "p",
  model: "m",
  usage: emptyUsage(),
  stopReason: "stop",
  timestamp: 0,
});
const text = (t: string) => ({ type: "text", text: t }) as const;
const call = (id: string, name = "bash") =>
  ({ type: "toolCall", id, name, arguments: { command: "ls" } }) as const;

const state = (over: Partial<ConversationState>): ConversationState => ({
  messages: [],
  markers: [],
  commands: [],
  compacting: false,
  isStreaming: false,
  toolRuns: {},
  queue: { steering: [], followUp: [] },
  ...over,
});

/** One completed message carrying two tool calls, plus an in-flight message. */
const worked = [assistant([call("1"), call("2")])];
const tail = (content: AM["content"]): ConversationState =>
  state({
    messages: [user("fix it"), ...worked],
    isStreaming: true,
    turnStartedAt: Date.now() - 113_000,
    streaming: assistant(content),
  });

const markup = (s: ConversationState) => renderToStaticMarkup(<Timeline state={s} />);

describe("steps fold when the answer starts, not when the turn settles", () => {
  it("keeps the steps open while the model works", () => {
    const out = markup(tail([call("3")]));
    // The completed tool calls are visible; no step line yet.
    expect(out).toContain("ls");
    expect(out).not.toContain("Working for");
  });

  it("folds them behind a live step line once the answer's first character arrives", () => {
    const out = markup(tail([call("3"), text("so the fix is")]));
    // The step line is there with the live duration and every call counted, including the
    // in-flight message's; the steps themselves are gone.
    expect(out).toContain("Working for 1m 53s · 3 tool calls");
    expect(out).toContain("so the fix is");
    expect(out).not.toContain('"command"'); // the tool argument JSON only shows on an open card
  });

  it("unfolds them again when work resumes after a burst of text", () => {
    const out = markup(tail([call("3"), text("one moment"), call("4")]));
    expect(out).not.toContain("Working for");
    expect(out).toContain("one moment");
  });

  it("keeps the fold through the breath between the final message and the turn marker", () => {
    const final = assistant([call("3"), text("done")]);
    const out = markup(
      state({
        messages: [user("fix it"), ...worked, final],
        isStreaming: true, // message_end fired; agent_end has not
        turnStartedAt: Date.now() - 113_000,
        toolRuns: { "1": { toolCallId: "1", toolName: "bash", args: {}, status: "done" } },
      }),
    );
    expect(out).toContain("Working for 1m 53s · 3 tool calls");
    expect(out).toContain("done");
  });
});

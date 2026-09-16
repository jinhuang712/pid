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
import type { ConversationState, Marker } from "../src/renderer/state/conversation";
import { emptyUsage } from "../src/renderer/turn-summary";

/**
 * When the steps of a turn fold: not while the model is working — not even when it types text
 * between tool calls, which is narration, not the answer — but once the turn settles, all output
 * in and the last print done.
 *
 * Interim text mid-run is the exact regression this file locks: an earlier fold fired on the
 * first streamed character, so every burst of narration collapsed the wall of steps under it and
 * the next tool call unfolded it again — flapping for the whole run.
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
/** The turn marker: everything the model printed is in, the run is over. */
const settled = (final: AM): Marker => ({
  afterIndex: 2,
  kind: "turn",
  text: "Worked for 1m 53s",
  usage: emptyUsage(),
  durationMs: 113_000,
});

const markup = (s: ConversationState) => renderToStaticMarkup(<Timeline state={s} />);

describe("steps fold only when the turn settles", () => {
  it("keeps them open while the model works", () => {
    const out = markup(tail([call("3")]));
    expect(out).toContain("ls");
    expect(out).not.toContain("Worked for");
    expect(out).not.toContain("Working for"); // the fold line; the bottom "Working…" row is fine
  });

  it("keeps them open while the model types between tool calls — narration is not the answer", () => {
    const out = markup(tail([call("3"), text("one moment"), call("4")]));
    expect(out).toContain("one moment");
    expect(out).not.toContain("Working for");
    expect(out).not.toContain("Worked for");
  });

  it("keeps them open while trailing text streams — the fold waits for the whole turn", () => {
    const out = markup(tail([call("3"), text("so the fix is")]));
    expect(out).toContain("so the fix is");
    expect(out).toContain("ls"); // steps still visible beside the streaming text
    expect(out).not.toContain("Working for");
    expect(out).not.toContain("Worked for");
  });

  it("folds them behind the step line once the turn settles", () => {
    const final = assistant([call("3"), text("done")]);
    const out = markup(
      state({
        messages: [user("fix it"), ...worked, final],
        markers: [settled(final)],
      }),
    );
    expect(out).toContain("Worked for 1m 53s · 3 tool calls");
    expect(out).toContain("done");
    expect(out).not.toContain('"command"'); // the tool argument JSON only shows on an open card
  });
});

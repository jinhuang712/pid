import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage as AM } from "@earendil-works/pi-ai";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Static markup needs no bridge; settings fall back to their defaults, where steps fold.
vi.mock("../src/renderer/bridge", () => ({ bridge: {} }));
// Static markup has no DOM for DOMPurify, and this is not about markdown: render text as text.
vi.mock("../src/renderer/components/Markdown", () => ({
  Markdown: ({ source }: { source: string }) => React.createElement("p", null, source),
}));

import { Timeline } from "../src/renderer/components/Timeline";
import type { ConversationState, Marker } from "../src/renderer/state/conversation";
import { emptyUsage } from "../src/renderer/turn-summary";

/**
 * A message an extension injected into the conversation.
 *
 * Pi's coding agent adds this kind to its message union by declaration merging, so the renderer
 * reads the shape rather than the type — and `display` is Pi's own answer to whether a person sees
 * it at all. What PID must never do is print the role: `custom message` is a label for a reader,
 * and the reader does not know what a message role is.
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

const note = (content: unknown, display: boolean): AgentMessage =>
  ({ role: "custom", customType: "pid-worktree", content, display, timestamp: 0 }) as never;

/** A foreign kind: Pi has several, and PID has a shape for none of them. */
const foreign = (role: string): AgentMessage => ({ role, summary: "…", timestamp: 0 }) as never;

const state = (messages: AgentMessage[], markers: Marker[] = []): ConversationState => ({
  messages,
  markers,
  commands: [],
  compacting: false,
  isStreaming: false,
  toolRuns: {},
  queue: { steering: [], followUp: [] },
});

/** The turn marker: all output in, the run over, so the steps fold. */
const settled = (): Marker => ({
  afterIndex: 3,
  kind: "turn",
  text: "Worked for 3s",
  usage: emptyUsage(),
  durationMs: 3000,
});

const markup = (s: ConversationState) => renderToStaticMarkup(<Timeline state={s} />);

describe("an extension's own message", () => {
  it("is drawn with its words and the extension that wrote them", () => {
    const out = markup(
      state([user("go"), assistant([text("done")]), note("Landed `wt-gate` into `main`.", true)]),
    );
    expect(out).toContain("Landed");
    expect(out).toContain("pid-worktree");
    expect(out).not.toContain("custom message");
  });

  it("stays when the turn folds — a note is not a step of the work", () => {
    const out = markup(
      state(
        [
          user("go"),
          assistant([{ type: "toolCall", id: "1", name: "bash", arguments: { command: "pnpm test" } }]),
          note("Landed `wt-gate` into `main`.", true),
          assistant([text("all done")]),
        ],
        [settled()],
      ),
    );
    expect(out).toContain("Worked for 3s"); // the fold happened
    expect(out).not.toContain("pnpm test"); // and hid the work
    expect(out).toContain("Landed"); // but not the note
    expect(out).toContain("all done");
  });

  it("is drawn once, not once per view", () => {
    const out = markup(
      state([user("go"), note("Landed `wt-gate` into `main`.", true), assistant([text("all done")])]),
    );
    expect(out.match(/Landed/g)).toHaveLength(1);
  });

  it("is skipped entirely when Pi says a person does not see it", () => {
    const out = markup(
      state([user("go"), assistant([text("done")]), note("The user approved: land the worktree.", false)]),
    );
    expect(out).not.toContain("The user approved");
    expect(out).not.toContain("custom message");
  });

  it("draws nothing for a note with no words", () => {
    const out = markup(
      state([user("go"), assistant([text("done")]), note([{ type: "image", data: "x" }], true)]),
    );
    expect(out).not.toContain("pid-worktree");
  });

  it("names no role for a kind PID has no shape for", () => {
    const out = markup(
      state([user("go"), foreign("compactionSummary"), assistant([text("done")])]),
    );
    expect(out).not.toContain("compactionSummary");
    expect(out).not.toContain("message");
  });
});

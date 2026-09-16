import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, AssistantMessage as AM } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { fromMessages, type Marker } from "../src/renderer/state/conversation";
import { describeTurn, describeTurnLive, groupTurns, liveAnswer, splitReply } from "../src/renderer/state/turns";
import { emptyUsage } from "../src/renderer/turn-summary";

const user = (timestamp = 0): AgentMessage => ({ role: "user", content: "hi", timestamp }) as never;

const assistant = (content: AM["content"], extra: Partial<AM> = {}): AssistantMessage => ({
  role: "assistant",
  content,
  api: "anthropic-messages",
  provider: "anthropic",
  model: "m",
  usage: emptyUsage(),
  stopReason: "stop",
  timestamp: 0,
  ...extra,
});

const text = (t: string) => ({ type: "text", text: t }) as const;
const call = (id: string, name: string, args: Record<string, unknown>) =>
  ({ type: "toolCall", id, name, arguments: args }) as const;
const result = (id: string): AgentMessage =>
  ({ role: "toolResult", toolCallId: id, toolName: "x", content: [], isError: false, timestamp: 0 }) as never;

describe("groupTurns", () => {
  it("opens a turn per user message and attaches markers by index", () => {
    const messages = [user(), assistant([text("a")]), user(), assistant([call("1", "bash", {})]), result("1")];
    const markers: Marker[] = [
      { afterIndex: 1, kind: "turn", text: "" },
      { afterIndex: 3, kind: "compaction", text: "compacted" },
    ];
    const turns = groupTurns(messages, markers);
    expect(turns.map((t) => [t.start, t.end, t.replies.length])).toEqual([
      [0, 1, 1],
      [2, 4, 2],
    ]);
    expect(turns[0].summary?.kind).toBe("turn");
    expect(turns[1].summary).toBeUndefined();
    expect(turns[1].markers.map((k) => k.text)).toEqual(["compacted"]);
  });

  it("starts a headless turn when history begins mid-reply", () => {
    const turns = groupTurns([assistant([text("a")]), user()], []);
    expect(turns.map((t) => [t.start, t.user === undefined])).toEqual([
      [0, true],
      [1, false],
    ]);
  });
});

describe("splitReply", () => {
  it("keeps the trailing text of the last message as the answer", () => {
    const first = assistant([text("let me look"), call("1", "read", { path: "a.ts" })]);
    const last = assistant([{ type: "thinking", thinking: "hm" }, call("2", "edit", { path: "a.ts" }), text("done")]);
    const replies = [first, result("1"), last].map((m, index) => ({ index, m }));
    const { steps, answer } = splitReply(replies);
    expect(steps.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(steps[2].m).toMatchObject({ content: [{ type: "thinking" }, { type: "toolCall" }] });
    expect(answer?.content).toEqual([text("done")]);
  });

  it("has no steps for a plain text reply and no answer for a dangling tool call", () => {
    expect(splitReply([{ index: 0, m: assistant([text("hi")]) }])).toEqual({
      steps: [],
      answer: assistant([text("hi")]),
    });
    const dangling = splitReply([{ index: 0, m: assistant([call("1", "bash", {})]) }]);
    expect(dangling.steps).toHaveLength(1);
    expect(dangling.answer).toBeUndefined();
  });

  it("keeps an aborted message as the answer so its footer still shows", () => {
    const aborted = assistant([call("1", "bash", {})], { stopReason: "aborted" });
    expect(splitReply([{ index: 0, m: aborted }]).answer?.content).toEqual([]);
  });

  it("flags gateway text sitting in the answer slot", () => {
    const banner = assistant([
      { type: "thinking", thinking: "the reply the user actually wanted" },
      text("--- CONTEXT UPDATE (ignore if irrelevant) ---\n[checkpoint] Save point reached."),
    ]);
    expect(splitReply([{ index: 0, m: banner }]).suspect).toBe(true);
    const placeholder = assistant([text("[System: Empty message content sanitised to satisfy protocol]")]);
    expect(splitReply([{ index: 0, m: placeholder }]).suspect).toBe(true);
    // A leading horizontal rule is markdown, not a banner.
    expect(splitReply([{ index: 0, m: assistant([text("---\n\nheading")]) }]).suspect).toBeUndefined();
  });
});

describe("liveAnswer", () => {
  it("is the trailing text of an in-flight message, once a character has arrived", () => {
    const working = assistant([text(""), { type: "thinking", thinking: "hm" }]);
    expect(liveAnswer(working)).toBeUndefined();
    const speaking = assistant([
      { type: "thinking", thinking: "hm" },
      call("1", "bash", {}),
      text("so here is what I found"),
    ]);
    expect(liveAnswer(speaking)?.content).toEqual([text("so here is what I found")]);
  });

  it("is undefined while the last block is work — a text block may yet be followed by one", () => {
    expect(liveAnswer(assistant([text("narration"), call("1", "bash", {})]) )).toBeUndefined();
    expect(liveAnswer(assistant([{ type: "thinking", thinking: ""}]))).toBeUndefined();
  });
});

describe("describeTurnLive", () => {
  it("says Working with the ticking duration, counts the in-flight message's calls, and accrues usage", () => {
    const usage = { ...emptyUsage(), input: 1000, output: 500, cacheRead: 3000, cacheWrite: 0 };
    const turn = groupTurns(
      [user(), assistant([call("1", "edit", { path: "a.ts" })]), result("1")],
      [],
    )[0];
    const streaming = assistant([call("2", "edit", { path: "b.ts" }), text("answering now")]);
    expect(
      describeTurnLive(turn, { startedAt: 0, usage, streaming }, () => 113_000),
    ).toBe("Working for 1m 53s · 2 tool calls · edited 2 files · 4.5k tokens (75% cached)");
  });

  it("drops what it does not know, like the settled line", () => {
    const bare = groupTurns([user(), assistant([text("ok")])], [])[0];
    expect(describeTurnLive(bare, {}, () => 0)).toBe("Working");
  });
});

describe("describeTurn", () => {
  it("lists duration, tool calls, distinct edited files, tokens with cache share, and cost", () => {
    const usage = { ...emptyUsage(), input: 1000, output: 500, cacheRead: 3000, cacheWrite: 0 };
    usage.cost.total = 0.42;
    const turn = groupTurns(
      [
        user(),
        assistant([call("1", "edit", { path: "a.ts" }), call("2", "edit", { path: "a.ts" })]),
        assistant([call("3", "write", { path: "b.ts" }), call("4", "bash", { command: "ls" }), text("ok")]),
      ],
      [{ afterIndex: 2, kind: "turn", text: "", usage, durationMs: 113_000 }],
    )[0];
    expect(describeTurn(turn)).toBe("Worked for 1m 53s · 4 tool calls · edited 2 files · 4.5k tokens (75% cached) · $0.42");
  });

  it("drops what it does not know", () => {
    const bare = groupTurns([user(), assistant([text("ok")])], [{ afterIndex: 1, kind: "turn", text: "" }])[0];
    expect(describeTurn(bare)).toBe("Worked");
    const one = groupTurns(
      [user(), assistant([call("1", "read", { path: "a" }), text("ok")])],
      [{ afterIndex: 1, kind: "turn", text: "", usage: { ...emptyUsage(), input: 10 }, durationMs: 400 }],
    )[0];
    expect(describeTurn(one)).toBe("Worked for <1s · 1 tool call · 10 tokens");
  });
});

describe("fromMessages turn duration", () => {
  it("spans from the user message to the last reply when timestamps exist", () => {
    const s = fromMessages([user(1000), assistant([text("a")], { timestamp: 4000 }), assistant([text("b")], { timestamp: 13_000 })]);
    expect(s.markers[0]).toMatchObject({ kind: "turn", durationMs: 12_000, text: "12s" });
  });
});

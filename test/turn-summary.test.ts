import type { AssistantMessage } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { emptyConversation, fromMessages, reduce } from "../src/renderer/state/conversation";
import { addUsage, emptyUsage, fmtCost, fmtDuration, fmtTokens, summarizeTurn } from "../src/renderer/turn-summary";

const usage = (input: number, output: number, cost: number, cacheRead = 0) => ({
  ...emptyUsage(),
  input,
  output,
  cacheRead,
  totalTokens: input + output + cacheRead,
  cost: { ...emptyUsage().cost, total: cost },
});

const assistant = (u: ReturnType<typeof usage>, timestamp = 0): AssistantMessage => ({
  role: "assistant",
  content: [{ type: "text", text: "ok" }],
  api: "anthropic-messages",
  provider: "anthropic",
  model: "m",
  usage: u,
  stopReason: "stop",
  timestamp,
});

describe("fmtDuration", () => {
  it("scales units", () => {
    expect(fmtDuration(400)).toBe("<1s");
    expect(fmtDuration(12_000)).toBe("12s");
    expect(fmtDuration(113_000)).toBe("1m 53s");
    expect(fmtDuration(3_840_000)).toBe("1h 04m");
  });
});

describe("fmtTokens / fmtCost", () => {
  it("abbreviates", () => {
    expect(fmtTokens(842)).toBe("842");
    expect(fmtTokens(24_200)).toBe("24.2k");
    expect(fmtTokens(1_300_000)).toBe("1.3M");
    expect(fmtTokens(120_000)).toBe("120k");
  });
  it("hides zero cost and floors tiny cost", () => {
    expect(fmtCost(0)).toBeUndefined();
    expect(fmtCost(0.004)).toBe("<$0.01");
    expect(fmtCost(0.42)).toBe("$0.42");
  });
});

describe("summarizeTurn", () => {
  it("joins the parts it has", () => {
    const s = summarizeTurn(usage(12_100, 4_200, 0.42, 50_300), 113_000);
    expect(s?.text).toBe("1m 53s · 66.6k tokens · $0.42");
    expect(s?.detail).toBe("12.1k in · 4.2k out · 50.3k cached");
    expect(summarizeTurn(usage(1000, 0, 0))?.text).toBe("1k tokens");
    expect(summarizeTurn(emptyUsage())).toBeUndefined();
  });
});

describe("conversation turn markers", () => {
  it("sums usage across a run and stamps duration on agent_end", () => {
    let t = 1000;
    const now = () => t;
    let s = reduce(emptyConversation(), { type: "agent_start" } as never, now);
    expect(s.turnStartedAt).toBe(1000);
    s = reduce(s, { type: "message_end", message: assistant(usage(100, 50, 0.1)) } as never, now);
    s = reduce(s, { type: "message_end", message: assistant(usage(200, 50, 0.2)) } as never, now);
    t = 13_000;
    s = reduce(s, { type: "agent_end" } as never, now);
    expect(s.turnStartedAt).toBeUndefined();
    expect(s.markers).toHaveLength(1);
    expect(s.markers[0]).toMatchObject({
      afterIndex: 1,
      kind: "turn",
      text: "12s · 400 tokens · $0.30",
      detail: "300 in · 100 out · 0 cached",
      durationMs: 12_000,
    });
    expect(s.markers[0].usage?.input).toBe(300);
    expect(addUsage(usage(1, 1, 1), usage(2, 2, 2)).cost.total).toBe(3);
  });

  it("closes a turn per user message when loading history, without duration", () => {
    const user = { role: "user", content: "hi", timestamp: 0 } as never;
    const s = fromMessages([user, assistant(usage(100, 0, 0)), assistant(usage(0, 100, 0.05)), user, assistant(usage(10, 0, 0))]);
    expect(s.markers.map((m) => [m.afterIndex, m.text])).toEqual([
      [2, "200 tokens · $0.05"],
      [4, "10 tokens"],
    ]);
  });
});

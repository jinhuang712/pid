import type { PiEvent } from "@shared/protocol";
import { describe, expect, it } from "vitest";
import { UiState } from "../src/main/pi/ui-state";

const status = (key: string, text: string | undefined): PiEvent =>
  ({ type: "dialog", id: `st-${key}-${text}`, method: "setStatus", statusKey: key, statusText: text }) as PiEvent;
const widget = (key: string, lines: string[] | undefined): PiEvent =>
  ({
    type: "dialog",
    id: `wg-${key}-${lines?.join(",")}`,
    method: "setWidget",
    widgetKey: key,
    widgetLines: lines,
  }) as PiEvent;
const notify = (message: string): PiEvent => ({ type: "dialog", id: "n", method: "notify", message }) as PiEvent;

describe("what a session shows", () => {
  it("replays the latest line per key", () => {
    const ui = new UiState();
    ui.note(status("mcp", "connecting"));
    ui.note(status("mcp", "1 connected"));

    expect(ui.replay()).toEqual([status("mcp", "1 connected")]);
  });

  it("keeps a status and a widget that share a key apart", () => {
    const ui = new UiState();
    ui.note(status("x", "working"));
    ui.note(widget("x", ["line a"]));

    expect(ui.replay()).toEqual([status("x", "working"), widget("x", ["line a"])]);
  });

  it("forgets a line the extension cleared", () => {
    const ui = new UiState();
    ui.note(widget("rows", ["a", "b"]));
    ui.note(widget("rows", []));
    expect(ui.replay()).toEqual([widget("rows", [])]); // an empty widget is a line, not a clear
    ui.note(widget("rows", undefined));
    ui.note(status("rows", undefined));

    expect(ui.replay()).toEqual([]);
  });

  it("keeps no news", () => {
    const ui = new UiState();
    ui.note(notify("the run finished"));
    ui.note({ type: "agent_start" } as PiEvent);

    expect(ui.replay()).toEqual([]);
  });
});

import type { ToolCall } from "@earendil-works/pi-ai";
import type { ReactNode } from "react";
import type { FrameProps } from "../components/ToolCard";
import type { ToolRun } from "../state/conversation";

/**
 * What a plugin registers, and what it is handed when it draws.
 *
 * Every mount point is somewhere PID already puts something of its own — the navigation list, the
 * session title bar, the line above the composer, a tool call in the transcript. None of them was
 * invented for plugins, which is the check that keeps the list honest: a slot nothing occupies is a
 * slot nobody has looked at.
 */

export type Mount = "page" | "header" | "strip";

/** Handed to every render. `state` is whatever this plugin's own agent half last published. */
export interface PluginContext<T = unknown> {
  state: T | undefined;
  /** Runs a command in the session this plugin is drawing for, as though the user typed it. */
  run: (command: string) => Promise<unknown>;
  /** The folder of that session, for a plugin that wants to say where it is. */
  cwd: string | undefined;
  /**
   * What is typed in the page's search box, for a page that asked for one. Empty otherwise.
   *
   * The box is PID's, so it looks and behaves like the one on Skills and Extensions and keeps its
   * text when the plugin re-renders. What matches is the plugin's: only it knows whether a query
   * should reach a row's title, its tools, or the error underneath.
   */
  query: string;
}

export interface PageSpec {
  /** Shown in the navigation and as the page's heading. Defaults to the plugin's own id. */
  label?: string;
  /**
   * One line under the heading. A function so it can read the same state the body does — a count,
   * a warning — rather than being fixed at registration.
   */
  note?: (ctx: PluginContext) => ReactNode;
  /** Placeholder for the search box. Omit for a page that has nothing to search. */
  search?: string;
  render: (ctx: PluginContext) => ReactNode;
}

export interface LineSpec {
  render: (ctx: PluginContext) => ReactNode;
}

/**
 * What a tool renderer is handed.
 *
 * `Frame` is the row PID's own tools are drawn in, with this call already in it — chevron, status,
 * output, images — so a plugin says what is different about its tool and inherits the rest. Pi does
 * the same thing in the terminal, where a tool's `renderCall` composes pi-tui's widgets rather than
 * painting a row from scratch.
 */
export interface ToolDraw {
  call: ToolCall;
  run: ToolRun | undefined;
  Frame: (props: FrameProps) => ReactNode;
}

export interface ToolSpec {
  /**
   * The tools this draws. They are the plugin's own, and PID does not check that: an extension
   * claiming a name it never registered draws a row for a call that never arrives.
   */
  names: string[];
  render: (draw: ToolDraw, ctx: PluginContext) => ReactNode;
}

/**
 * The object a plugin's default export receives.
 *
 * Deliberately small. A plugin that needs something not here should say so — widening this is a
 * decision, whereas reaching around it is a bug waiting to happen.
 */
export interface PluginApi {
  /** The id PID knows this plugin by: its extension's name, and its publishing namespace. */
  readonly id: string;
  page: (spec: PageSpec) => void;
  header: (spec: LineSpec) => void;
  strip: (spec: LineSpec) => void;
  /** Called more than once when a plugin ships more than one tool. */
  tool: (spec: ToolSpec) => void;
}

export type PluginModule = (api: PluginApi) => void;

/** Everything one plugin registered. */
export interface Registered {
  id: string;
  page?: PageSpec;
  header?: LineSpec;
  strip?: LineSpec;
  tools?: ToolSpec[];
  /** Set when the module threw on import or during registration. */
  error?: string;
}

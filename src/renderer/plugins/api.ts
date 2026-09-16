import type { ReactNode } from "react";

/**
 * What a plugin registers, and what it is handed when it draws.
 *
 * Every mount point is somewhere PID already puts something of its own — the navigation list, the
 * session title bar, the line above the composer. None of them was invented for plugins, which is
 * the check that keeps the list honest: a slot nothing occupies is a slot nobody has looked at.
 */

export type Mount = "page" | "header" | "strip";

/** Handed to every render. `state` is whatever this plugin's own agent half last published. */
export interface PluginContext<T = unknown> {
  state: T | undefined;
  /** Runs a command in the session this plugin is drawing for, as though the user typed it. */
  run: (command: string) => Promise<unknown>;
  /** The folder of that session, for a plugin that wants to say where it is. */
  cwd: string | undefined;
}

export interface PageSpec {
  /** Shown in the navigation. Defaults to the plugin's own id. */
  label?: string;
  render: (ctx: PluginContext) => ReactNode;
}

export interface LineSpec {
  render: (ctx: PluginContext) => ReactNode;
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
}

export type PluginModule = (api: PluginApi) => void;

/** Everything one plugin registered. */
export interface Registered {
  id: string;
  page?: PageSpec;
  header?: LineSpec;
  strip?: LineSpec;
  /** Set when the module threw on import or during registration. */
  error?: string;
}

import { useEffect, useMemo, useState } from "react";
import type { Proc } from "../state/workspace";
import type { PluginContext, Registered } from "./api";
import { loadPlugins } from "./load";

/**
 * The plugins loaded for the active folder.
 *
 * Reloaded when the folder changes, because which extensions Pi resolves is a property of the
 * directory: a project-local extension exists in one folder and not the next, and the window must
 * show the same set the terminal would load there.
 */
export function usePlugins(cwd: string | undefined): Registered[] {
  const [plugins, setPlugins] = useState<Registered[]>([]);
  useEffect(() => {
    let live = true;
    void loadPlugins(cwd).then((list) => {
      if (live) setPlugins(list);
    });
    return () => {
      live = false;
    };
  }, [cwd]);
  return plugins;
}

/**
 * What a plugin's agent half last published, as its desktop half sees it.
 *
 * The lines crossed as whatever `setWidget` was handed. JSON is the shape every extension so far
 * publishes, so it is parsed; anything else is passed through as the lines themselves rather than
 * being dropped, because a plugin that publishes plain text still wrote it on purpose.
 */
export function pluginState(lines: string[] | undefined): unknown {
  if (!lines || lines.length === 0) return undefined;
  try {
    return JSON.parse(lines.join("\n"));
  } catch {
    return lines;
  }
}

/** Memoised context for a plugin, so a stable state does not redraw its page every keystroke. */
export function usePluginContext(
  id: string,
  proc: Proc | undefined,
  run: (command: string) => Promise<unknown>,
): PluginContext {
  const lines = proc?.widgets[id];
  const cwd = proc?.cwd;
  return useMemo(() => ({ state: pluginState(lines), run, cwd }), [lines, cwd, run]);
}

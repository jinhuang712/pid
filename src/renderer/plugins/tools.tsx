import { createContext, type ReactNode, useContext, useMemo } from "react";
import { ToolCallFrame } from "../components/ToolCard";
import type { ToolRenderProps } from "../contributions/tools";
import type { Proc } from "../state/workspace";
import type { PluginContext, Registered, ToolSpec } from "./api";
import { pluginState } from "./usePlugins";

/**
 * Who draws a tool call: the extension that owns the tool, or PID.
 *
 * The other three mounts are places in the window PID hands over wholesale. This one is a lookup,
 * because a tool call arrives in the middle of the transcript and nothing up the tree knows which
 * extension it belongs to. So the resolver rides a context and the timeline asks it per call,
 * falling through to the built-in registry when no loaded plugin claims the name.
 *
 * Load order decides ties. Two extensions claiming one tool name is their problem — PID picking a
 * winner by a rule of its own would be PID adjudicating between extensions.
 *
 * Nothing here catches: the timeline already wraps every row in `ToolRendererBoundary`, which
 * degrades a throwing renderer to the generic card. A card is a better answer than a red line.
 */

/** Resolves a tool name to a renderer, or to nothing when no loaded plugin claims it. */
export type PluginToolResolver = (toolName: string) => ((props: ToolRenderProps) => ReactNode) | undefined;

const Ctx = createContext<PluginToolResolver>(() => undefined);

/** What the timeline calls. Outside a provider it claims nothing, so PID's own rows are unaffected. */
export function usePluginTool(): PluginToolResolver {
  return useContext(Ctx);
}

/** First claim wins, so a plugin that loaded earlier keeps its tool. */
function claims(plugins: Registered[]): Map<string, { id: string; spec: ToolSpec }> {
  const out = new Map<string, { id: string; spec: ToolSpec }>();
  for (const plugin of plugins) {
    for (const spec of plugin.tools ?? []) {
      for (const name of spec.names) if (!out.has(name)) out.set(name, { id: plugin.id, spec });
    }
  }
  return out;
}

/**
 * Builds the resolver the timeline reads.
 *
 * The contexts are built in one memo rather than per plugin, because a hook cannot be called in a
 * loop over a list whose length changes when the folder does.
 */
export function pluginToolResolver(
  plugins: Registered[],
  widgets: Record<string, string[] | undefined> | undefined,
  cwd: string | undefined,
  run: (command: string) => Promise<unknown>,
): PluginToolResolver {
  const byName = claims(plugins);
  if (byName.size === 0) return () => undefined;
  const contexts: Record<string, PluginContext> = {};
  for (const plugin of plugins) {
    contexts[plugin.id] = { state: pluginState(widgets?.[plugin.id]), run, cwd };
  }
  return (toolName) => {
    const hit = byName.get(toolName);
    if (!hit) return undefined;
    const ctx = contexts[hit.id];
    if (!ctx) return undefined;
    return ({ call, run: toolRun }) =>
      hit.spec.render(
        { call, run: toolRun, Frame: (props) => <ToolCallFrame call={call} run={toolRun} {...props} /> },
        ctx,
      );
  };
}

export function PluginTools({
  plugins,
  proc,
  run,
  children,
}: {
  plugins: Registered[];
  proc: Proc | undefined;
  run: (command: string) => Promise<unknown>;
  children: ReactNode;
}) {
  const widgets = proc?.widgets;
  const cwd = proc?.cwd;
  const resolve = useMemo(() => pluginToolResolver(plugins, widgets, cwd, run), [plugins, widgets, cwd, run]);
  return <Ctx.Provider value={resolve}>{children}</Ctx.Provider>;
}

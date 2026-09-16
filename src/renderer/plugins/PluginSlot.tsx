import type { Proc } from "../state/workspace";
import type { Mount, Registered } from "./api";
import { PluginBoundary } from "./Boundary";
import { usePluginContext } from "./usePlugins";

/**
 * One plugin drawing at one mount point.
 *
 * The plugin's own published lines become its `state`; the command callback runs in the session it
 * is drawing for. A plugin that failed to load draws its error instead, so the author finds it in
 * the place the working version would have been.
 */
export function PluginSlot({
  plugin,
  where,
  proc,
  run,
}: {
  plugin: Registered;
  where: Mount;
  proc: Proc | undefined;
  run: (command: string) => Promise<unknown>;
}) {
  const ctx = usePluginContext(plugin.id, proc, run);
  if (plugin.error) {
    return (
      <div className="px-3 py-1.5 text-xs text-danger truncate" title={plugin.error}>
        {plugin.id}: {plugin.error}
      </div>
    );
  }
  const spec = where === "page" ? plugin.page : where === "header" ? plugin.header : plugin.strip;
  if (!spec) return null;
  return <PluginBoundary id={plugin.id}>{spec.render(ctx)}</PluginBoundary>;
}

/** Every plugin that registered something at `where`, in load order. */
export function PluginSlots({
  plugins,
  where,
  proc,
  run,
}: {
  plugins: Registered[];
  where: Mount;
  proc: Proc | undefined;
  run: (command: string) => Promise<unknown>;
}) {
  const shown = plugins.filter((p) => p.error || (where === "header" ? p.header : p.strip));
  if (shown.length === 0) return null;
  return (
    <>
      {shown.map((p) => (
        <PluginSlot key={p.id} plugin={p} where={where} proc={proc} run={run} />
      ))}
    </>
  );
}

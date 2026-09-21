import { type ReactNode, useState } from "react";
import { PageShell } from "../pages/PageShell";
import type { Proc } from "../state/workspace";
import type { Mount, PluginContext, Registered } from "./api";
import { PluginBoundary } from "./Boundary";
import { usePluginContext } from "./usePlugins";

/**
 * The plugin's own render function, called one level below the boundary rather than in the slot's
 * body.
 *
 * React consults a boundary only for errors raised in its descendants, so `spec.render(ctx)`
 * written inline throws *above* PluginBoundary and takes the whole window down — the one outcome
 * the boundary exists to prevent. The tool mount wraps its renderers the same way, for the same
 * reason.
 */
function PluginRender({
  render,
  ctx,
}: {
  render: (ctx: PluginContext) => ReactNode;
  ctx: PluginContext;
}): ReactNode {
  return <>{render(ctx)}</>;
}

/** Exported for the test that asserts a plugin's render runs below the boundary, not above it. */
export { PluginRender };

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
  const spec = where === "header" ? plugin.header : plugin.strip;
  if (!spec) return null;
  return (
    <PluginBoundary id={plugin.id} resetKey={spec}>
      <PluginRender render={spec.render} ctx={ctx} />
    </PluginBoundary>
  );
}

/**
 * A plugin's page, in the frame PID's own pages use.
 *
 * The heading, the search box and the scrolling region are the host's, so an extension's page sits
 * at the same rhythm as Skills and Extensions instead of starting from a blank div — which is what
 * it did, and why it read as a wall of rows with no title above them. What the query matches is
 * still the plugin's business; the box only holds the text and hands it over.
 */
export function PluginPage({
  plugin,
  proc,
  run,
  onClose,
}: {
  plugin: Registered;
  proc: Proc | undefined;
  run: (command: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const ctx = usePluginContext(plugin.id, proc, run, query);
  const spec = plugin.page;
  if (plugin.error || !spec) {
    return (
      <PageShell title={plugin.id} onClose={onClose}>
        <div className="text-xs text-danger whitespace-pre-wrap">
          {plugin.error ?? "this extension registered no page"}
        </div>
      </PageShell>
    );
  }
  return (
    <PageShell
      title={spec.label ?? plugin.id}
      note={
        spec.note && (
          <PluginBoundary id={plugin.id} resetKey={spec}>
            <PluginRender render={spec.note} ctx={ctx} />
          </PluginBoundary>
        )
      }
      search={spec.search === undefined ? undefined : query}
      searchPlaceholder={spec.search}
      onSearch={spec.search === undefined ? undefined : setQuery}
      onClose={onClose}
    >
      <PluginBoundary id={plugin.id} resetKey={spec}>
        <PluginRender render={spec.render} ctx={ctx} />
      </PluginBoundary>
    </PageShell>
  );
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

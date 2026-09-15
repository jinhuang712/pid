// Direct, never `from "."`: inside `contributions/` a bare "." resolves to the package this
// app imports from, not to this folder, and the registry must come from `tools.tsx`.

import { diffStats } from "../components/DiffBlock";
import { ToolCallFrame } from "../components/ToolCard";
import { type ToolRegistry, toolRenderers } from "./tools";

/**
 * Built-in tool renderers — the registry's first real registrants.
 *
 * A registration is for a presentation the generic card cannot express on its own: `edit` shows a
 * tinted diff above the output and puts "+3 −1" on the collapsed line, `bash` shows the command
 * rather than a JSON blob. Anything without a registration keeps the card, so this file stays a
 * list of exceptions — not a catalog of every tool, and not a second copy of the card's chrome.
 */

/** Per registry, so a test's own registry is not skipped by the app's registration. */
const registered = new WeakSet<ToolRegistry>();

/** Idempotent: a renderer reload must not stack duplicate registrations. */
export function registerBuiltInToolRenderers(registry: ToolRegistry = toolRenderers): void {
  if (registered.has(registry)) return;
  registered.add(registry);
  registry.register({
    name: "pid:edit",
    match: (toolName) => toolName === "edit",
    render: ({ call, run }) => (
      <ToolCallFrame call={call} run={run} meta={diffStats(run?.result?.details?.patch)} />
    ),
  });
  registry.register({
    name: "pid:bash",
    match: (toolName) => toolName === "bash",
    render: ({ call, run }) => <ToolCallFrame call={call} run={run} body="command" />,
  });
}

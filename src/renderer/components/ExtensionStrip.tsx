import { parseWidgetKey } from "@shared/extension-widgets";
import { stripAnsi } from "./ExtensionUI";

/**
 * What extensions put on screen, above the composer — the same place the terminal puts it.
 *
 * Pi's `setWidget` and `setStatus` are how an extension shows something without owning any part of
 * the interface, and the terminal renders whatever key it is given. PID does the same: no allowlist,
 * no name PID has to know in advance. An extension that wants more than a line of text names its
 * widget `<ns>:<kind>/v<n>` and sends JSON; until PID has a renderer for that kind, the payload
 * shows as itself, so the author can see it arrived.
 *
 * Extension strings are written for a terminal, so they arrive carrying colour. PID strips it and
 * applies its own.
 */
export function ExtensionStrip({
  widgets,
  statuses,
}: {
  widgets: Record<string, string[]>;
  statuses: Record<string, string>;
}) {
  const status = Object.entries(statuses)
    .map(([key, text]) => [key, stripAnsi(text).trim()] as const)
    .filter(([, text]) => text.length > 0);
  const widget = Object.entries(widgets)
    .map(([key, lines]) => ({ key, structured: parseWidgetKey(key), lines: lines.map(stripAnsi) }))
    .filter((w) => w.lines.some((l) => l.trim().length > 0));

  if (status.length === 0 && widget.length === 0) return null;

  return (
    <div className="shrink-0 px-6 py-1 flex flex-col gap-1 text-xs border-t border-line">
      {widget.map((w) => (
        <div key={w.key} className="flex items-baseline gap-2 min-w-0">
          <span className="shrink-0 text-ink-3 font-mono" title={w.key}>
            {w.structured ? `${w.structured.ns}:${w.structured.kind}` : w.key}
          </span>
          {w.structured ? (
            // Nothing claims this kind yet. Show the payload rather than dropping it, so an
            // extension author can tell PID received what they sent.
            <code className="min-w-0 truncate text-ink-3">{w.lines.join(" ")}</code>
          ) : (
            <span className="min-w-0 flex flex-col text-ink-2">
              {w.lines.map((line, i) => (
                // Widget lines have no identity of their own; their position is what they are.
                // biome-ignore lint/suspicious/noArrayIndexKey: line order is the only key there is
                <span key={i} className="truncate font-mono">
                  {line}
                </span>
              ))}
            </span>
          )}
        </div>
      ))}
      {status.length > 0 && (
        <div className="flex items-baseline gap-3 min-w-0 flex-wrap text-ink-3">
          {status.map(([key, text]) => (
            <span key={key} className="truncate" title={key}>
              {text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

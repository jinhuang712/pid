import { stripAnsi } from "./ExtensionUI";

/**
 * `setStatus` text, above the composer — the same place the terminal puts it.
 *
 * No allowlist and no interpretation: whatever key an extension used, its text appears. Extension
 * strings are written for a terminal, so they arrive carrying colour; PID strips it and applies its
 * own. Anything richer than a line is a plugin's job, one slot down.
 */
export function StatusLine({ statuses }: { statuses: Record<string, string> }) {
  const shown = Object.entries(statuses)
    .map(([key, text]) => [key, stripAnsi(text).trim()] as const)
    .filter(([, text]) => text.length > 0);
  if (shown.length === 0) return null;
  return (
    <div className="shrink-0 px-6 py-1 flex items-baseline gap-3 flex-wrap text-xs text-ink-3">
      {shown.map(([key, text]) => (
        <span key={key} className="truncate" title={key}>
          {text}
        </span>
      ))}
    </div>
  );
}

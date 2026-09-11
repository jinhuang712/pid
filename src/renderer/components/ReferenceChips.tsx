import { useState } from "react";
import { estimateTokens, renderReference, type SessionReference } from "../session-reference";

/** Shows exactly what a $session reference will attach: which session, how much, and the text itself. */
export function ReferenceChips({
  refs,
  onRemove,
}: {
  refs: SessionReference[];
  onRemove: (token: string) => void;
}) {
  const [openToken, setOpenToken] = useState<string>();
  if (refs.length === 0) return null;
  const open = refs.find((r) => r.token === openToken);
  const rendered = open ? renderReference(open) : undefined;
  return (
    <div className="shrink-0 px-6">
      <div className="max-w-3xl mx-auto flex flex-wrap gap-2 pb-2">
        {refs.map((r) => {
          const rr = renderReference(r);
          const label = r.session.name || r.session.firstMessage.slice(0, 40) || r.session.id;
          return (
            <div
              key={r.token}
              className="flex items-center gap-1 h-6 pl-2 pr-1 rounded-full bg-paper-3 text-xs text-ink"
            >
              <span className="font-mono text-warn">{r.token}</span>
              <span className="truncate max-w-48">{label}</span>
              <span className="text-ink-3">
                · {rr.included}/{rr.total} msgs · ~{estimateTokens(rr.chars).toLocaleString()} tok
              </span>
              <button
                type="button"
                onClick={() => setOpenToken(openToken === r.token ? undefined : r.token)}
                className="px-1 text-ink-2 hover:text-ink"
              >
                {openToken === r.token ? "hide" : "inspect"}
              </button>
              <button
                type="button"
                onClick={() => onRemove(r.token)}
                className="px-1 text-ink-2 hover:text-danger"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      {rendered && (
        <div className="max-w-3xl mx-auto mb-2 rounded-lg border border-line bg-paper-2">
          <div className="px-3 h-7 flex items-center text-xs text-ink-3 border-b border-line">
            This exact text will be appended to your message
          </div>
          <pre className="px-3 py-2 text-xs text-ink-2 whitespace-pre-wrap max-h-64 overflow-y-auto font-mono">
            {rendered.text}
          </pre>
        </div>
      )}
    </div>
  );
}

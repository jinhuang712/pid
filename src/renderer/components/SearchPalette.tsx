import type { SearchHit, SessionSummary } from "@shared/sessions";
import { useEffect, useRef, useState } from "react";
import { bridge } from "../bridge";

/**
 * Session search: retrieval, not memory. Searches title, content, folder across
 * the current folder or everything. Enter opens; Cmd+Enter references ($) instead.
 */
export function SearchPalette({
  initialQuery = "",
  folder,
  onClose,
  onOpen,
  onReference,
}: {
  initialQuery?: string;
  folder?: string;
  onClose: () => void;
  onOpen: (s: SessionSummary) => void;
  onReference: (s: SessionSummary) => void;
}) {
  const [q, setQ] = useState(initialQuery);
  const [scope, setScope] = useState<"folder" | "all">(folder ? "folder" : "all");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    input.current?.focus();
  }, []);

  useEffect(() => {
    const n = ++seq.current;
    setBusy(true);
    const t = setTimeout(() => {
      void bridge.sessions.search(q, scope === "folder" && folder ? { cwd: folder } : {}).then((h) => {
        if (n !== seq.current) return;
        setHits(h);
        setCursor(0);
        setBusy(false);
      });
    }, 80);
    return () => clearTimeout(t);
  }, [q, scope, folder]);

  const pick = (h: SearchHit, asRef: boolean) => {
    if (asRef) onReference(h.session);
    else onOpen(h.session);
    onClose();
  };

  return (
    <div className="absolute inset-0 z-40 bg-black/30 flex items-start justify-center pt-[12vh]">
      <button
        type="button"
        aria-label="Close search"
        className="absolute inset-0 cursor-default"
        onMouseDown={onClose}
      />
      <dialog
        open
        aria-label="Search sessions"
        className="relative m-0 p-0 w-[720px] max-w-[92vw] rounded-xl border border-line bg-paper-2 shadow-2xl flex flex-col max-h-[70vh] text-ink"
      >
        <div className="flex items-center gap-2 px-3 h-11 border-b border-line">
          <span className="text-ink-3">⌕</span>
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") setCursor((c) => Math.min(c + 1, hits.length - 1));
              else if (e.key === "ArrowUp") setCursor((c) => Math.max(c - 1, 0));
              else if (e.key === "Enter" && hits[cursor]) pick(hits[cursor], e.metaKey || e.ctrlKey);
              else if (e.key === "Tab") {
                e.preventDefault();
                setScope(scope === "all" ? "folder" : "all");
              }
            }}
            placeholder="Search sessions… title, message content, folder"
            className="flex-1 bg-transparent outline-none text-ink placeholder:text-ink-3"
          />
          <button
            type="button"
            onClick={() => setScope(scope === "all" ? "folder" : "all")}
            disabled={!folder}
            className="h-6 px-2 rounded-md bg-paper-3 text-xs text-ink-2 hover:text-ink disabled:opacity-40"
            title="Tab to toggle"
          >
            {scope === "all" ? "all folders" : "this folder"}
          </button>
        </div>
        <div className="overflow-y-auto">
          {hits.length === 0 && (
            <div className="px-4 py-3 text-xs text-ink-3">{busy ? "Searching…" : "No sessions match"}</div>
          )}
          {hits.map((h, i) => (
            <button
              type="button"
              key={h.session.path}
              onMouseEnter={() => setCursor(i)}
              onClick={(e) => pick(h, e.metaKey || e.ctrlKey)}
              className={`w-full text-left px-4 py-2 border-b border-line/60 ${i === cursor ? "bg-paper-3" : ""}`}
            >
              <div className="flex items-center gap-2 text-sm">
                <span className="text-ink truncate">
                  {h.session.name || h.session.firstMessage || "(empty)"}
                </span>
                <span className="flex-1" />
                <span className="text-xs text-ink-3 shrink-0">{h.session.messageCount} msgs</span>
                <span className="text-xs text-ink-3 shrink-0">
                  {new Date(h.session.modified).toLocaleDateString()}
                </span>
              </div>
              <div className="text-xs text-ink-3 truncate">
                {h.session.cwd.replace(/^\/Users\/[^/]+/, "~")}
              </div>
              {q && <div className="text-xs text-ink-2 mt-0.5 line-clamp-2">{h.snippet}</div>}
            </button>
          ))}
        </div>
        <div className="px-4 h-7 flex items-center gap-3 text-xs text-ink-3 border-t border-line">
          <span>↵ open</span>
          <span>⌘↵ reference in composer</span>
          <span>Tab scope</span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => void bridge.sessions.dropIndex().then(() => setQ((s) => `${s}`))}
            className="hover:text-ink"
          >
            rebuild index
          </button>
        </div>
      </dialog>
    </div>
  );
}

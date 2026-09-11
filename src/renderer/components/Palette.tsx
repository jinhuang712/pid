import type { FolderSuggestion, SearchHit, SessionSummary } from "@shared/sessions";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { bridge } from "../bridge";
import { Keys } from "./Key";

const base = (p: string) => p.split("/").filter(Boolean).pop() ?? p;
const home = (p: string) => p.replace(/^\/Users\/[^/]+/, "~");
const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string[];
  run: () => void;
}

type Item =
  | { kind: "folder"; f: FolderSuggestion }
  | { kind: "session"; h: SearchHit }
  | { kind: "message"; h: SearchHit }
  | { kind: "action"; a: PaletteAction }
  | { kind: "ask"; text: string };

/**
 * ⌘K. One box for everything you would otherwise hunt for: folders to open (typed paths,
 * recent, their neighbours), sessions by title, past conversation by content (BM25 over every
 * message), and PID's own actions. Anything unmatched can be sent to Pi in the current folder.
 */
export function Palette({
  folder,
  actions,
  onClose,
  onOpenFolder,
  onOpenSession,
  onReference,
  onAsk,
}: {
  folder?: string;
  actions: PaletteAction[];
  onClose: () => void;
  onOpenFolder: (dir: string) => void;
  onOpenSession: (s: SessionSummary) => void;
  onReference: (s: SessionSummary) => void;
  onAsk: (text: string) => void;
}) {
  const [q, setQ] = useState("");
  const [folders, setFolders] = useState<FolderSuggestion[]>([]);
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
      void Promise.all([bridge.folders.suggest(q), bridge.sessions.search(q, {})]).then(([fs, hs]) => {
        if (n !== seq.current) return;
        setFolders(fs);
        setHits(hs);
        setCursor(0);
        setBusy(false);
      });
    }, 60);
    return () => clearTimeout(t);
  }, [q]);

  const items = useMemo<Item[]>(() => {
    const ql = q.trim().toLowerCase();
    const pathy = ql.startsWith("~") || ql.startsWith("/");
    const acts = actions.filter((a) => !ql || a.label.toLowerCase().includes(ql));
    const sessions = hits.filter((h) => h.kind === "title").slice(0, pathy ? 0 : 6);
    const messages = hits.filter((h) => h.kind === "message").slice(0, pathy ? 0 : 8);
    const fs = folders.slice(0, pathy ? 12 : ql ? 4 : 5);
    const list: Item[] = [
      ...fs.map((f) => ({ kind: "folder", f }) as Item),
      ...sessions.map((h) => ({ kind: "session", h }) as Item),
      ...messages.map((h) => ({ kind: "message", h }) as Item),
      ...acts.map((a) => ({ kind: "action", a }) as Item),
    ];
    if (ql && !pathy && folder) list.push({ kind: "ask", text: q.trim() });
    return list;
  }, [q, folders, hits, actions, folder]);

  const pick = (it: Item, alt: boolean) => {
    onClose();
    switch (it.kind) {
      case "folder":
        return onOpenFolder(it.f.path);
      case "session":
      case "message":
        return alt ? onReference(it.h.session) : onOpenSession(it.h.session);
      case "action":
        return it.a.run();
      case "ask":
        return onAsk(it.text);
    }
  };

  const groups: { title: string; kind: Item["kind"] }[] = [
    { title: "Folders", kind: "folder" },
    { title: "Sessions", kind: "session" },
    { title: "In conversations", kind: "message" },
    { title: "Actions", kind: "action" },
    { title: "", kind: "ask" },
  ];

  return (
    <div className="absolute inset-0 z-40 flex items-start justify-center pt-[14vh] bg-black/25">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default"
        onMouseDown={onClose}
      />
      <dialog
        open
        aria-label="Search"
        className="relative m-0 p-0 w-[680px] max-w-[92vw] rounded-2xl border border-line-2 bg-paper-2 shadow-[0_24px_80px_rgba(0,0,0,0.45)] flex flex-col max-h-[64vh] text-ink overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 h-12">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            className="text-ink-3 shrink-0"
          >
            <title>search</title>
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" />
          </svg>
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") return onClose();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (e.key === "Enter" && items[cursor]) pick(items[cursor], e.metaKey || e.ctrlKey);
            }}
            placeholder="Sessions, past conversations, folders, actions…"
            className="flex-1 bg-transparent outline-none text-[14px] text-ink placeholder:text-ink-3"
          />
          {busy && <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />}
        </div>
        <div className="overflow-y-auto pb-1 border-t border-line">
          {items.length === 0 && <div className="px-4 py-3 text-[12.5px] text-ink-3">Nothing matches.</div>}
          {groups.map(({ title, kind }) => {
            const rows = items.map((it, i) => [it, i] as const).filter(([it]) => it.kind === kind);
            if (rows.length === 0) return null;
            return (
              <div key={kind} className="pt-1">
                {title && <div className="px-4 pt-1 pb-0.5 text-[11.5px] text-ink-3">{title}</div>}
                {rows.map(([it, i]) => (
                  <Row
                    key={i}
                    active={i === cursor}
                    onHover={() => setCursor(i)}
                    onClick={(alt) => pick(it, alt)}
                  >
                    {render(it, folder)}
                  </Row>
                ))}
              </div>
            );
          })}
        </div>
        <div className="px-4 h-8 flex items-center gap-4 text-[12px] text-ink-3 border-t border-line">
          <Keys keys={["⏎"]} label="open" />
          <Keys keys={["⌘", "⏎"]} label="reference in composer" />
          <Keys keys={["esc"]} label="close" />
        </div>
      </dialog>
    </div>
  );
}

function Row({
  active,
  onHover,
  onClick,
  children,
}: {
  active: boolean;
  onHover: () => void;
  onClick: (alt: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onClick={(e) => onClick(e.metaKey || e.ctrlKey)}
      className={`w-full text-left px-4 h-8 flex items-center gap-3 ${active ? "bg-paper-3" : ""}`}
    >
      {children}
    </button>
  );
}

function render(it: Item, folder?: string): ReactNode {
  switch (it.kind) {
    case "folder":
      return (
        <>
          <FolderGlyph />
          <span className="text-ink shrink-0">{base(it.f.path)}</span>
          <span className="font-mono text-[12px] text-ink-3 truncate flex-1">{home(it.f.path)}</span>
          <span className="text-[11.5px] text-ink-3 shrink-0">
            {it.f.source === "recent"
              ? "recent"
              : it.f.source === "typed"
                ? "path"
                : it.f.isRepo
                  ? "repo"
                  : "folder"}
          </span>
        </>
      );
    case "session":
      return (
        <>
          <span className="w-1.5 h-1.5 rounded-full border border-line-2 shrink-0" />
          <span className="text-ink truncate flex-1">
            {it.h.session.name || it.h.session.firstMessage || "(empty)"}
          </span>
          <span className="text-[11.5px] text-ink-3 shrink-0">{base(it.h.session.cwd)}</span>
          <span className="text-[11.5px] text-ink-3 shrink-0 tabular-nums w-7 text-right">
            {ago(it.h.session.modified)}
          </span>
        </>
      );
    case "message":
      return (
        <>
          <span className={`text-[11px] shrink-0 w-4 ${it.h.role === "user" ? "text-warn" : "text-ink-3"}`}>
            {it.h.role === "user" ? "you" : "pi"}
          </span>
          <span className="text-ink-2 truncate flex-1 text-[12.5px]">{it.h.snippet}</span>
          <span className="text-[11.5px] text-ink-3 shrink-0 truncate max-w-[30%]">
            {it.h.session.name || it.h.session.firstMessage}
          </span>
        </>
      );
    case "action":
      return (
        <>
          <span className="text-ink-3 shrink-0 w-4 text-center">›</span>
          <span className="text-ink flex-1">{it.a.label}</span>
          {it.a.hint && <Keys keys={it.a.hint} />}
        </>
      );
    case "ask":
      return (
        <>
          <span className="text-ink-3 shrink-0 w-4 text-center">↗</span>
          <span className="text-ink truncate flex-1">
            Ask Pi in <span className="text-ink-2">{folder ? base(folder) : "…"}</span>: “{it.text}”
          </span>
        </>
      );
  }
}

function FolderGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      className="text-ink-3 shrink-0"
    >
      <title>folder</title>
      <path d="M2 5.5A1.5 1.5 0 0 1 3.5 4H6l1.5 1.5H12.5A1.5 1.5 0 0 1 14 7v4.5A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5z" />
    </svg>
  );
}

import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, Model } from "@earendil-works/pi-ai";
import {
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type Attachment, segment, urlsIn } from "../attachments";
import type { SessionReference } from "../session-reference";
import { useSettings } from "../settings";
import { type ActiveToken, activeToken, replaceToken, type Sigil } from "../sigils";
import { fmtDuration } from "../turn-summary";
import { Autocomplete, type AutocompleteItem } from "./Autocomplete";
import { ContextTray } from "./ContextTray";
import { Keys, SigilChip } from "./Key";
import { ModelPicker } from "./ModelPicker";
import { Popover } from "./Popover";
import { ThinkingPicker } from "./ThinkingPicker";

// biome-ignore lint/suspicious/noExplicitAny: Pi models are Model<any> on the wire
type AnyModel = Model<any>;

export interface ComposerProps {
  text: string;
  setText: (t: string) => void;
  streaming: boolean;
  /** Idle: prompt. Running: follow-up. The queue panel is where a follow-up becomes a steer. */
  onSend: (text: string) => void;
  onAbort: () => void;
  complete: (sigil: Sigil, query: string) => Promise<AutocompleteItem[]>;
  pick: (sigil: Sigil, item: AutocompleteItem) => string | undefined;
  folder?: string;
  /** Footer controls: model, effort, context. All read from Pi. */
  model?: { provider: string; id: string; contextWindow?: number };
  thinkingLevel?: ThinkingLevel;
  usage?: AssistantMessage["usage"];
  compacting?: boolean;
  /** Wall clock at agent_start; shown as a live elapsed counter while running. */
  turnStartedAt?: number;
  loadModels: () => Promise<AnyModel[]>;
  loadLevels: () => Promise<ThinkingLevel[]>;
  onModel: (m: AnyModel) => void;
  onLevel: (l: ThinkingLevel) => void;
  disabled?: boolean;
  /** Typing works but nothing can be sent yet (Pi starting) or any more (Pi exited); shown as the placeholder. */
  blocked?: string;
  /** Paths the next message carries. Dropped, pasted, or picked; always absolute; never copied. */
  attachments: Attachment[];
  onAttach: (paths: string[]) => void;
  onRemoveAttachment: (path: string) => void;
  /** A pasted image has no path yet; App writes it to the temp dir the way the Pi terminal does. */
  onPasteImage: (file: File) => void;
  refs: SessionReference[];
  onRemoveRef: (token: string) => void;
}

const TITLES: Record<Sigil, string> = {
  "/": "Skills",
  "@": "Files",
  "#": "Pi actions",
  $: "Session references",
};

/** Never disabled while Pi runs: Enter queues a follow-up. */
export function Composer(p: ComposerProps) {
  const { text, setText, streaming, onSend, complete, pick, attachments } = p;
  const { settings } = useSettings();
  const { enterSends } = settings.conversation;
  const ref = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const [attachMenu, setAttachMenu] = useState(false);
  const urls = useMemo(() => urlsIn(text), [text]);
  const [token, setToken] = useState<ActiveToken>();
  const [items, setItems] = useState<AutocompleteItem[]>([]);
  const [cursor, setCursor] = useState(0);
  const [dragging, setDragging] = useState(false);
  const seq = useRef(0);
  // Long-text mode. Turns itself on when the draft overflows the compact box;
  // the user can toggle it, and a manual collapse holds until the draft is sent.
  const [expanded, setExpanded] = useState(false);
  const pinnedCompact = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || el.value !== text) return;
    el.style.height = "auto";
    const cap = expanded ? Math.round(window.innerHeight * 0.6) : compactCap(el);
    const h = el.scrollHeight;
    if (!expanded && !pinnedCompact.current && h > cap) {
      setExpanded(true);
      return;
    }
    el.style.height = `${Math.min(h, cap)}px`;
    el.style.overflowY = h > cap ? "auto" : "hidden";
  }, [text, expanded]);

  const toggleExpanded = () => {
    pinnedCompact.current = expanded;
    setExpanded(!expanded);
    requestAnimationFrame(() => ref.current?.focus());
  };

  const refreshToken = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setToken(activeToken(el.value, el.selectionStart));
  }, []);

  useEffect(() => {
    ref.current?.focus();
  }, []);
  useEffect(() => {
    if (document.activeElement === ref.current) {
      const el = ref.current;
      if (el && el.selectionStart === 0 && text.length > 0) el.setSelectionRange(text.length, text.length);
      refreshToken();
    }
  }, [text, refreshToken]);

  useEffect(() => {
    if (!token) {
      setItems([]);
      return;
    }
    const n = ++seq.current;
    void complete(token.sigil, token.query).then((list) => {
      if (n !== seq.current) return;
      setItems(list.slice(0, 50));
      setCursor(0);
    });
  }, [token, complete]);

  const applyPick = (item: AutocompleteItem) => {
    if (!token) return;
    const replacement = pick(token.sigil, item);
    const next =
      replacement === undefined ? replaceToken(text, token, "") : replaceToken(text, token, replacement);
    const cleaned =
      replacement === undefined ? { text: next.text.replace(/\s$/, ""), caret: next.caret - 1 } : next;
    setText(cleaned.text);
    setToken(undefined);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(cleaned.caret, cleaned.caret);
    });
  };

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !p.disabled && !p.blocked;
  const send = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText("");
    setToken(undefined);
    setExpanded(false);
    pinnedCompact.current = false;
    requestAnimationFrame(() => ref.current?.focus());
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (token && items.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => (c + 1) % items.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => (c - 1 + items.length) % items.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        applyPick(items[cursor]);
        return;
      }
    }
    if (e.key === "Escape" && token) {
      e.preventDefault();
      setToken(undefined);
      return;
    }
    // Backspace on an empty draft takes back the last attachment, like deleting a word.
    if (e.key === "Backspace" && text === "" && attachments.length > 0) {
      e.preventDefault();
      p.onRemoveAttachment(attachments[attachments.length - 1].path);
      return;
    }
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    if (e.shiftKey) return; // newline
    const mod = e.metaKey || e.ctrlKey;
    if (!enterSends && !mod) return; // Enter is a newline in this mode
    e.preventDefault();
    send();
  };

  /** Files from Finder carry a path; pasted screenshots do not. */
  const takeFiles = (files: FileList | File[]) => {
    const paths: string[] = [];
    for (const f of Array.from(files)) {
      const path = window.bridge.pathOf(f);
      if (path) paths.push(path);
      else if (f.type.startsWith("image/")) p.onPasteImage(f);
    }
    if (paths.length > 0) p.onAttach(paths);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    takeFiles(e.dataTransfer.files);
    requestAnimationFrame(() => ref.current?.focus());
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length === 0) return; // plain text paste: let the textarea handle it
    e.preventDefault();
    takeFiles(files);
  };

  const pickAttachments = (kind: "file" | "folder") => {
    setAttachMenu(false);
    void window.bridge.files.pick(kind).then((paths) => {
      if (paths.length > 0) p.onAttach(paths);
      requestAnimationFrame(() => ref.current?.focus());
    });
  };

  /** Keep the highlight layer scrolled with the textarea. */
  const syncScroll = () => {
    if (mirror.current && ref.current) mirror.current.scrollTop = ref.current.scrollTop;
  };

  const placeholder = p.disabled
    ? "Choose a folder first."
    : p.blocked
      ? p.blocked
      : streaming
        ? "Pi is working. Anything you send now waits its turn."
        : "Ask Pi about this folder";

  const insertSigil = (sig: string) => {
    const el = ref.current;
    const at = el ? el.selectionStart : text.length;
    const before = text.slice(0, at);
    const after = text.slice(at);
    const pad = before && !/\s$/.test(before) ? " " : "";
    const next = `${before}${pad}${sig}${after}`;
    setText(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const caret = before.length + pad.length + sig.length;
      el.setSelectionRange(caret, caret);
      refreshToken();
    });
  };
  // With model chips present the footer is tight: sigils shrink to bare key caps.
  const compact = !!p.model;
  const sigils = (
    <span className="flex items-center gap-0.5">
      <SigilChip sigil="/" label="skill" compact={compact} onClick={() => insertSigil("/")} />
      <SigilChip sigil="@" label="file" compact={compact} onClick={() => insertSigil("@")} />
      <SigilChip sigil="#" label="action" compact={compact} onClick={() => insertSigil("#")} />
      <SigilChip sigil="$" label="session" compact={compact} onClick={() => insertSigil("$")} />
    </span>
  );

  return (
    <div className="shrink-0 px-6 pb-5 pt-2">
      <section
        aria-label="Message composer"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`relative mx-auto rounded-[18px] ${expanded ? "max-w-[calc(var(--pid-measure)+12rem)]" : "max-w-[var(--pid-measure)]"} border bg-paper-2 shadow-[0_10px_40px_rgba(0,0,0,0.28)] transition-colors ${
          dragging ? "border-accent bg-accent-soft" : "border-line-2"
        }`}
      >
        {token && (
          <Autocomplete
            title={TITLES[token.sigil]}
            items={items}
            cursor={cursor}
            onHover={setCursor}
            onPick={applyPick}
          />
        )}
        <ContextTray
          attachments={attachments}
          refs={p.refs}
          urls={urls}
          onRemoveAttachment={p.onRemoveAttachment}
          onRemoveRef={p.onRemoveRef}
        />
        <div className="relative">
          {/* Highlight layer: same box and font as the textarea, painted behind transparent text. */}
          <div
            ref={mirror}
            aria-hidden
            className={`${EDITOR_BOX} absolute inset-0 pointer-events-none overflow-hidden text-ink`}
          >
            <Highlights text={text} />
          </div>
          <textarea
            ref={ref}
            value={text}
            disabled={p.disabled}
            onChange={(e) => {
              setText(e.target.value);
              requestAnimationFrame(refreshToken);
            }}
            onKeyDown={onKey}
            onKeyUp={(e) => {
              if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End") refreshToken();
            }}
            onClick={refreshToken}
            onPaste={onPaste}
            onScroll={syncScroll}
            rows={2}
            placeholder={placeholder}
            className={`${EDITOR_BOX} relative w-full resize-none bg-transparent outline-none text-transparent caret-ink placeholder:text-ink-3 disabled:opacity-60`}
          />
        </div>
        <div className="flex items-center gap-0.5 pl-2.5 pr-2.5 pb-2.5 pt-1">
          <span className="relative">
            <button
              type="button"
              onClick={() => setAttachMenu((v) => !v)}
              disabled={p.disabled}
              title="Attach files or folders (paths only, nothing is copied)"
              aria-haspopup="menu"
              aria-expanded={attachMenu}
              className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-ink-3 hover:text-ink hover:bg-paper-3 transition-colors disabled:opacity-40"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <title>attach</title>
                <path d="M10.5 5.5 6 10a1.75 1.75 0 0 0 2.5 2.5l5-5a3.5 3.5 0 0 0-5-5l-5.5 5.5a5 5 0 0 0 7 7L13 12" />
              </svg>
            </button>
            <Popover
              open={attachMenu}
              onClose={() => setAttachMenu(false)}
              className="bottom-full mb-2 left-0 w-56 p-1"
            >
              <AttachMenuItem
                label="Files…"
                hint="images, PDFs, anything"
                onClick={() => pickAttachments("file")}
              />
              <AttachMenuItem
                label="Folder…"
                hint="attached by path"
                onClick={() => pickAttachments("folder")}
              />
              <div className="px-2.5 pt-1.5 pb-1 text-[11px] leading-snug text-ink-3 border-t border-line mt-1">
                Or drop from Finder, or paste an image. Pi reads the path itself; nothing is copied.
              </div>
            </Popover>
          </span>
          {p.model && (
            <>
              <ModelPicker current={p.model} load={p.loadModels} onSelect={p.onModel} placement="up" />
              {p.thinkingLevel && (
                <ThinkingPicker
                  current={p.thinkingLevel}
                  load={p.loadLevels}
                  onSelect={p.onLevel}
                  placement="up"
                />
              )}
              <ContextChip usage={p.usage} contextWindow={p.model.contextWindow} compacting={p.compacting} />
            </>
          )}
          <span className={p.model ? "ml-1" : ""}>{sigils}</span>
          <span className="flex-1" />
          {streaming ? (
            <span className="flex items-center gap-2 text-[12.5px] text-ink-3 pr-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span>Running</span>
              {p.turnStartedAt !== undefined && <Elapsed since={p.turnStartedAt} />}
              <Keys keys={["⏎"]} label="queue" className="ml-1" />
              <button
                type="button"
                onClick={p.onAbort}
                title="Stop the current run (⌘.)"
                className="w-4 h-4 rounded flex items-center justify-center text-ink-3 hover:text-danger"
              >
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                  <title>stop</title>
                  <rect x="3" y="3" width="10" height="10" rx="2.5" />
                </svg>
              </button>
            </span>
          ) : (
            <span className="flex items-center gap-3 pr-2">
              {enterSends ? (
                <>
                  <Keys keys={["⏎"]} label="send" />
                  <Keys keys={["⇧", "⏎"]} label="newline" />
                </>
              ) : (
                <Keys keys={["⌘", "⏎"]} label="send" />
              )}
            </span>
          )}
          <button
            type="button"
            onClick={toggleExpanded}
            title={expanded ? "Collapse editor" : "Expand editor"}
            aria-pressed={expanded}
            className="w-[30px] h-[30px] mr-1 rounded-full flex items-center justify-center text-ink-3 hover:text-ink transition-colors"
          >
            <ExpandIcon expanded={expanded} />
          </button>
          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            title={streaming ? "Queue as follow-up" : "Send"}
            className="w-[30px] h-[30px] rounded-full bg-accent text-paper flex items-center justify-center disabled:opacity-30 transition-opacity"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <title>send</title>
              <path d="M8 13V3M4 7l4-4 4 4" />
            </svg>
          </button>
        </div>
      </section>
    </div>
  );
}

/** Seconds since the turn started, ticking once a second. */
function Elapsed({ since }: { since: number }): ReactNode {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono tabular-nums text-ink-3/80">{fmtDuration(now - since)}</span>;
}

/** Shared by the textarea and its highlight layer so glyphs line up exactly. */
const EDITOR_BOX =
  "px-4 pt-3.5 pb-1 text-[14px] leading-relaxed font-sans whitespace-pre-wrap break-words [overflow-wrap:break-word]";

/**
 * Inline tokens drawn under the transparent textarea text: links, `$session` tokens, `@path`
 * mentions. Only colour and a soft ground change; metrics stay identical so the caret never drifts.
 */
function Highlights({ text }: { text: string }) {
  const parts = useMemo(() => segment(text), [text]);
  return (
    <>
      {parts.map((s, i) => {
        const key = `${i}-${s.text.length}`;
        switch (s.type) {
          case "url":
            return (
              <span key={key} className="text-ink underline decoration-line-2 underline-offset-2">
                {s.text}
              </span>
            );
          case "session":
            return (
              <span key={key} className="text-warn rounded-[4px] bg-warn-soft">
                {s.text}
              </span>
            );
          case "mention":
            return (
              <span key={key} className="text-ink rounded-[4px] bg-accent-soft">
                {s.text}
              </span>
            );
          default:
            return <span key={key}>{s.text}</span>;
        }
      })}
      {/* keeps a trailing newline's empty row the same height as in the textarea */}
      {text.endsWith("\n") && "​"}
    </>
  );
}

function AttachMenuItem({ label, hint, onClick }: { label: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between gap-3 h-7 px-2.5 rounded-lg text-[12.5px] text-ink hover:bg-paper-3"
    >
      <span>{label}</span>
      <span className="text-ink-3 text-[11.5px]">{hint}</span>
    </button>
  );
}

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M` : `${Math.round(n / 1000)}k`;

/** Context used by the last assistant message against the selected model's context window. */
function ContextChip({
  usage,
  contextWindow,
  compacting,
}: {
  usage?: AssistantMessage["usage"];
  contextWindow?: number;
  compacting?: boolean;
}): ReactNode {
  if (!contextWindow) return null;
  const used = usage ? usage.input + usage.cacheRead + usage.cacheWrite + usage.output : 0;
  const pct = Math.min(100, Math.round((used / contextWindow) * 100));
  const r = 6;
  const c = 2 * Math.PI * r;
  const tone = pct > 85 ? "text-danger" : pct > 65 ? "text-warn" : "text-ink-2";
  return (
    <div
      className="h-[26px] px-2 flex items-center gap-2 text-[12.5px] text-ink-3 whitespace-nowrap"
      title={`context: ${used.toLocaleString()} of ${contextWindow.toLocaleString()} tokens · ${pct}%${compacting ? " · compacting" : ""}`}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" className={compacting ? "animate-pulse" : ""}>
        <title>context usage</title>
        <circle cx="8" cy="8" r={r} fill="none" className="stroke-paper-4" strokeWidth="2" />
        <circle
          cx="8"
          cy="8"
          r={r}
          fill="none"
          className={`${tone} stroke-current`}
          strokeWidth="2"
          strokeDasharray={`${(c * pct) / 100} ${c}`}
          transform="rotate(-90 8 8)"
        />
      </svg>
      <span>
        <span className="font-mono text-ink-2 tabular-nums">{fmt(used)}</span> / {fmt(contextWindow)}
      </span>
    </div>
  );
}

/** Height of the compact box: eight lines of text plus the textarea's own padding. */
function compactCap(el: HTMLTextAreaElement): number {
  const cs = getComputedStyle(el);
  const line = Number.parseFloat(cs.lineHeight) || 22;
  const pad = Number.parseFloat(cs.paddingTop) + Number.parseFloat(cs.paddingBottom);
  return Math.round(line * 8 + pad);
}

/** Diagonal arrows: pointing out to expand, pointing in to collapse. */
function ExpandIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
      <title>{expanded ? "collapse" : "expand"}</title>
      {expanded ? (
        <path d="M14 2L9.5 6.5M9.5 6.5V3M9.5 6.5H13M2 14l4.5-4.5M6.5 9.5V13M6.5 9.5H3" />
      ) : (
        <path d="M9.5 6.5L14 2M14 2h-3.5M14 2v3.5M6.5 9.5L2 14M2 14h3.5M2 14v-3.5" />
      )}
    </svg>
  );
}

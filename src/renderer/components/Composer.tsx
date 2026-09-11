import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, Model } from "@earendil-works/pi-ai";
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useSettings } from "../settings";
import { type ActiveToken, activeToken, replaceToken, type Sigil } from "../sigils";
import { Autocomplete, type AutocompleteItem } from "./Autocomplete";
import { ModelPicker } from "./ModelPicker";
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
  loadModels: () => Promise<AnyModel[]>;
  loadLevels: () => Promise<ThinkingLevel[]>;
  onModel: (m: AnyModel) => void;
  onLevel: (l: ThinkingLevel) => void;
  disabled?: boolean;
}

const TITLES: Record<Sigil, string> = {
  "/": "Skills",
  "@": "Files",
  "#": "Pi actions",
  $: "Session references",
};

/** Never disabled while Pi runs: Enter queues a follow-up. */
export function Composer(p: ComposerProps) {
  const { text, setText, streaming, onSend, complete, pick, folder } = p;
  const { settings } = useSettings();
  const { enterSends } = settings.conversation;
  const ref = useRef<HTMLTextAreaElement>(null);
  const [token, setToken] = useState<ActiveToken>();
  const [items, setItems] = useState<AutocompleteItem[]>([]);
  const [cursor, setCursor] = useState(0);
  const [dragging, setDragging] = useState(false);
  const seq = useRef(0);

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

  const send = () => {
    const t = text.trim();
    if (!t || p.disabled) return;
    onSend(t);
    setText("");
    setToken(undefined);
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
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    if (e.shiftKey) return; // newline
    const mod = e.metaKey || e.ctrlKey;
    if (!enterSends && !mod) return; // Enter is a newline in this mode
    e.preventDefault();
    send();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => window.bridge.pathOf(f))
      .filter((x): x is string => !!x);
    if (paths.length === 0) return;
    const mentions = paths
      .map((x) => (folder && x.startsWith(`${folder}/`) ? x.slice(folder.length + 1) : x))
      .map((x) => `@${x}`)
      .join(" ");
    setText(`${text}${text && !text.endsWith(" ") ? " " : ""}${mentions} `);
    requestAnimationFrame(() => ref.current?.focus());
  };

  const placeholder = p.disabled
    ? "Open a folder or pick a session to talk to Pi."
    : streaming
      ? "Pi is working…  Enter queues a follow-up"
      : enterSends
        ? "Message Pi…  / skill · @ file · # action · $ session"
        : "Message Pi…  ⌘Enter to send";

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
        className={`relative max-w-3xl mx-auto rounded-[18px] border bg-paper-2 shadow-[0_10px_40px_rgba(0,0,0,0.28)] transition-colors ${
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
          rows={Math.min(8, Math.max(2, text.split("\n").length))}
          placeholder={placeholder}
          className="w-full resize-none bg-transparent px-4 pt-3.5 pb-1 outline-none text-[14px] leading-relaxed text-ink placeholder:text-ink-3 disabled:opacity-60"
        />
        <div className="flex items-center gap-0.5 pl-2.5 pr-2.5 pb-2.5 pt-1">
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
          <span className="flex-1" />
          {streaming ? (
            <span className="flex items-center gap-2 text-[12.5px] text-ink-3 pr-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span>Running</span>
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
            <span className="text-[12.5px] text-ink-3 pr-2">
              {enterSends ? "↵ send · ⇧↵ newline" : "⌘↵ send"}
            </span>
          )}
          <button
            type="button"
            onClick={send}
            disabled={!text.trim() || p.disabled}
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
      className="h-[26px] px-2 flex items-center gap-2 text-[12.5px] text-ink-3"
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

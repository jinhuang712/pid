import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { useSettings } from "../settings";
import { type ActiveToken, activeToken, replaceToken, type Sigil } from "../sigils";
import { Autocomplete, type AutocompleteItem } from "./Autocomplete";

export type SendMode = "prompt" | "steer" | "followUp";

export interface ComposerProps {
  text: string;
  setText: (t: string) => void;
  streaming: boolean;
  onSend: (text: string, mode: SendMode) => void;
  onAbort: () => void;
  /** Items for a sigil query. */
  complete: (sigil: Sigil, query: string) => Promise<AutocompleteItem[]>;
  /** Text to put in place of the token, or undefined when the pick performed an action instead. */
  pick: (sigil: Sigil, item: AutocompleteItem) => string | undefined;
  /** Current folder, used to turn dropped absolute paths into @relative mentions. */
  folder?: string;
}

const TITLES: Record<Sigil, string> = {
  "/": "Skills",
  "@": "Files",
  "#": "Pi actions",
  $: "Session references",
};

/**
 * Never disabled. While Pi is running, Enter steers (interrupt and redirect) and
 * Cmd/Ctrl+Enter queues a follow-up (runs after the current work finishes).
 */
export function Composer({
  text,
  setText,
  streaming,
  onSend,
  onAbort,
  complete,
  pick,
  folder,
}: ComposerProps) {
  const [dragging, setDragging] = useState(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => window.bridge.pathOf(f))
      .filter((p): p is string => !!p);
    if (paths.length === 0) return;
    const mentions = paths
      .map((p) => (folder && p.startsWith(`${folder}/`) ? p.slice(folder.length + 1) : p))
      .map((p) => `@${p}`)
      .join(" ");
    setText(`${text}${text && !text.endsWith(" ") ? " " : ""}${mentions} `);
    requestAnimationFrame(() => ref.current?.focus());
  };
  const { settings } = useSettings();
  const { enterSends, streamingSendMode } = settings.conversation;
  const ref = useRef<HTMLTextAreaElement>(null);
  const [token, setToken] = useState<ActiveToken>();
  const [items, setItems] = useState<AutocompleteItem[]>([]);
  const [cursor, setCursor] = useState(0);
  const seq = useRef(0);

  const refreshToken = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setToken(activeToken(el.value, el.selectionStart));
  }, []);

  // Focus on mount; re-detect the token when text is set from outside (fork, dev hooks).
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

  const send = (mode: SendMode) => {
    const t = text.trim();
    if (!t) return;
    onSend(t, mode);
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
      setToken(undefined);
      return;
    }
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    if (e.shiftKey) return; // newline
    const mod = e.metaKey || e.ctrlKey;
    if (!enterSends && !mod) return; // Enter is a newline in this mode
    e.preventDefault();
    if (!streaming) return send("prompt");
    // Modifier flips the configured default between steer and follow-up.
    const other = streamingSendMode === "steer" ? "followUp" : "steer";
    send(mod && enterSends ? other : streamingSendMode);
  };

  const btn = "h-7 px-3 rounded-md text-xs disabled:opacity-40";
  return (
    <div className="shrink-0 border-t border-line bg-paper px-4 py-3">
      <section
        aria-label="Message composer"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`relative max-w-3xl mx-auto rounded-xl border bg-paper-2 focus-within:border-accent ${
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
          placeholder={
            streaming
              ? "Pi is working…  Enter to steer · ⌘Enter to queue a follow-up"
              : "Message Pi…  / skill · @ file · # action · $ session"
          }
          className="w-full resize-none bg-transparent px-3 pt-3 pb-1 outline-none text-ink placeholder:text-ink-3"
        />
        <div className="flex items-center gap-2 px-2 pb-2">
          {streaming && <span className="text-xs text-accent animate-pulse pl-1">running</span>}
          <span className="flex-1" />
          {streaming ? (
            <>
              <button
                type="button"
                onClick={onAbort}
                className={`${btn} border border-line text-ink-2 hover:text-danger hover:border-danger`}
              >
                Abort
              </button>
              <button
                type="button"
                onClick={() => send("followUp")}
                disabled={!text.trim()}
                className={`${btn} border border-line text-ink`}
              >
                Follow-up
              </button>
              <button
                type="button"
                onClick={() => send("steer")}
                disabled={!text.trim()}
                className={`${btn} bg-accent text-white`}
              >
                Steer
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => send("prompt")}
              disabled={!text.trim()}
              className={`${btn} bg-accent text-white`}
            >
              Send
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

import { type KeyboardEvent, useRef, useState } from "react";

export type SendMode = "prompt" | "steer" | "followUp";

export interface ComposerProps {
  streaming: boolean;
  onSend: (text: string, mode: SendMode) => void;
  onAbort: () => void;
}

/**
 * Never disabled. While Pi is running, Enter steers (interrupt and redirect) and
 * Cmd/Ctrl+Enter queues a follow-up (runs after the current work finishes).
 */
export function Composer({ streaming, onSend, onAbort }: ComposerProps) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const send = (mode: SendMode) => {
    const t = text.trim();
    if (!t) return;
    onSend(t, mode);
    setText("");
    requestAnimationFrame(() => ref.current?.focus());
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    if (e.shiftKey) return; // newline
    e.preventDefault();
    if (!streaming) return send("prompt");
    send(e.metaKey || e.ctrlKey ? "followUp" : "steer");
  };

  const btn = "h-7 px-3 rounded-md text-xs disabled:opacity-40";
  return (
    <div className="shrink-0 border-t border-line bg-paper px-4 py-3">
      <div className="max-w-3xl mx-auto rounded-xl border border-line-2 bg-paper-2 focus-within:border-accent">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          rows={Math.min(8, Math.max(2, text.split("\n").length))}
          placeholder={
            streaming
              ? "Pi is working…  Enter to steer · ⌘Enter to queue a follow-up"
              : "Message Pi…  Enter to send · Shift+Enter for newline"
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
      </div>
    </div>
  );
}

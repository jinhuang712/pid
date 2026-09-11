import { type KeyboardEvent, useRef, useState } from "react";

export interface ComposerProps {
  streaming: boolean;
  onSend: (text: string) => void;
  onAbort: () => void;
}

export function Composer({ streaming, onSend, onAbort }: ComposerProps) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
    requestAnimationFrame(() => ref.current?.focus());
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="shrink-0 border-t border-line bg-paper px-4 py-3">
      <div className="max-w-3xl mx-auto rounded-xl border border-line-2 bg-paper-2 focus-within:border-accent">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          rows={Math.min(8, Math.max(2, text.split("\n").length))}
          placeholder="Message Pi…  (Enter to send, Shift+Enter for newline)"
          className="w-full resize-none bg-transparent px-3 pt-3 pb-1 outline-none text-ink placeholder:text-ink-3"
        />
        <div className="flex items-center gap-2 px-2 pb-2 text-xs">
          <span className="flex-1" />
          {streaming && (
            <button
              type="button"
              onClick={onAbort}
              className="h-7 px-3 rounded-md border border-line text-ink-2 hover:text-danger hover:border-danger"
            >
              Abort
            </button>
          )}
          <button
            type="button"
            onClick={send}
            disabled={!text.trim()}
            className="h-7 px-3 rounded-md bg-accent text-white disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

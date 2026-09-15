import type { PiDialogRequest, PiDialogResponse } from "@shared/protocol";
import { useEffect, useRef, useState } from "react";
import { Modal } from "@/ui";

export type DialogRequest = Extract<PiDialogRequest, { method: "select" | "confirm" | "input" | "editor" }>;

/**
 * Pi extensions ask for UI through the dialog channel PID defines in shared/protocol.
 * PID answers the four dialog methods here with plain desktop dialogs.
 */
export function ExtensionDialog({
  req,
  onRespond,
}: {
  req: DialogRequest;
  onRespond: (r: PiDialogResponse) => void;
}) {
  const [value, setValue] = useState(req.method === "editor" ? (req.prefill ?? "") : "");
  const [cursor, setCursor] = useState(0);
  const id = req.id;
  const cancel = () => onRespond({ id, cancelled: true });
  // The dialog interrupts whatever the window was doing to ask a question, so the answer field
  // takes focus. Done here rather than with `autoFocus`, which is only sound inside a dialog and
  // the dialog element now lives one component away.
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => {
    field.current?.focus();
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const btn = "h-7 px-3 rounded-md text-xs";
  return (
    // z-50: an extension's question must sit above the palette, which a keystroke can open under it.
    <Modal label={req.title} z={50}>
      <div className="px-4 pt-3 pb-2 text-sm font-medium">{req.title}</div>
      {req.method === "confirm" && (
        <div className="px-4 pb-3 text-sm text-ink-2 whitespace-pre-wrap">{req.message}</div>
      )}
      {req.method === "select" && (
        <div className="pb-2 max-h-80 overflow-y-auto">
          {req.options.map((o, i) => (
            <button
              type="button"
              key={o}
              onMouseEnter={() => setCursor(i)}
              onClick={() => onRespond({ id, value: o })}
              className={`w-full text-left px-4 h-8 text-sm ${i === cursor ? "bg-paper-3" : ""}`}
            >
              {o}
            </button>
          ))}
        </div>
      )}
      {(req.method === "input" || req.method === "editor") && (
        <div className="px-4 pb-3">
          {req.method === "input" ? (
            <input
              ref={field}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onRespond({ id, value })}
              placeholder={req.placeholder}
              className="w-full h-8 px-2 rounded-md bg-paper-3 outline-none text-sm placeholder:text-ink-3"
            />
          ) : (
            <textarea
              ref={field}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={10}
              className="w-full px-2 py-1.5 rounded-md bg-paper-3 outline-none text-sm font-mono"
            />
          )}
        </div>
      )}
      <div className="px-4 pb-3 flex items-center gap-2 justify-end">
        <button
          type="button"
          onClick={cancel}
          className={`${btn} border border-line text-ink-2 hover:text-ink`}
        >
          Cancel
        </button>
        {req.method === "confirm" && (
          <>
            <button
              type="button"
              onClick={() => onRespond({ id, confirmed: false })}
              className={`${btn} border border-line text-ink`}
            >
              No
            </button>
            <button
              type="button"
              onClick={() => onRespond({ id, confirmed: true })}
              className={`${btn} bg-accent text-white`}
            >
              Yes
            </button>
          </>
        )}
        {(req.method === "input" || req.method === "editor") && (
          <button
            type="button"
            onClick={() => onRespond({ id, value })}
            className={`${btn} bg-accent text-white`}
          >
            OK
          </button>
        )}
      </div>
    </Modal>
  );
}

/** TUI-oriented extensions emit ANSI colour codes; strip them for the GUI. */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`, "g");
export const stripAnsi = (s: string) => s.replace(ANSI, "");

export interface Toast {
  id: number;
  message: string;
  type: "info" | "warning" | "error";
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="absolute right-4 top-14 z-[60] flex flex-col gap-2 w-80">
      {toasts.map((t) => (
        <button
          type="button"
          key={t.id}
          onClick={() => onDismiss(t.id)}
          className={`text-left rounded-lg border px-3 py-2 text-xs shadow-lg ${
            t.type === "error"
              ? "border-danger/40 bg-danger-soft text-danger"
              : t.type === "warning"
                ? "border-warn/40 bg-warn-soft text-warn"
                : "border-line bg-paper-2 text-ink"
          }`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}

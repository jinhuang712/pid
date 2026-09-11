import type { RpcExtensionUIRequest, RpcExtensionUIResponse } from "@shared/protocol";
import { useEffect, useState } from "react";

export type DialogRequest = Extract<
  RpcExtensionUIRequest,
  { method: "select" | "confirm" | "input" | "editor" }
>;

/**
 * Pi extensions ask for UI through the RPC extension_ui sub-protocol.
 * PID answers the four dialog methods here with plain desktop dialogs.
 */
export function ExtensionDialog({
  req,
  onRespond,
}: {
  req: DialogRequest;
  onRespond: (r: RpcExtensionUIResponse) => void;
}) {
  const [value, setValue] = useState(req.method === "editor" ? (req.prefill ?? "") : "");
  const [cursor, setCursor] = useState(0);
  const id = req.id;
  const cancel = () => onRespond({ type: "extension_ui_response", id, cancelled: true });

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const btn = "h-7 px-3 rounded-md text-xs";
  return (
    <div className="absolute inset-0 z-50 bg-black/30 flex items-center justify-center">
      <dialog
        open
        aria-label={req.title}
        className="relative m-0 p-0 w-[520px] max-w-[92vw] rounded-xl border border-line bg-paper-2 shadow-2xl text-ink"
      >
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
                onClick={() => onRespond({ type: "extension_ui_response", id, value: o })}
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
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && onRespond({ type: "extension_ui_response", id, value })
                }
                placeholder={req.placeholder}
                className="w-full h-8 px-2 rounded-md bg-paper-3 outline-none text-sm placeholder:text-ink-3"
              />
            ) : (
              <textarea
                autoFocus
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
                onClick={() => onRespond({ type: "extension_ui_response", id, confirmed: false })}
                className={`${btn} border border-line text-ink`}
              >
                No
              </button>
              <button
                type="button"
                onClick={() => onRespond({ type: "extension_ui_response", id, confirmed: true })}
                className={`${btn} bg-accent text-white`}
              >
                Yes
              </button>
            </>
          )}
          {(req.method === "input" || req.method === "editor") && (
            <button
              type="button"
              onClick={() => onRespond({ type: "extension_ui_response", id, value })}
              className={`${btn} bg-accent text-white`}
            >
              OK
            </button>
          )}
        </div>
      </dialog>
    </div>
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

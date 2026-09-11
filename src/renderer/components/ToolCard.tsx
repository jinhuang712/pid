import type { ToolCall } from "@earendil-works/pi-ai";
import { useState } from "react";
import { useSettings } from "../settings";
import type { ToolRun } from "../state/conversation";

function summarize(call: ToolCall): string {
  const a = call.arguments ?? {};
  switch (call.name) {
    case "read":
    case "write":
    case "edit":
    case "ls":
      return String(a.path ?? "");
    case "bash":
      return String(a.command ?? "");
    case "grep":
    case "find":
      return String(a.pattern ?? "");
    default: {
      const first = Object.values(a)[0];
      return typeof first === "string" ? first : "";
    }
  }
}

function resultText(run?: ToolRun): string {
  if (!run?.result) return "";
  return run.result.content.map((c) => (c.type === "text" ? c.text : "[image]")).join("\n");
}

export function ToolCard({ call, run }: { call: ToolCall; run?: ToolRun }) {
  const { settings } = useSettings();
  const [open, setOpen] = useState(!settings.appearance.toolCardsCollapsed);
  const status = run?.status ?? "running";
  const isError = run?.isError === true;
  const dot = isError ? "bg-danger" : status === "running" ? "bg-accent animate-pulse" : "bg-ok";
  const diff: string | undefined = call.name === "edit" ? run?.result?.details?.diff : undefined;
  const out = resultText(run);

  return (
    <div className="my-1.5 rounded-lg border border-line bg-paper-2 text-xs">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 h-8 text-left hover:bg-paper-3 rounded-lg"
        onClick={() => setOpen(!open)}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
        <span className="font-medium text-ink shrink-0">{call.name}</span>
        <span className="font-mono text-ink-2 truncate">{summarize(call)}</span>
        <span className="flex-1" />
        <span className="text-ink-3">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="border-t border-line px-3 py-2 space-y-2">
          <div>
            <div className="text-ink-3 mb-1">input</div>
            <pre className="font-mono whitespace-pre-wrap break-all text-ink-2 max-h-60 overflow-auto">
              {JSON.stringify(call.arguments, null, 2)}
            </pre>
          </div>
          {diff ? (
            <div>
              <div className="text-ink-3 mb-1">diff</div>
              <pre className="font-mono whitespace-pre max-h-96 overflow-auto">
                {diff.split("\n").map((line, i) => {
                  const kind =
                    line[0] === "+" ? "bg-add text-ink" : line[0] === "-" ? "bg-del text-ink" : "text-ink-2";
                  return (
                    // biome-ignore lint/suspicious/noArrayIndexKey: static diff lines
                    <div key={i} className={`px-1 ${kind}`}>
                      {line}
                    </div>
                  );
                })}
              </pre>
            </div>
          ) : out ? (
            <div>
              <div className="text-ink-3 mb-1">output</div>
              <pre
                className={`font-mono whitespace-pre-wrap break-all max-h-96 overflow-auto ${isError ? "text-danger" : "text-ink-2"}`}
              >
                {out}
              </pre>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

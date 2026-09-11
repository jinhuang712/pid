import type { ToolCall } from "@earendil-works/pi-ai";
import { useState } from "react";
import { useSettings } from "../settings";
import type { ToolRun } from "../state/conversation";
import { label, MCP_PREFIX } from "../tool-label";

function resultText(run?: ToolRun): string {
  if (!run?.result) return "";
  return run.result.content.map((c) => (c.type === "text" ? c.text : "[image]")).join("\n");
}

function diffStats(patch?: string): string | undefined {
  if (!patch) return undefined;
  let add = 0;
  let del = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) add++;
    else if (line.startsWith("-") && !line.startsWith("---")) del++;
  }
  return `+${add} −${del}`;
}

/**
 * A tool call as one quiet line: chevron · verb · argument. Expanding shows the input and the
 * output (or the diff) behind a single left rule. Pi, extension, and MCP tools all look like this.
 */
export function ToolCard({ call, run }: { call: ToolCall; run?: ToolRun }) {
  const { settings } = useSettings();
  const [open, setOpen] = useState(!settings.appearance.toolCardsCollapsed);
  const status = run?.status ?? "running";
  const isError = run?.isError === true;
  const diff: string | undefined = call.name === "edit" ? run?.result?.details?.diff : undefined;
  const stats = call.name === "edit" ? diffStats(run?.result?.details?.patch) : undefined;
  const out = resultText(run);
  const lbl = label(call);
  const verb = status === "running" ? lbl.running : lbl.done;

  return (
    <div className="text-[12.5px]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`group flex items-center gap-2 h-6 text-left w-full ${isError ? "text-danger" : "text-ink-2 hover:text-ink"}`}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          className={`shrink-0 text-ink-3 transition-transform ${open ? "rotate-90" : ""}`}
        >
          <title>{open ? "collapse" : "expand"}</title>
          <path d="m6 4 4 4-4 4" />
        </svg>
        <span className={`shrink-0 ${status === "running" ? "animate-pulse" : ""}`}>{verb}</span>
        <span className="font-mono text-ink-3 truncate" title={lbl.detail}>
          {lbl.detail}
        </span>
        {stats && <span className="text-ink-3 shrink-0">{stats}</span>}
        {isError && <span className="shrink-0">failed</span>}
      </button>
      {open && (
        <div className="ml-[5px] pl-3.5 border-l-2 border-line-2 my-1 flex flex-col gap-2">
          {call.name !== "read" && (
            <pre className="font-mono whitespace-pre-wrap break-all text-ink-3 max-h-40 overflow-auto text-xs leading-relaxed">
              {call.name === "bash"
                ? String(call.arguments?.command ?? "")
                : JSON.stringify(
                    call.name.startsWith(MCP_PREFIX) && call.arguments?.args
                      ? call.arguments.args
                      : call.arguments,
                    null,
                    2,
                  )}
            </pre>
          )}
          {diff ? (
            <pre className="font-mono whitespace-pre max-h-96 overflow-auto text-xs leading-relaxed">
              {diff.split("\n").map((line, i) => {
                const kind =
                  line[0] === "+" ? "bg-add text-ink" : line[0] === "-" ? "bg-del text-ink" : "text-ink-3";
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static diff lines
                  <div key={i} className={`px-1 -mx-1 rounded-sm ${kind}`}>
                    {line}
                  </div>
                );
              })}
            </pre>
          ) : out ? (
            <pre
              className={`font-mono whitespace-pre-wrap break-all max-h-96 overflow-auto text-xs leading-relaxed ${
                isError ? "text-danger" : "text-ink-2"
              }`}
            >
              {out}
            </pre>
          ) : status === "running" ? (
            <div className="text-ink-3 text-xs animate-pulse">Running…</div>
          ) : null}
        </div>
      )}
    </div>
  );
}

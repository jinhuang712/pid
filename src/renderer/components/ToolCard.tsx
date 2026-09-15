import type { ToolCall } from "@earendil-works/pi-ai";
import { useState } from "react";
import { useSettings } from "../settings";
import type { ToolRun } from "../state/conversation";
import { label } from "../tool-label";
import { DiffBlock } from "./DiffBlock";

function resultText(run?: ToolRun): string {
  if (!run?.result) return "";
  return run.result.content.map((c) => (c.type === "text" ? c.text : "[image]")).join("\n");
}

/**
 * The pieces every tool card is made of: the collapsed line, the status, and the expandable body.
 * The generic card and the built-in renderers differ only in how the body is drawn — the chrome is
 * here once, so a registered renderer never re-answers "when does it show the output".
 */
export function ToolCallFrame({
  call,
  run,
  /** Extra text on the collapsed line, e.g. "+3 −1". */
  meta,
  /**
   * How the body above the output is drawn. `args` is the default: the arguments as JSON, and
   * nothing at all for `read`, whose path is already the whole story — the generic card's rule.
   * `command` shows a shell command as typed. `none` leaves the body to the caller.
   */
  body = "args",
}: {
  call: ToolCall;
  run?: ToolRun;
  meta?: string;
  body?: "args" | "command" | "none";
}) {
  const { settings } = useSettings();
  const [open, setOpen] = useState(!settings.appearance.toolCardsCollapsed);
  const status = run?.status ?? "running";
  const isError = run?.isError === true;
  const lbl = label(call);
  const verb = status === "running" ? lbl.running : lbl.done;
  const out = resultText(run);
  const diff = run?.result?.details?.diff;
  const args =
    body === "command"
      ? String((call.arguments as Record<string, unknown> | undefined)?.command ?? "")
      : call.name === "read"
        ? undefined
        : JSON.stringify(call.arguments, null, 2);

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
        {meta && <span className="text-ink-3 shrink-0">{meta}</span>}
        {isError && <span className="shrink-0">failed</span>}
      </button>
      {open && (
        <div className="ml-[5px] pl-3.5 border-l-2 border-line-2 my-1 flex flex-col gap-2">
          {args !== undefined && (
            <pre className="font-mono whitespace-pre-wrap break-all text-ink-3 max-h-40 overflow-auto text-xs leading-relaxed">
              {args}
            </pre>
          )}
          {diff ? (
            <DiffBlock diff={diff} />
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

/**
 * A tool call as one quiet line: chevron · verb · argument. Expanding shows the input and the
 * output (or the diff) behind a single left rule. Pi's tools and an extension's look the same.
 *
 * This is what a tool with no registration gets. The tools whose body needs its own presentation
 * (a diff, a shell command) register renderers in `contributions/builtin-tools.tsx` and re-use
 * this frame, so the chrome exists once.
 */
export function ToolCard({ call, run }: { call: ToolCall; run?: ToolRun }) {
  return <ToolCallFrame call={call} run={run} />;
}

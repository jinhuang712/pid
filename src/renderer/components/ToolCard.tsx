import type { ToolCall } from "@earendil-works/pi-ai";
import { type ReactNode, useState } from "react";
import { useSettings } from "../settings";
import type { ToolRun } from "../state/conversation";
import { label } from "../tool-label";
import { DiffBlock } from "./DiffBlock";

function resultText(run?: ToolRun): string {
  if (!run?.result) return "";
  return run.result.content
    .filter((c) => c.type === "text")
    .map((c) => (c as { text: string }).text)
    .join("\n");
}

/**
 * Image blocks a tool returned — whichever tool it was. The bytes are already in the message that
 * crossed IPC, so the card shows the picture instead of an `[image]` placeholder, which is the
 * whole point of asking a model to look at one.
 *
 * A component of its own because the card's body only mounts when expanded: this is the part a
 * test can render and assert without clicking.
 */
export function ResultImages({ run }: { run?: ToolRun }) {
  const images = resultImageBlocks(run);
  if (images.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {images.map((img, i) => (
        <img
          // biome-ignore lint/suspicious/noArrayIndexKey: blocks of one result; their order is the identity
          key={i}
          src={`data:${img.mimeType};base64,${img.data}`}
          alt=""
          className="max-h-56 max-w-full rounded-md border border-line-2 object-contain"
        />
      ))}
    </div>
  );
}

function resultImageBlocks(run?: ToolRun): { data: string; mimeType: string }[] {
  if (!run?.result) return [];
  return run.result.content.flatMap((c) =>
    c.type === "image" ? [{ data: c.data, mimeType: c.mimeType }] : [],
  );
}

/**
 * The model's own one-line description of the call, when something asked for one.
 *
 * `brief` is a convention an extension can add to a tool schema (pi-briefly does, in terse mode),
 * and the model then writes it for every call. It is the most readable thing in the arguments and
 * the row is where the TUI puts it, so the row shows it rather than burying it in the JSON — the
 * JSON stays one click away, unchanged.
 */
export function callBrief(call: ToolCall): string | undefined {
  const brief = (call.arguments as Record<string, unknown> | undefined)?.brief;
  return typeof brief === "string" && brief.trim() ? brief.trim() : undefined;
}

/** What a caller may say about a row without re-answering "when does it show the output". */
export interface FrameProps {
  /** Replaces the verb on the collapsed line. The caller reads `run.status` to pick a tense. */
  verb?: string;
  /** Replaces the text after the verb — the argument the row is about. */
  detail?: string;
  /** Extra text at the end of the collapsed line, e.g. "+3 −1" or "exa · 5 results". */
  meta?: string;
  /**
   * How the body above the output is drawn. `args` is the default: the arguments as JSON, and
   * nothing at all for `read`, whose path is already the whole story — the generic card's rule.
   * `command` shows a shell command as typed. `none` leaves the body to the caller.
   */
  body?: "args" | "command" | "none";
  /** Drawn at the top of the expanded body, above whatever `body` and the output add. */
  children?: ReactNode;
}

/**
 * The pieces every tool card is made of: the collapsed line, the status, and the expandable body.
 * The generic card, the built-in renderers and an extension's own differ only in what they put in
 * it — the chrome is here once, so nobody re-answers "when does it show the output".
 */
export function ToolCallFrame({
  call,
  run,
  verb,
  detail,
  meta,
  body = "args",
  children,
}: FrameProps & {
  call: ToolCall;
  run?: ToolRun;
}) {
  const { settings } = useSettings();
  const [open, setOpen] = useState(!settings.appearance.toolCardsCollapsed);
  const status = run?.status ?? "running";
  const isError = run?.isError === true;
  const lbl = label(call);
  const shownVerb = verb ?? (status === "running" ? lbl.running : lbl.done);
  const shownDetail = detail ?? lbl.detail;
  const out = resultText(run);
  const diff = run?.result?.details?.diff;
  const brief = callBrief(call);
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
        <span className={`shrink-0 ${status === "running" ? "animate-pulse" : ""}`}>{shownVerb}</span>
        <span className="font-mono text-ink-3 truncate" title={shownDetail}>
          {shownDetail}
        </span>
        {brief && (
          <span className="min-w-0 truncate text-ink-3 italic" title={brief}>
            {brief}
          </span>
        )}
        {meta && <span className="text-ink-3 shrink-0">{meta}</span>}
        {isError && <span className="shrink-0">failed</span>}
      </button>
      {open && (
        <div className="ml-[5px] pl-3.5 border-l-2 border-line-2 my-1 flex flex-col gap-2">
          {children}
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
          <ResultImages run={run} />
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

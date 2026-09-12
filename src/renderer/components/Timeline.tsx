import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, UserMessage } from "@earendil-works/pi-ai";
import { memo, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { parseAttachments, parseReferences, type SentReference, segment } from "../attachments";
import { useSettings } from "../settings";
import type { ConversationState, Marker, ToolRun } from "../state/conversation";
import { AttachmentChip, Chip, Glyph } from "./Chips";
import { Markdown } from "./Markdown";
import { ToolCard } from "./ToolCard";

/** Messages rendered at first; older ones mount as you scroll up. Long sessions run to thousands. */
const WINDOW = 80;
const WINDOW_STEP = 80;

function userText(m: UserMessage): string {
  return typeof m.content === "string"
    ? m.content
    : m.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
}

/** Inline images Pi stored on the message itself (the CLI's `@image.png` path); PID never adds these. */
function userImages(m: UserMessage): { data: string; mimeType: string }[] {
  if (typeof m.content === "string") return [];
  return m.content.filter((c) => c.type === "image").map((c) => ({ data: c.data, mimeType: c.mimeType }));
}

/** Body text with links, `$session` tokens and `@path` mentions drawn as the same chips the composer uses. */
function Inline({ text }: { text: string }): ReactNode {
  const parts = useMemo(() => segment(text), [text]);
  return parts.map((s, i) => {
    const key = `${i}-${s.text.length}`;
    switch (s.type) {
      case "url":
        return (
          <a
            key={key}
            href={s.href}
            target="_blank"
            rel="noreferrer"
            title={s.href}
            className="text-ink underline decoration-line-2 underline-offset-2 hover:decoration-ink [overflow-wrap:anywhere]"
          >
            {s.text}
          </a>
        );
      case "session":
        return (
          <span
            key={key}
            title={s.token}
            className="inline-flex items-baseline gap-1 px-1.5 rounded-[5px] bg-warn-soft text-[13px] leading-[1.45] align-baseline"
          >
            <span className="font-mono text-warn">{s.token}</span>
            {s.label && <span className="text-ink-2">{s.label}</span>}
          </span>
        );
      case "mention":
        return (
          <span key={key} className="px-1 rounded-[4px] bg-accent-soft text-ink font-mono text-[12.5px]">
            {s.text}
          </span>
        );
      default:
        return <span key={key}>{s.text}</span>;
    }
  });
}

/** "last 2 of 40 messages, tool calls…" → "2/40 msgs" */
function compactScope(scope: string): string {
  const m = /last (\d+) of (\d+) messages/.exec(scope);
  return m ? `${m[1]}/${m[2]} msgs` : scope.replace(/,.*$/, "");
}

/** One sent `$session` block: chip first, the exact appended text one click away. */
function SentReferenceChip({ r }: { r: SentReference }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-end gap-1.5">
      <Chip
        glyph={<Glyph kind="session" />}
        tone="warn"
        label={
          <>
            <span className="font-mono text-warn">{r.token}</span> <span>{r.title}</span>
          </>
        }
        meta={compactScope(r.scope)}
        title={`${r.folder}\n${r.scope}`}
        onClick={() => setOpen(!open)}
        wide
      />
      {open && (
        <pre className="w-full max-h-64 overflow-y-auto rounded-lg border border-line bg-paper-2 px-3 py-2 text-left text-xs text-ink-2 whitespace-pre-wrap font-mono">
          {r.text}
        </pre>
      )}
    </div>
  );
}

function User({ m }: { m: UserMessage }) {
  const raw = userText(m);
  const { body, attachments, references, images } = useMemo(() => {
    const a = parseAttachments(raw);
    const r = parseReferences(a.body);
    return { body: r.body, attachments: a.attachments, references: r.references, images: userImages(m) };
  }, [raw, m]);
  const extras = attachments.length + references.length + images.length > 0;
  return (
    <div className="timeline-item px-6 py-3 flex flex-col items-end gap-1.5">
      {body.trim() && (
        <div className="msg-text max-w-[78%] rounded-2xl bg-paper-3 px-3.5 py-2.5 whitespace-pre-wrap leading-[1.6] text-ink">
          <Inline text={body} />
        </div>
      )}
      {extras && (
        <div className="max-w-[78%] flex flex-wrap justify-end gap-1.5">
          {images.map((im, i) => (
            <img
              // biome-ignore lint/suspicious/noArrayIndexKey: images have no identity beyond position
              key={i}
              src={`data:${im.mimeType};base64,${im.data}`}
              alt="attached"
              className="max-h-40 max-w-full rounded-[10px] border border-line"
            />
          ))}
          {attachments.map((a) => (
            <AttachmentChip key={a.path} a={a} onOpen={() => void window.bridge.shell.openPath(a.path)} />
          ))}
          {references.map((r) => (
            <SentReferenceChip key={r.token} r={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function Thinking({ text, live }: { text: string; live: boolean }) {
  const { settings } = useSettings();
  const [open, setOpen] = useState(!settings.appearance.thinkingCollapsed);
  if (!text) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="h-6 text-[12.5px] text-ink-3 hover:text-ink-2 flex items-center gap-1.5"
      >
        <span className={live ? "animate-pulse" : ""}>{live ? "Thinking" : "Thought"}</span>
        <span className="tabular-nums">· {(text.length / 4).toFixed(0)} tokens</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <title>{open ? "collapse" : "expand"}</title>
          <path d="m5 6 3 3 3-3" />
        </svg>
      </button>
      {open && (
        <pre className="mt-1 mb-2 pl-3.5 border-l-2 border-line-2 text-[12.5px] leading-relaxed text-ink-2 whitespace-pre-wrap font-sans">
          {text}
        </pre>
      )}
    </div>
  );
}

/**
 * Memoized on the message object and the tool-run table: a streamed token changes neither for
 * settled messages, so only the live tail re-renders per event.
 */
const Assistant = memo(function Assistant({
  m,
  live,
  toolRuns,
}: {
  m: AssistantMessage;
  live: boolean;
  toolRuns: Record<string, ToolRun>;
}) {
  return (
    <div className="timeline-item px-6 py-2 flex flex-col gap-2">
      {m.content.map((c, i) => {
        const key = `${m.timestamp}-${i}`;
        if (c.type === "thinking") return <Thinking key={key} text={c.thinking} live={live} />;
        if (c.type === "text")
          return (
            <Markdown key={key} source={c.text} live={live} className="text-[14px] leading-[1.7] text-ink" />
          );
        if (c.type === "toolCall") return <ToolCard key={key} call={c} run={toolRuns[c.id]} />;
        return null;
      })}
      {m.stopReason === "error" && m.errorMessage && (
        <div className="mt-1 pl-3.5 border-l-2 border-danger/40 text-danger text-[12.5px] whitespace-pre-wrap">
          {m.errorMessage}
        </div>
      )}
      {m.stopReason === "aborted" && <div className="text-[12.5px] text-ink-3">Stopped.</div>}
    </div>
  );
});

const Item = memo(function Item({ m, toolRuns }: { m: AgentMessage; toolRuns: Record<string, ToolRun> }) {
  if (m.role === "user") return <User m={m} />;
  if (m.role === "assistant") return <Assistant m={m} live={false} toolRuns={toolRuns} />;
  if (m.role === "toolResult") return null; // shown inside the tool line
  return (
    <div className="px-6 py-1 text-[12.5px] text-ink-3">{String((m as { role: string }).role)} message</div>
  );
});

function MarkerRow({ kind, text, detail, live }: Omit<Marker, "afterIndex"> & { live?: boolean }) {
  if (kind === "turn") {
    return (
      <div className="px-6 pt-0.5 pb-3 flex justify-end">
        <span
          className="font-mono tabular-nums text-[11px] text-ink-3/70 hover:text-ink-3 transition-colors select-none"
          title={detail}
        >
          {text}
        </span>
      </div>
    );
  }
  const tone = kind === "retry" ? "text-warn" : "text-ink-3";
  return <div className={`px-6 py-2 text-[12.5px] ${tone} ${live ? "animate-pulse" : ""}`}>{text}</div>;
}

export function Timeline({ state }: { state: ConversationState }) {
  const bottom = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState(true);
  /** How many of the newest messages are mounted; grows as the user scrolls toward the top. */
  const [shown, setShown] = useState(WINDOW);
  const { settings } = useSettings();
  const follow = stick && settings.conversation.autoScroll;

  const total = state.messages.length;
  const from = Math.max(0, total - shown);
  const hidden = from;

  // Follow the stream: the tail grows on every event, so this runs per event by design.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on every state change to follow the stream
  useEffect(() => {
    if (follow) bottom.current?.scrollIntoView({ block: "end" });
  }, [state, follow]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
    if (hidden > 0 && el.scrollTop < 400) {
      // keep the viewport anchored while older rows mount above it
      const before = el.scrollHeight;
      setShown((n) => n + WINDOW_STEP);
      requestAnimationFrame(() => {
        el.scrollTop += el.scrollHeight - before;
      });
    }
  };

  return (
    <div ref={scroller} onScroll={onScroll} className="flex-1 overflow-y-auto pb-6">
      <div className="max-w-[var(--pid-measure)] mx-auto">
        {hidden > 0 ? (
          <button
            type="button"
            onClick={() => setShown(total)}
            className="w-full px-6 py-3 text-[12.5px] text-ink-3 hover:text-ink-2 text-center"
          >
            {hidden} earlier message{hidden === 1 ? "" : "s"} · show all
          </button>
        ) : (
          state.markers
            .filter((k) => k.afterIndex < 0)
            .map((k) => (
              <MarkerRow
                key={`${k.kind}-${k.afterIndex}-${k.text}`}
                kind={k.kind}
                text={k.text}
                detail={k.detail}
              />
            ))
        )}
        {state.messages.slice(from).map((m, j) => {
          const i = from + j;
          return (
            // messages are append-only, so the absolute index is a stable key
            <div key={i}>
              <Item m={m} toolRuns={state.toolRuns} />
              {state.markers
                .filter((k) => k.afterIndex === i)
                .map((k) => (
                  <MarkerRow
                    key={`${k.kind}-${k.afterIndex}-${k.text}`}
                    kind={k.kind}
                    text={k.text}
                    detail={k.detail}
                  />
                ))}
            </div>
          );
        })}
        {state.compacting && <MarkerRow kind="compaction" text="Compacting context…" live />}
        {state.streaming && <Assistant m={state.streaming} live toolRuns={state.toolRuns} />}
        {state.isStreaming && !state.streaming && (
          <div className="px-6 py-2 text-[12.5px] text-ink-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            Working…
          </div>
        )}
        <div ref={bottom} />
      </div>
    </div>
  );
}

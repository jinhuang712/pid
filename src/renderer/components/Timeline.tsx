import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, UserMessage } from "@earendil-works/pi-ai";
import { memo, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  parseAttachments,
  parseReferences,
  parseSkillBlock,
  type SentReference,
  type SentSkill,
  segment,
} from "../attachments";
import { McpServersContext } from "../mcp-servers-context";
import { useSettings } from "../settings";
import type { ConversationState, Marker, ToolRun } from "../state/conversation";
import { describeTurn, groupTurns, splitReply, type Turn } from "../state/turns";
import { fmtDuration } from "../turn-summary";
import { AttachmentChip, Chip, Glyph } from "./Chips";
import { Markdown } from "./Markdown";
import { ToolCard } from "./ToolCard";

/** Turns rendered at first; older ones mount as you scroll up. Long sessions run to hundreds. */
const WINDOW = 40;
const WINDOW_STEP = 40;
/** A turn edge this close to the viewport edge counts as already reached. */
const JUMP_SLACK = 4;
/** Breathing room between the viewport edge and the turn the jump lands on. */
const JUMP_PAD = 12;

/** One of the two floating jump buttons: up lands on the previous prompt, down on the end of a reply. */
function JumpButton({
  dir,
  disabled,
  onClick,
}: {
  dir: "up" | "down";
  disabled: boolean;
  onClick: () => void;
}) {
  const up = dir === "up";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={up ? "Jump to previous prompt  ⌥↑" : "Jump to end of this prompt  ⌥↓"}
      className="w-7 h-7 rounded-full border border-line-2 bg-paper-2 text-ink-2 shadow-[0_2px_8px_rgba(0,0,0,0.08)] flex items-center justify-center transition-colors hover:text-ink hover:bg-paper-3 active:bg-paper-4 active:shadow-none disabled:opacity-40 disabled:pointer-events-none"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <title>{up ? "jump up" : "jump down"}</title>
        {up ? (
          <>
            <path d="M3.5 4.5h9" />
            <path d="m4.5 11 3.5-3.5 3.5 3.5" />
          </>
        ) : (
          <>
            <path d="m4.5 5 3.5 3.5L11.5 5" />
            <path d="M3.5 11.5h9" />
          </>
        )}
      </svg>
    </button>
  );
}

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
            className="font-medium text-accent underline decoration-accent/45 underline-offset-2 hover:decoration-accent hover:bg-accent-soft rounded-[2px] [overflow-wrap:anywhere]"
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
            <span className="font-mono text-warn">{r.token.slice(0, 9)}</span> <span>{r.title}</span>
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

function SentSkillChip({ s }: { s: SentSkill }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-end gap-1.5">
      <Chip
        glyph={<Glyph kind="file" />}
        label={
          <>
            <span className="text-ink-3">skill</span> <span className="font-mono">{s.name}</span>
          </>
        }
        meta={`${(s.text.length / 4).toFixed(0)} tokens`}
        title={s.location}
        onClick={() => setOpen(!open)}
        wide
      />
      {open && (
        <pre className="w-full max-h-64 overflow-y-auto rounded-lg border border-line bg-paper-2 px-3 py-2 text-left text-xs text-ink-2 whitespace-pre-wrap font-mono">
          {s.text}
        </pre>
      )}
    </div>
  );
}

const LARGE_PROMPT_LINES = 12;
const LARGE_PROMPT_CHARS = 800;

/** Whether a prompt is big enough that the compact bubble would turn into a tall, narrow column. */
function isLargePrompt(body: string): boolean {
  if (body.length >= LARGE_PROMPT_CHARS) return true;
  let lines = 1;
  for (let i = body.indexOf("\n"); i !== -1; i = body.indexOf("\n", i + 1)) {
    if (++lines >= LARGE_PROMPT_LINES) return true;
  }
  return false;
}

function User({ m }: { m: UserMessage }) {
  const raw = userText(m);
  const { body, attachments, references, skill, images } = useMemo(() => {
    const a = parseAttachments(raw);
    const r = parseReferences(a.body);
    const k = parseSkillBlock(r.body);
    return {
      body: k.body,
      attachments: a.attachments,
      references: r.references,
      skill: k.skill,
      images: userImages(m),
    };
  }, [raw, m]);
  const extras = attachments.length + references.length + images.length > 0 || skill !== undefined;
  // A short prompt reads best as a compact bubble; a large paste (a log, a table, a long spec)
  // gets most of the column so its lines wrap less and the block stays scannable.
  const width = isLargePrompt(body) ? "max-w-[94%]" : "max-w-[78%]";
  return (
    <div className="timeline-item px-6 py-3 flex flex-col items-end gap-1.5">
      {body.trim() && (
        <div
          className={`msg-text ${width} rounded-2xl bg-paper-3 px-3.5 py-2.5 whitespace-pre-wrap leading-[1.6] text-ink`}
        >
          <Inline text={body} />
        </div>
      )}
      {extras && (
        <div className={`${width} flex flex-wrap justify-end gap-1.5`}>
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
          {skill && <SentSkillChip s={skill} />}
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

const Reply = memo(function Reply({ m, toolRuns }: { m: AgentMessage; toolRuns: Record<string, ToolRun> }) {
  if (m.role === "assistant") return <Assistant m={m} live={false} toolRuns={toolRuns} />;
  if (m.role === "toolResult") return null; // shown inside the tool line
  return (
    <div className="px-6 py-1 text-[12.5px] text-ink-3">{String((m as { role: string }).role)} message</div>
  );
});

function MarkerRow({ kind, text, live }: Pick<Marker, "kind" | "text"> & { live?: boolean }) {
  const failed = kind === "command-failed";
  const tone = kind === "retry" || failed ? "text-warn" : "text-ink-3";
  // command rows carry a glyph: a check once settled, a pulsing dot while running, "!" on failure
  const glyph =
    kind === "command" || failed ? (
      live ? (
        <span className="w-1.5 h-1.5 mx-[3px] rounded-full bg-accent animate-pulse" />
      ) : (
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
        >
          <title>{failed ? "failed" : "done"}</title>
          {failed ? <path d="M8 4v5M8 12v.5" /> : <path d="M3 8.5l3 3 7-7" />}
        </svg>
      )
    ) : null;
  return (
    <div
      className={`px-6 py-2 text-[12.5px] flex items-center gap-2 ${tone} ${live && !glyph ? "animate-pulse" : ""}`}
    >
      {glyph}
      <span className="min-w-0 [overflow-wrap:anywhere]">{text}</span>
    </div>
  );
}

/**
 * The step line of a settled turn: chevron · "Worked for 12s · 4 tool calls · …". Hover shows the
 * token breakdown. Without steps there is nothing to unfold and the chevron is omitted.
 */
function Steps({ turn, open, onToggle }: { turn: Turn; open: boolean; onToggle?: () => void }) {
  return (
    <div className="px-6 pt-1">
      <button
        type="button"
        onClick={onToggle}
        disabled={!onToggle}
        className={`group flex items-center gap-2 h-6 text-[12.5px] text-ink-3 ${onToggle ? "hover:text-ink-2" : "cursor-default"}`}
        title={turn.summary?.detail}
      >
        {onToggle && (
          <svg
            width="10"
            height="10"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          >
            <title>{open ? "collapse" : "expand"}</title>
            <path d="m6 4 4 4-4 4" />
          </svg>
        )}
        <span className="tabular-nums">{describeTurn(turn)}</span>
      </button>
    </div>
  );
}

/**
 * One exchange. While Pi is still working every step stays open so output can be read as it
 * arrives; once the turn settles the steps fold behind the step line and only the answer remains.
 */
const TurnBlock = memo(function TurnBlock({
  turn,
  toolRuns,
  streaming,
}: {
  turn: Turn;
  toolRuns: Record<string, ToolRun>;
  /** The in-flight assistant message when this is the open turn. */
  streaming?: AssistantMessage;
}) {
  const { settings } = useSettings();
  const [open, setOpen] = useState(!settings.appearance.stepsCollapsed);
  const settled = turn.summary !== undefined;
  const { steps, answer } = useMemo(() => splitReply(turn.replies), [turn.replies]);
  const unfolded = !settled || open;
  const replies = settled ? steps : turn.replies;
  return (
    // data-turn anchors the jump buttons: the block's top is the prompt, its bottom the end of the reply
    <div data-turn={turn.start}>
      {turn.user && <User m={turn.user.m} />}
      {settled && (
        <Steps turn={turn} open={open} onToggle={steps.length > 0 ? () => setOpen(!open) : undefined} />
      )}
      {unfolded && replies.map(({ index, m }) => <Reply key={index} m={m} toolRuns={toolRuns} />)}
      {settled && answer && <Assistant m={answer} live={false} toolRuns={toolRuns} />}
      {streaming && <Assistant m={streaming} live toolRuns={toolRuns} />}
      {turn.markers.map((k) => (
        <MarkerRow key={`${k.kind}-${k.afterIndex}-${k.text}`} kind={k.kind} text={k.text} />
      ))}
    </div>
  );
});

/** Seconds since the turn started, ticking once a second. */
function Elapsed({ since }: { since: number }): ReactNode {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono tabular-nums text-ink-3/80">{fmtDuration(now - since)}</span>;
}

export function Timeline({
  state,
  mcpServers = [],
}: {
  state: ConversationState;
  /** MCP server names the session reports, for labelling pid-mcp's native tool calls. */
  mcpServers?: readonly string[];
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState(true);
  /** How many of the newest messages are mounted; grows as the user scrolls toward the top. */
  const [shown, setShown] = useState(WINDOW);
  const { settings } = useSettings();
  const follow = stick && settings.conversation.autoScroll;

  const turns = useMemo(() => groupTurns(state.messages, state.markers), [state.messages, state.markers]);
  const from = Math.max(0, turns.length - shown);
  /** Messages above the window, for the "earlier messages" row. */
  const hidden = from > 0 ? turns[from].start : 0;
  const last = turns[turns.length - 1];
  /** The streaming message belongs to the last turn unless that turn has already settled. */
  const tailOpen = last !== undefined && last.summary === undefined;

  // Follow the stream: the tail grows on every event, so this runs per event by design.
  // It runs before paint so a new row never shows unscrolled, and it reads `follow` through a ref
  // so the user's own scroll toward the bottom does not snap the viewport on every wheel tick.
  const followRef = useRef(follow);
  followRef.current = follow;
  /** True while a jump's programmatic scroll is in flight; the stream must not steer the viewport then. */
  const jumping = useRef(false);
  /** Detaches the in-flight jump's listeners so a newer jump can take over. */
  const cancelJump = useRef<(() => void) | undefined>(undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on every state change to follow the stream
  useLayoutEffect(() => {
    const el = scroller.current;
    if (followRef.current && !jumping.current && el) el.scrollTop = el.scrollHeight;
  }, [state]);

  const nearBottom = (el: HTMLDivElement) => el.scrollHeight - el.scrollTop - el.clientHeight < 48;

  // Jump buttons: move one turn at a time. "Up" lands on the top of the nearest turn that starts
  // above the viewport; "down" lands on the bottom of the nearest turn that ends below it.
  const [canJump, setCanJump] = useState({ up: false, down: false });
  /** Mounted turn blocks with their top/bottom in scroller coordinates, in document order. */
  const turnBounds = (el: HTMLDivElement) => {
    const base = el.getBoundingClientRect().top - el.scrollTop;
    return Array.from(el.querySelectorAll<HTMLElement>("[data-turn]")).map((node) => {
      const r = node.getBoundingClientRect();
      return { node, top: r.top - base, bottom: r.bottom - base };
    });
  };
  const measureJump = () => {
    const el = scroller.current;
    if (!el) return;
    const bounds = turnBounds(el);
    const viewTop = el.scrollTop + JUMP_SLACK;
    const viewBottom = el.scrollTop + el.clientHeight - JUMP_SLACK;
    setCanJump({
      up: hidden > 0 || bounds.some((b) => b.top < viewTop),
      down: bounds.some((b) => b.bottom > viewBottom),
    });
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure whenever the rows change
  useLayoutEffect(measureJump, [state, shown]);

  // A smooth scroll passes through the "near bottom" band on its way up, so `stick` is frozen
  // until the scroll ends and is then read from where the jump actually landed.
  const scrollTo = (el: HTMLDivElement, top: number) => {
    const reduced = document.documentElement.dataset.motion === "reduced";
    jumping.current = true;
    followRef.current = false;
    let timer = 0;
    const detach = () => {
      window.clearTimeout(timer);
      el.removeEventListener("scrollend", settle);
      cancelJump.current = undefined;
    };
    const settle = () => {
      detach();
      jumping.current = false;
      setStick(nearBottom(el));
      measureJump();
    };
    cancelJump.current?.(); // a newer jump takes over the in-flight one
    cancelJump.current = detach;
    el.addEventListener("scrollend", settle);
    timer = window.setTimeout(settle, 1000); // scrollend never fires when the position does not change
    el.scrollTo({ top: Math.max(0, top), behavior: reduced ? "auto" : "smooth" });
  };
  const jumpUp = () => {
    const el = scroller.current;
    if (!el) return;
    setStick(false);
    const above = turnBounds(el).filter((b) => b.top < el.scrollTop - JUMP_SLACK);
    const target = above[above.length - 1];
    if (target) {
      scrollTo(el, target.top - JUMP_PAD);
      return;
    }
    if (hidden > 0) {
      // the previous turn is not mounted yet: mount everything, then land on it after layout
      const prev = turns[from - 1].start;
      setShown(turns.length);
      requestAnimationFrame(() => {
        const node = el.querySelector<HTMLElement>(`[data-turn="${prev}"]`);
        if (!node) return;
        const base = el.getBoundingClientRect().top - el.scrollTop;
        scrollTo(el, node.getBoundingClientRect().top - base - JUMP_PAD);
      });
    }
  };
  const jumpDown = () => {
    const el = scroller.current;
    if (!el) return;
    const viewBottom = el.scrollTop + el.clientHeight;
    const target = turnBounds(el).find((b) => b.bottom > viewBottom + JUMP_SLACK);
    if (target) scrollTo(el, target.bottom + JUMP_PAD - el.clientHeight);
  };

  // ⌥↑ / ⌥↓ mirror the buttons, except while typing in a field
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable)) return;
      e.preventDefault();
      if (e.key === "ArrowUp") jumpUp();
      else jumpDown();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    if (!jumping.current) setStick(nearBottom(el));
    measureJump();
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
    <McpServersContext.Provider value={mcpServers}>
      <div className="flex-1 min-h-0 relative flex flex-col">
        <div ref={scroller} onScroll={onScroll} className="flex-1 overflow-y-auto overflow-x-hidden pb-6">
          <div className="max-w-[var(--pid-measure)] mx-auto min-w-0">
            {hidden > 0 ? (
              <button
                type="button"
                onClick={() => setShown(turns.length)}
                className="w-full px-6 py-3 text-[12.5px] text-ink-3 hover:text-ink-2 text-center"
              >
                {hidden} earlier message{hidden === 1 ? "" : "s"} · show all
              </button>
            ) : (
              state.markers
                .filter((k) => k.afterIndex < 0)
                .map((k) => (
                  <MarkerRow key={`${k.kind}-${k.afterIndex}-${k.text}`} kind={k.kind} text={k.text} />
                ))
            )}
            {turns.slice(from).map((t) => (
              // messages are append-only, so a turn's first index is a stable key
              <TurnBlock
                key={t.start}
                turn={t}
                toolRuns={state.toolRuns}
                streaming={t === last && tailOpen ? state.streaming : undefined}
              />
            ))}
            {state.compacting && <MarkerRow kind="compaction" text="Compacting context…" live />}
            {state.commands.map((c) => (
              <MarkerRow key={c.id} kind="command" text={c.text} live />
            ))}
            {state.streaming && !tailOpen && <Assistant m={state.streaming} live toolRuns={state.toolRuns} />}
            {state.isStreaming && (
              <div className="px-6 py-2 text-[12.5px] text-ink-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                Working…
                {state.turnStartedAt !== undefined && <Elapsed since={state.turnStartedAt} />}
              </div>
            )}
          </div>
        </div>
        {turns.length > 1 && (
          <div className="absolute right-4 bottom-4 flex flex-col gap-1.5">
            <JumpButton dir="up" disabled={!canJump.up} onClick={jumpUp} />
            <JumpButton dir="down" disabled={!canJump.down} onClick={jumpDown} />
          </div>
        )}
      </div>
    </McpServersContext.Provider>
  );
}

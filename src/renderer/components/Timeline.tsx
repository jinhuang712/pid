import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, UserMessage } from "@earendil-works/pi-ai";
import { useEffect, useRef, useState } from "react";
import { useSettings } from "../settings";
import type { ConversationState, Marker } from "../state/conversation";
import { Markdown } from "./Markdown";
import { ToolCard } from "./ToolCard";

function userText(m: UserMessage): string {
  return typeof m.content === "string"
    ? m.content
    : m.content.map((c) => (c.type === "text" ? c.text : "[image]")).join("\n");
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

function Assistant({ m, live, state }: { m: AssistantMessage; live: boolean; state: ConversationState }) {
  return (
    <div className="timeline-item px-6 py-2 flex flex-col gap-2">
      {m.content.map((c, i) => {
        const key = `${m.timestamp}-${i}`;
        if (c.type === "thinking") return <Thinking key={key} text={c.thinking} live={live} />;
        if (c.type === "text")
          return <Markdown key={key} source={c.text} className="text-[14px] leading-[1.7] text-ink" />;
        if (c.type === "toolCall") return <ToolCard key={key} call={c} run={state.toolRuns[c.id]} />;
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
}

function Item({ m, state }: { m: AgentMessage; state: ConversationState }) {
  if (m.role === "user") {
    return (
      <div className="timeline-item px-6 py-3 flex justify-end">
        <div className="max-w-[78%] rounded-2xl bg-paper-3 px-3.5 py-2.5 whitespace-pre-wrap text-[14px] leading-[1.6] text-ink">
          {userText(m)}
        </div>
      </div>
    );
  }
  if (m.role === "assistant") return <Assistant m={m} live={false} state={state} />;
  if (m.role === "toolResult") return null; // shown inside the tool line
  return (
    <div className="px-6 py-1 text-[12.5px] text-ink-3">{String((m as { role: string }).role)} message</div>
  );
}

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
  const { settings } = useSettings();
  const follow = stick && settings.conversation.autoScroll;

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on every state change to follow the stream
  useEffect(() => {
    if (follow) bottom.current?.scrollIntoView({ block: "end" });
  }, [state, follow]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
  };

  return (
    <div ref={scroller} onScroll={onScroll} className="flex-1 overflow-y-auto pb-6">
      <div className="max-w-3xl mx-auto">
        {state.markers
          .filter((k) => k.afterIndex < 0)
          .map((k) => (
            <MarkerRow
              key={`${k.kind}-${k.afterIndex}-${k.text}`}
              kind={k.kind}
              text={k.text}
              detail={k.detail}
            />
          ))}
        {state.messages.map((m, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: messages are append-only
          <div key={i}>
            <Item m={m} state={state} />
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
        ))}
        {state.compacting && <MarkerRow kind="compaction" text="Compacting context…" live />}
        {state.streaming && <Assistant m={state.streaming} live state={state} />}
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

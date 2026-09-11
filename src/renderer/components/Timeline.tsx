import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, UserMessage } from "@earendil-works/pi-ai";
import { useEffect, useRef, useState } from "react";
import type { ConversationState } from "../state/conversation";
import { Markdown } from "./Markdown";
import { ToolCard } from "./ToolCard";

function userText(m: UserMessage): string {
  return typeof m.content === "string"
    ? m.content
    : m.content.map((c) => (c.type === "text" ? c.text : "[image]")).join("\n");
}

function Thinking({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <div className="my-1.5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-xs text-ink-3 hover:text-ink-2 flex items-center gap-1"
      >
        <span>{open ? "▾" : "▸"}</span>
        <span className={live ? "animate-pulse" : ""}>thinking</span>
        <span className="tabular-nums">· {text.length.toLocaleString()} chars</span>
      </button>
      {open && (
        <pre className="mt-1 pl-3 border-l-2 border-line text-xs text-ink-2 whitespace-pre-wrap font-sans">
          {text}
        </pre>
      )}
    </div>
  );
}

function Assistant({ m, live, state }: { m: AssistantMessage; live: boolean; state: ConversationState }) {
  return (
    <div className="px-4 py-2">
      {m.content.map((c, i) => {
        const key = `${m.timestamp}-${i}`;
        if (c.type === "thinking") return <Thinking key={key} text={c.thinking} live={live} />;
        if (c.type === "text") return <Markdown key={key} source={c.text} className="text-lg text-ink" />;
        if (c.type === "toolCall") return <ToolCard key={key} call={c} run={state.toolRuns[c.id]} />;
        return null;
      })}
      {m.stopReason === "error" && m.errorMessage && (
        <div className="mt-2 rounded-md border border-danger/40 bg-danger-soft text-danger text-xs px-3 py-2 whitespace-pre-wrap">
          {m.errorMessage}
        </div>
      )}
      {m.stopReason === "aborted" && <div className="mt-1 text-xs text-ink-3">aborted</div>}
    </div>
  );
}

function Item({ m, state }: { m: AgentMessage; state: ConversationState }) {
  if (m.role === "user") {
    return (
      <div className="px-4 py-2 flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-md bg-paper-3 px-4 py-2 whitespace-pre-wrap text-ink">
          {userText(m)}
        </div>
      </div>
    );
  }
  if (m.role === "assistant") return <Assistant m={m} live={false} state={state} />;
  if (m.role === "toolResult") return null; // shown inside the ToolCard
  return <div className="px-4 py-1 text-xs text-ink-3">{String((m as { role: string }).role)} message</div>;
}

export function Timeline({ state }: { state: ConversationState }) {
  const bottom = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on every state change to follow the stream
  useEffect(() => {
    if (stick) bottom.current?.scrollIntoView({ block: "end" });
  }, [state, stick]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
  };

  return (
    <div ref={scroller} onScroll={onScroll} className="flex-1 overflow-y-auto py-3">
      <div className="max-w-3xl mx-auto">
        {state.messages.map((m, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: messages are append-only
          <Item key={i} m={m} state={state} />
        ))}
        {state.streaming && <Assistant m={state.streaming} live state={state} />}
        {state.isStreaming && !state.streaming && (
          <div className="px-4 py-2 text-xs text-accent animate-pulse">working…</div>
        )}
        <div ref={bottom} />
      </div>
    </div>
  );
}

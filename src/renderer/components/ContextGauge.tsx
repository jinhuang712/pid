import type { AssistantMessage } from "@earendil-works/pi-ai";

/** Context usage from the last assistant message's usage against the model's context window. */
export function ContextGauge({
  usage,
  contextWindow,
  compacting,
}: {
  usage?: AssistantMessage["usage"];
  contextWindow?: number;
  compacting: boolean;
}) {
  if (!usage || !contextWindow) return null;
  const used = usage.input + usage.cacheRead + usage.cacheWrite + usage.output;
  const pct = Math.min(100, Math.round((used / contextWindow) * 100));
  const tone = pct > 85 ? "bg-danger" : pct > 65 ? "bg-warn" : "bg-accent";
  return (
    <div
      className="no-drag flex items-center gap-1.5 text-xs text-ink-3"
      title={`${used.toLocaleString()} of ${contextWindow.toLocaleString()} tokens in context${compacting ? " · compacting" : ""}`}
    >
      <div className="w-16 h-1.5 rounded-full bg-paper-3 overflow-hidden">
        <div
          className={`h-full ${compacting ? "bg-warn animate-pulse" : tone}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="tabular-nums">{pct}%</span>
    </div>
  );
}

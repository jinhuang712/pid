/**
 * Pi's steer / follow-up queue, as Pi reports it via queue_update.
 * A follow-up can be promoted: "Steer after tool" is Pi's native steer (delivered before the
 * next model call); "Steer now" aborts the current turn and sends it immediately.
 */
export function QueuePanel({
  streaming,
  steering,
  followUp,
  onSteerAfterTool,
  onSteerNow,
  onRemove,
}: {
  streaming: boolean;
  steering: readonly string[];
  followUp: readonly string[];
  onSteerAfterTool: (index: number) => void;
  onSteerNow: (index: number) => void;
  onRemove: (kind: "steer" | "followUp", index: number) => void;
}) {
  if (steering.length === 0 && followUp.length === 0) return null;
  const btn = "h-5.5 px-2 rounded-md border border-line text-xs disabled:opacity-40";
  return (
    <div className="shrink-0 px-4">
      <div className="max-w-3xl mx-auto rounded-lg border border-line bg-paper-2 text-xs">
        <div className="flex items-center gap-2 px-3 h-7 text-ink-3 border-b border-line">
          <span>{streaming ? "Active response" : "Idle"}</span>
          <span>→</span>
          <span>{steering.length} steer</span>
          <span>→</span>
          <span>{followUp.length} follow-up</span>
        </div>
        {steering.map((t, i) => (
          <div
            key={`s-${t}`}
            className="flex items-center gap-2 px-3 py-1.5 border-b border-line last:border-b-0"
          >
            <span className="shrink-0 rounded px-1.5 bg-warn-soft text-warn">steer</span>
            <span className="flex-1 text-ink truncate" title={t}>
              {t}
            </span>
            <span className="text-ink-3">after current tool</span>
            <button
              type="button"
              onClick={() => onRemove("steer", i)}
              className="px-1 text-ink-3 hover:text-danger"
              title="Drop"
            >
              ×
            </button>
          </div>
        ))}
        {followUp.map((t, i) => (
          <div
            key={`f-${t}`}
            className="flex items-center gap-2 px-3 py-1.5 border-b border-line last:border-b-0"
          >
            <span className="shrink-0 rounded px-1.5 bg-paper-3 text-ink-2">follow-up</span>
            <span className="flex-1 text-ink truncate" title={t}>
              {t}
            </span>
            <button
              type="button"
              onClick={() => onSteerNow(i)}
              disabled={!streaming}
              title="Abort the current turn and send this now"
              className={`${btn} text-warn`}
            >
              Steer now
            </button>
            <button
              type="button"
              onClick={() => onSteerAfterTool(i)}
              disabled={!streaming}
              title="Deliver after the current tool call, before the next model call"
              className={`${btn} text-ink-2`}
            >
              Steer after tool
            </button>
            <button
              type="button"
              onClick={() => onRemove("followUp", i)}
              className="px-1 text-ink-3 hover:text-danger"
              title="Drop"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

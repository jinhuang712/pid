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
  const btn =
    "h-6 px-1.5 rounded-md text-[12.5px] text-ink-3 hover:text-ink hover:bg-paper-3 disabled:opacity-40";
  return (
    <div className="shrink-0 px-6">
      <div className="max-w-3xl mx-auto text-[12.5px] flex flex-col">
        {steering.map((t, i) => (
          <div key={`s-${t}`} className="flex items-center gap-3 px-3 h-[30px]">
            <span className="shrink-0 text-warn">Steer</span>
            <span className="flex-1 text-ink truncate" title={t}>
              {t}
            </span>
            <span className="text-ink-3">after current tool</span>
            <button
              type="button"
              onClick={() => onRemove("steer", i)}
              className="px-1.5 text-ink-3 hover:text-danger"
              title="Drop"
            >
              ×
            </button>
          </div>
        ))}
        {followUp.map((t, i) => (
          <div key={`f-${t}`} className="flex items-center gap-3 px-3 h-[30px]">
            <span className="shrink-0 text-ink-3">Queued</span>
            <span className="flex-1 text-ink truncate" title={t}>
              {t}
            </span>
            <button
              type="button"
              onClick={() => onSteerNow(i)}
              disabled={!streaming}
              title="Abort the current turn and send this now"
              className={btn}
            >
              Steer now
            </button>
            <button
              type="button"
              onClick={() => onSteerAfterTool(i)}
              disabled={!streaming}
              title="Deliver after the current tool call, before the next model call"
              className={btn}
            >
              Steer after tool
            </button>
            <button
              type="button"
              onClick={() => onRemove("followUp", i)}
              className="px-1.5 text-ink-3 hover:text-danger"
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

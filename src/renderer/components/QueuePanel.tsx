/** Pi's steer / follow-up queue, as Pi reports it via queue_update. */
export function QueuePanel({
  streaming,
  steering,
  followUp,
  onClear,
}: {
  streaming: boolean;
  steering: readonly string[];
  followUp: readonly string[];
  onClear: () => void;
}) {
  if (steering.length === 0 && followUp.length === 0) return null;
  const row = (kind: "steer" | "follow-up", text: string, i: number) => (
    <div key={`${kind}-${i}`} className="flex items-start gap-2 px-3 py-1.5 text-xs">
      <span
        className={`mt-0.5 shrink-0 rounded px-1.5 ${kind === "steer" ? "bg-warn-soft text-warn" : "bg-paper-3 text-ink-2"}`}
      >
        {kind}
      </span>
      <span className="text-ink truncate">{text}</span>
    </div>
  );
  return (
    <div className="shrink-0 px-4">
      <div className="max-w-3xl mx-auto rounded-lg border border-line bg-paper-2">
        <div className="flex items-center gap-2 px-3 h-7 text-xs text-ink-3 border-b border-line">
          <span>{streaming ? "Active response" : "Idle"}</span>
          <span>→</span>
          <span>{steering.length} steer</span>
          <span>→</span>
          <span>{followUp.length} follow-up</span>
          <span className="flex-1" />
          <button type="button" onClick={onClear} className="hover:text-danger">
            clear queue
          </button>
        </div>
        {steering.map((t, i) => row("steer", t, i))}
        {followUp.map((t, i) => row("follow-up", t, i))}
      </div>
    </div>
  );
}

import { stripPromptBlocks } from "@shared/prompt-blocks";

/**
 * A key per queued row. The queue is plain text, so the same message can sit there twice; its
 * occurrence is what makes two identical rows distinct, without falling back to the index (which
 * the next removal would shift onto a different row).
 */
function rowKeys(list: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return list.map((text) => {
    const n = seen.get(text) ?? 0;
    seen.set(text, n + 1);
    return `${text}\u0000${n}`;
  });
}

/**
 * Pi's steer / follow-up queue, as Pi reports it via queue_update. Pi has already expanded a
 * `/skill` into its SKILL.md by then, so the row shows the folded command and keeps the full
 * text on hover.
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
  const steerKeys = rowKeys(steering);
  const followKeys = rowKeys(followUp);
  const btn =
    "h-6 px-1.5 rounded-md text-[12.5px] text-ink-3 hover:text-ink hover:bg-paper-3 disabled:opacity-40";
  return (
    <div
      className="shrink-0 px-6"
      title="Queue edits are best effort: Pi has no atomic queue API, so PID clears and re-adds. Anything that fails to go back lands in the composer."
    >
      <div className="max-w-[var(--pid-measure)] mx-auto text-xs flex flex-col">
        {steering.map((t, i) => (
          <div key={steerKeys[i]} className="flex items-center gap-3 px-3 h-[30px]">
            <span className="shrink-0 text-warn">Steer</span>
            <span className="flex-1 text-ink truncate" title={t}>
              {stripPromptBlocks(t) || t}
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
          <div key={followKeys[i]} className="flex items-center gap-3 px-3 h-[30px]">
            <span className="shrink-0 text-ink-3">Queued</span>
            <span className="flex-1 text-ink truncate" title={t}>
              {stripPromptBlocks(t) || t}
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

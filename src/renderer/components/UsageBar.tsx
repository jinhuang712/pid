import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ReactNode } from "react";
import { Num } from "@/ui";
import { useSettings } from "../settings";
import { fmtCost, fmtTokens, type Usage } from "../turn-summary";

/**
 * The line under the composer toolbar: what is in the context window right now,
 * and what this conversation has spent. Both come from the message stream PID
 * already has, so the row knows no provider and no plan.
 *
 * It sits in the card's bottom padding with no rule above it — the toolbar's controls are 26px
 * tall and this is 12px text, which is separation enough.
 */
export function UsageBar({
  lastUsage,
  sessionUsage,
  contextWindow,
  compacting,
}: {
  /** Usage of the last assistant message: what is in the context window right now. */
  lastUsage?: AssistantMessage["usage"];
  /** Everything this session has spent, for the running cost. */
  sessionUsage?: Usage;
  contextWindow?: number;
  compacting?: boolean;
}): ReactNode {
  const s = useSettings().settings.usageBar;
  if (!s.enabled || !s.sessionStats) return null;

  // Nothing to show, no row: the context gauge goes back inline in the toolbar rather than taking
  // a line of its own. Composer decides that from the same fact.
  const session = renderSession(lastUsage, sessionUsage, contextWindow, compacting);
  if (!session) return null;

  return (
    <div className="flex items-center justify-end gap-4 h-6 pl-4 pr-4 pb-2 text-xs text-ink-3 whitespace-nowrap overflow-hidden">
      <span className="inline-flex items-center gap-3.5 shrink-0">{session}</span>
    </div>
  );
}

/**
 * The row: what is in the context window, and what the session has cost. Both come from
 * the message stream PID already has, so they keep working whatever the provider is.
 */
function renderSession(
  lastUsage: AssistantMessage["usage"] | undefined,
  sessionUsage: Usage | undefined,
  contextWindow: number | undefined,
  compacting: boolean | undefined,
): ReactNode {
  const cost = sessionUsage && fmtCost(sessionUsage.cost.total);
  if (!contextWindow && !cost) return null;
  const used = lastUsage
    ? lastUsage.input + lastUsage.cacheRead + lastUsage.cacheWrite + lastUsage.output
    : 0;
  const pct = contextWindow ? Math.min(100, Math.round((used / contextWindow) * 100)) : 0;
  return (
    <>
      {/* A bare `contextWindow &&` would paint a literal 0 for a model that reports no window. */}
      {!!contextWindow && (
        <span
          className="inline-flex items-center gap-1.5"
          title={`context: ${used.toLocaleString()} of ${contextWindow.toLocaleString()} tokens · ${pct}%${
            compacting ? " · compacting" : ""
          }`}
        >
          <Ring percent={pct} compacting={compacting} />
          <span>
            <Num className="text-ink-2">{fmtTokens(used)}</Num>
            {` / ${fmtTokens(contextWindow)}`}
          </span>
        </span>
      )}
      {cost && (
        <Num className="text-ink-3" title="Cost of this session so far">
          {cost}
        </Num>
      )}
    </>
  );
}

/** Same gauge the composer toolbar has always drawn, at the size this row can afford. */
function Ring({ percent, compacting }: { percent: number; compacting?: boolean }): ReactNode {
  const r = 6;
  const c = 2 * Math.PI * r;
  const tone = percent > 85 ? "text-danger" : percent > 65 ? "text-warn" : "text-ink-2";
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" className={compacting ? "animate-pulse" : ""}>
      <title>context usage</title>
      <circle cx="8" cy="8" r={r} fill="none" className="stroke-paper-4" strokeWidth="2" />
      <circle
        cx="8"
        cy="8"
        r={r}
        fill="none"
        className={`${tone} stroke-current`}
        strokeWidth="2"
        strokeDasharray={`${(c * percent) / 100} ${c}`}
        transform="rotate(-90 8 8)"
      />
    </svg>
  );
}

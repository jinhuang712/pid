import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { PidSettings } from "@shared/settings";
import {
  formatResetAt,
  formatResetIn,
  formatUsedPercent,
  type ProviderUsage,
  type UsageTone,
  type UsageWindow,
  windowTone,
} from "@shared/usage";
import type { ReactNode } from "react";
import { useSettings } from "../settings";
import { fmtCost, fmtTokens, type Usage } from "../turn-summary";

/**
 * The line under the composer toolbar: how much of the plan is gone, and what this conversation
 * has spent.
 *
 * It sits in the card's bottom padding with no rule above it — the toolbar's controls are 26px
 * tall and this is 12px text, which is separation enough. The accent appears exactly once, as the
 * dot before the provider's name, so a glance lands on the provider and the colours further right
 * are free to mean something.
 */
export function UsageBar({
  usage,
  lastUsage,
  sessionUsage,
  contextWindow,
  compacting,
}: {
  usage?: ProviderUsage;
  /** Usage of the last assistant message: what is in the context window right now. */
  lastUsage?: AssistantMessage["usage"];
  /** Everything this session has spent, for the running cost. */
  sessionUsage?: Usage;
  contextWindow?: number;
  compacting?: boolean;
}): ReactNode {
  const s = useSettings().settings.usageBar;
  if (!s.enabled) return null;

  // Nothing published, no row: the context gauge goes back inline in the toolbar rather than taking
  // a line of its own. Composer decides that from the same fact.
  if (!usage) return null;
  const quota = renderQuota(usage, s);
  const session = s.sessionStats ? renderSession(lastUsage, sessionUsage, contextWindow, compacting) : null;
  if (!quota && !session) return null;

  return (
    <div className="flex items-center justify-between gap-4 h-6 pl-4 pr-4 pb-2 text-xs text-ink-3 whitespace-nowrap overflow-hidden">
      <span className="inline-flex items-center gap-3.5 min-w-0 overflow-hidden">{quota}</span>
      <span className="inline-flex items-center gap-3.5 shrink-0">{session}</span>
    </div>
  );
}

type Prefs = PidSettings["usageBar"];

function renderQuota(usage: ProviderUsage | undefined, s: Prefs): ReactNode {
  if (!usage || usage.state === "unavailable") return null;
  const loading = usage.state === "loading";
  const stale = usage.state === "stale";
  // Which windows exist, in what order and under what name, is the publisher's to decide.
  const windows = usage.windows;
  if (windows.length === 0 && !loading) return null;

  return (
    <>
      <span className="inline-flex items-center gap-[7px] text-ink-2 shrink-0">
        <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${stale ? "bg-warn" : "bg-accent"}`} />
        {usage.providerLabel ?? usage.provider}
        {stale && <span className="text-ink-3">stale</span>}
      </span>
      {loading && windows.length === 0 ? (
        <Pending label="—" meters={s.meters} />
      ) : (
        windows.map((w) => <Window key={w.id} window={w} usage={usage} prefs={s} />)
      )}
    </>
  );
}

function Window({
  window: w,
  usage,
  prefs,
}: {
  window: UsageWindow;
  usage: ProviderUsage;
  prefs: Prefs;
}): ReactNode {
  const tone = windowTone(w, { warning: prefs.warnPercent, danger: prefs.dangerPercent });
  // A countdown is measured from the reading, not from now: one that ticked between 30-second
  // fetches would claim a precision this number does not have. A clock time has no such problem,
  // so it is read straight off the reset moment.
  const from = usage.fetchedAt ?? Date.now();
  const reset =
    w.resetAt === undefined || prefs.resetDisplay === "off"
      ? undefined
      : prefs.resetDisplay === "at"
        ? formatResetAt(w.resetAt, from)
        : formatResetIn(w.resetAt - from);
  // The hover always spells both out, whichever one the row is showing.
  const detail =
    w.resetAt === undefined
      ? ""
      : ` · resets in ${formatResetIn(w.resetAt - from)}, at ${formatResetAt(w.resetAt, from)}`;
  return (
    <span
      className="inline-flex items-center gap-1.5 shrink-0"
      title={`${usage.providerLabel ?? usage.provider} ${w.label}: ${formatUsedPercent(w.usedPercent)} used${detail}`}
    >
      <Label>{w.label}</Label>
      {prefs.meters && <Meter percent={w.usedPercent} tone={tone} />}
      <span className={`font-mono tabular-nums ${TEXT[tone]}`}>{formatUsedPercent(w.usedPercent)}</span>
      {reset && <span className="text-[11px] font-mono tabular-nums text-ink-3">{reset}</span>}
    </span>
  );
}

/** The first fetch of a session: the windows are known, the numbers are not. */
function Pending({ label, meters }: { label: string; meters: boolean }): ReactNode {
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0">
      <Label>{label}</Label>
      {meters && <Meter percent={undefined} tone="muted" />}
      <span className="font-mono tabular-nums text-ink-3">—</span>
    </span>
  );
}

function Label({ children }: { children: ReactNode }): ReactNode {
  return <span className="text-[10.5px] uppercase tracking-[0.06em] text-ink-3">{children}</span>;
}

function Meter({ percent, tone }: { percent?: number; tone: UsageTone }): ReactNode {
  const width = Math.max(0, Math.min(100, percent ?? 0));
  return (
    <span className="relative inline-block w-7 h-[2px] rounded-[1px] bg-line-2 overflow-hidden shrink-0">
      <span
        className={`absolute left-0 inset-y-0 rounded-[1px] ${FILL[tone]}`}
        style={{ width: `${width}%` }}
      />
    </span>
  );
}

/**
 * The right half: what is in the context window, and what the session has cost. Both come from
 * the message stream PID already has, so they keep working for a provider with no quota endpoint.
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
            <span className="font-mono tabular-nums text-ink-2">{fmtTokens(used)}</span>
            {` / ${fmtTokens(contextWindow)}`}
          </span>
        </span>
      )}
      {cost && (
        <span className="font-mono tabular-nums text-ink-3" title="Cost of this session so far">
          {cost}
        </span>
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

const TEXT: Record<UsageTone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  muted: "text-ink-3",
};

const FILL: Record<UsageTone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  muted: "bg-ink-3",
};

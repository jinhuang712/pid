import type { ExtensionPage as Page, PageAction, PageRow, Tone } from "@shared/extension-page";
import { useState } from "react";
import { fuzzyFilter } from "../fuzzy";
import { Badge, PageShell, Toggle } from "./PageShell";

/**
 * A page an extension described.
 *
 * Everything here is generic: rows, badges, a switch, some buttons. PID does not know what the rows
 * are — servers, indexes, jobs, anything an extension ships — and
 * finds out nothing by rendering them. The description says what to draw and what each affordance
 * runs; the meaning stays in the extension, along with its name.
 *
 * Every affordance resolves to a command string that PID runs the way a typed slash command runs.
 * So the extension needs no PID-specific code to be operable here, and its commands keep working in
 * the terminal unchanged.
 */
export function ExtensionPage({
  page,
  onCommand,
}: {
  page: Page;
  /** Runs a command in the session that published the page. Undefined when none is live. */
  onCommand?: (command: string) => Promise<unknown>;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  const run = (command: string) => {
    if (!onCommand) return;
    setError(undefined);
    setBusy(command);
    void onCommand(command)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(undefined));
  };

  const sections = page.sections.map((s) => ({
    ...s,
    rows: fuzzyFilter(s.rows, q, (r) => `${r.title} ${r.subtitle ?? ""}`),
  }));

  return (
    <PageShell title={page.title} note={page.note} search={q} onSearch={setQ}>
      {error && <div className="mb-3 text-xs text-danger">{error}</div>}
      <div className="flex flex-col gap-5">
        {sections.map((s, i) => (
          // A section has no id of its own: an extension groups rows, it does not name the groups.
          // biome-ignore lint/suspicious/noArrayIndexKey: section order is the only key there is
          <section key={i} className="flex flex-col gap-2">
            {s.title && <h2 className="text-xs text-ink-3">{s.title}</h2>}
            {s.note && <p className="text-xs text-ink-3">{s.note}</p>}
            {s.rows.map((row) => (
              <Row
                key={row.id}
                row={row}
                depth={0}
                open={open}
                onOpen={(id) => setOpen((m) => ({ ...m, [id]: !m[id] }))}
                onRun={run}
                busy={busy}
                actionable={!!onCommand}
              />
            ))}
          </section>
        ))}
        {sections.every((s) => s.rows.length === 0) && (
          <div className="text-xs text-ink-3">{q ? "Nothing matches." : "Nothing to show yet."}</div>
        )}
      </div>
    </PageShell>
  );
}

function Row({
  row,
  depth,
  open,
  onOpen,
  onRun,
  busy,
  actionable,
}: {
  row: PageRow;
  depth: number;
  open: Record<string, boolean>;
  onOpen: (id: string) => void;
  onRun: (command: string) => void;
  busy?: string;
  actionable: boolean;
}) {
  const expandable = (row.rows?.length ?? 0) > 0 || (row.details?.length ?? 0) > 0;
  const isOpen = open[row.id] === true;
  const nested = depth > 0;

  return (
    <article className={nested ? "flex flex-col" : "rounded-lg border border-line bg-paper-2 flex flex-col"}>
      <div className={`flex items-center gap-2 ${nested ? "py-1" : "px-3 py-2"}`}>
        {row.toggle && (
          <Toggle
            value={row.toggle.value}
            disabled={!actionable}
            title={row.toggle.title ?? (row.toggle.value ? row.toggle.off : row.toggle.on)}
            onChange={(v) => onRun(v ? (row.toggle?.on ?? "") : (row.toggle?.off ?? ""))}
          />
        )}
        <button
          type="button"
          disabled={!expandable}
          onClick={() => expandable && onOpen(row.id)}
          className="flex-1 min-w-0 text-left flex items-center gap-2 disabled:cursor-default"
        >
          <span className={`truncate ${nested ? "text-ink-2 text-xs" : "font-medium text-ink"}`}>
            {row.title}
          </span>
          {row.subtitle && <span className="text-xs text-ink-3 truncate">{row.subtitle}</span>}
          <span className="flex-1" />
          {row.badges?.map((b) => (
            <Badge key={b.text} tone={b.tone ?? "muted"}>
              {b.text}
            </Badge>
          ))}
          {expandable && <span className="text-ink-3 text-xs">{isOpen ? "▾" : "▸"}</span>}
        </button>
        {row.actions?.map((a) => (
          <Act key={a.command} action={a} onRun={onRun} busy={busy} disabled={!actionable} />
        ))}
      </div>
      {isOpen && (
        <div
          className={`flex flex-col gap-1.5 text-xs ${
            nested ? "pl-4 pb-1" : "px-3 pb-3 border-t border-line pt-2"
          }`}
        >
          {row.details?.map((d) => (
            <div key={d.label} className="text-ink-3">
              {d.label} <span className="font-mono text-ink-2">{d.value}</span>
            </div>
          ))}
          {row.rows?.map((child) => (
            <Row
              key={child.id}
              row={child}
              depth={depth + 1}
              open={open}
              onOpen={onOpen}
              onRun={onRun}
              busy={busy}
              actionable={actionable}
            />
          ))}
        </div>
      )}
    </article>
  );
}

const TEXT: Record<Tone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  muted: "text-ink-3",
  accent: "text-accent",
};

function Act({
  action,
  onRun,
  busy,
  disabled,
}: {
  action: PageAction;
  onRun: (command: string) => void;
  busy?: string;
  disabled: boolean;
}) {
  const running = busy === action.command;
  return (
    <button
      type="button"
      // The command is always on the hover, so nothing a button does is a surprise.
      title={action.title ?? action.command}
      disabled={disabled || !!busy}
      onClick={() => onRun(action.command)}
      className={`h-6 px-1.5 shrink-0 rounded-md text-xs hover:bg-paper-3 disabled:opacity-40 ${
        TEXT[action.tone ?? "muted"]
      }`}
    >
      {running ? "…" : action.label}
    </button>
  );
}

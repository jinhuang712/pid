import type { PiDiagnostics } from "@shared/diagnostics";
import type { AppendSystemPrompt } from "@shared/ecosystem";
import type { NotifyResult } from "@shared/notifications";
import {
  ACCENTS,
  type Accent,
  CONTENT_WIDTHS,
  DEFAULT_SETTINGS,
  DENSITIES,
  type PidSettings,
  type ThemeMode,
  UI_SCALES,
} from "@shared/settings";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Action, Badge, Eyebrow, Panel, Segmented, Toggle } from "@/ui";
import { bridge } from "../bridge";
import { useSettings } from "../settings";
import { PageShell, PathLink } from "./PageShell";

/**
 * One per PID settings group, plus two pages that show Pi's own state: the appended system
 * prompt file, and which Pi is running where.
 */
type SectionId = keyof PidSettings | "prompt" | "advanced";

const SECTIONS: { id: SectionId; label: string; note: string }[] = [
  {
    id: "appearance",
    label: "Appearance",
    note: "How big PID is, how it reads, and what colour it is. Nothing here changes what Pi does.",
  },
  {
    id: "conversation",
    label: "Conversation",
    note: "Composer and timeline behavior. Queue semantics stay Pi's.",
  },
  { id: "sessions", label: "Sessions", note: "Listing and search preferences for Pi session files." },
  {
    id: "files",
    label: "Files",
    note: "The @ file picker. A worktree binding belongs to the extension that made it, and shows on the session title bar.",
  },
  { id: "notifications", label: "Notifications", note: "Desktop notifications for things that need you." },
  {
    id: "prompt",
    label: "System prompt",
    note: "Rules Pi appends to its system prompt, stored in Pi's own APPEND_SYSTEM.md. Applies to new sessions.",
  },
  {
    id: "advanced",
    label: "Advanced",
    note: "Which Pi runs where. Provider and model configuration stays in Pi.",
  },
];

const DENSITY_LABELS: Record<(typeof DENSITIES)[number], string> = {
  compact: "Compact",
  comfortable: "Comfortable",
  spacious: "Spacious",
};

const WIDTH_LABELS: Record<(typeof CONTENT_WIDTHS)[number], string> = {
  narrow: "Narrow",
  medium: "Medium",
  wide: "Wide",
  full: "Full",
};

/** Fractions of a window the conversation column takes, for the little diagrams on that row. */
const WIDTH_FRACTION: Record<(typeof CONTENT_WIDTHS)[number], number> = {
  narrow: 0.44,
  medium: 0.55,
  wide: 0.72,
  full: 1,
};

const ACCENT_LABELS: Record<Accent, string> = {
  grey: "Warm grey",
  amber: "Amber",
  sage: "Sage",
  clay: "Clay",
  indigo: "Indigo",
};

/** Matches the [data-accent] blocks in styles.css; the dots must show the real colour. */
const ACCENT_SWATCH: Record<Accent, string> = {
  grey: "light-dark(#5a584f, #b9b7ae)",
  amber: "light-dark(#8f6a1c, #c2a46a)",
  sage: "light-dark(#4f7d5b, #7fae88)",
  clay: "light-dark(#9a5b50, #b8746e)",
  indigo: "light-dark(#4d5a86, #9099c0)",
};

/**
 * Fine-grained but restrained: PID's own preferences only. Skills, Extensions,
 * providers, and models are not settings and do not live here.
 */
export function SettingsPage({ initialSection, onClose }: { initialSection?: string; onClose?: () => void }) {
  const { settings, update } = useSettings();
  const [section, setSection] = useState<SectionId>(
    SECTIONS.some((s) => s.id === initialSection) ? (initialSection as SectionId) : "appearance",
  );
  const meta = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const a = settings.appearance;

  return (
    <PageShell
      title="Settings"
      note="PID preferences are stored in PID's own data directory, never in Pi's settings.json."
      onClose={onClose}
    >
      <div className="flex gap-7">
        <nav className="w-44 shrink-0 flex flex-col gap-0.5 sticky top-0">
          {SECTIONS.map((s) => (
            <button
              type="button"
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`h-8 px-3 rounded-md text-left text-sm ${
                s.id === section ? "bg-paper-3 text-ink" : "text-ink-2 hover:bg-paper-3 hover:text-ink"
              }`}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <div className="flex-1 max-w-2xl pb-10">
          <h2 className="text-lg font-medium text-ink">{meta.label}</h2>
          <p className="text-xs text-ink-3 mb-5">{meta.note}</p>

          {section === "appearance" && (
            <div className="flex flex-col gap-5">
              <Preview />

              <Group
                title="Scale"
                note="Interface scale zooms the whole window — text, icons, hairlines and all. ⌘+ and ⌘− step through the same stops."
              >
                <Stacked label="Interface scale">
                  <ScalePicker
                    value={a.interfaceScale}
                    onChange={(interfaceScale) => update("appearance", { interfaceScale })}
                  />
                </Stacked>
                <Row label="Density" hint="Padding and control heights, not size.">
                  <Segmented
                    value={a.density}
                    options={DENSITIES}
                    labels={DENSITY_LABELS}
                    onChange={(density) => update("appearance", { density })}
                  />
                </Row>
                <Row label="Conversation width" hint="How wide a line of a message is allowed to run.">
                  <WidthPicker
                    value={a.contentWidth}
                    onChange={(contentWidth) => update("appearance", { contentWidth })}
                  />
                </Row>
                <Row label="Sidebar width">
                  <Slider
                    value={a.sidebarWidth}
                    min={200}
                    max={460}
                    step={4}
                    format={(v) => `${v} px`}
                    onChange={(sidebarWidth) => update("appearance", { sidebarWidth })}
                  />
                </Row>
              </Group>

              <Group
                title="Text"
                note="Interface text moves the whole UI type scale. Conversation text is set on its own, because reading size and chrome size are different questions."
              >
                <Row label="Interface text" hint="Sidebar, buttons, labels.">
                  <Slider
                    value={a.fontSize}
                    min={11}
                    max={18}
                    step={1}
                    format={(v) => `${v} px`}
                    onChange={(fontSize) => update("appearance", { fontSize })}
                  />
                </Row>
                <Row label="Conversation text" hint="Messages, markdown, headings.">
                  <Slider
                    value={a.messageFontSize}
                    min={12}
                    max={20}
                    step={1}
                    format={(v) => `${v} px`}
                    onChange={(messageFontSize) => update("appearance", { messageFontSize })}
                  />
                </Row>
                <Row label="Code font" hint="Empty: the system monospace stack.">
                  <TextInput
                    value={a.codeFont}
                    placeholder="JetBrains Mono, SF Mono…"
                    onChange={(codeFont) => update("appearance", { codeFont })}
                  />
                </Row>
                <Row label="Code text" hint="Code blocks, diffs and tool output.">
                  <Slider
                    value={a.codeFontSize}
                    min={10}
                    max={18}
                    step={0.5}
                    format={(v) => `${v} px`}
                    onChange={(codeFontSize) => update("appearance", { codeFontSize })}
                  />
                </Row>
              </Group>

              <Group title="Colour" note="One accent carries every emphasis in PID; all of them stay muted.">
                <Stacked label="Theme">
                  <ThemePicker value={a.theme} onChange={(theme) => update("appearance", { theme })} />
                </Stacked>
                <Row label="Accent">
                  <AccentPicker value={a.accent} onChange={(accent) => update("appearance", { accent })} />
                </Row>
              </Group>

              <Group title="Chrome">
                <Row label="Tool cards start collapsed">
                  <Toggle
                    value={a.toolCardsCollapsed}
                    onChange={(toolCardsCollapsed) => update("appearance", { toolCardsCollapsed })}
                  />
                </Row>
                <Row label="Thinking starts collapsed">
                  <Toggle
                    value={a.thinkingCollapsed}
                    onChange={(thinkingCollapsed) => update("appearance", { thinkingCollapsed })}
                  />
                </Row>
                <Row
                  label="Fold steps when a turn finishes"
                  hint="Thinking and tool calls stay open while Pi works, then collapse behind one line."
                >
                  <Toggle
                    value={a.stepsCollapsed}
                    onChange={(stepsCollapsed) => update("appearance", { stepsCollapsed })}
                  />
                </Row>
                <Row label="Reduce motion" hint="Nothing in PID needs a transition to be readable.">
                  <Toggle
                    value={a.reduceMotion}
                    onChange={(reduceMotion) => update("appearance", { reduceMotion })}
                  />
                </Row>
              </Group>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => update("appearance", DEFAULT_SETTINGS.appearance)}
                  className="h-7 px-2.5 rounded-md text-xs text-ink-2 hover:bg-paper-3 hover:text-ink"
                >
                  Reset appearance
                </button>
              </div>
            </div>
          )}

          {section === "conversation" && (
            <Group title="Composer and timeline">
              <Row label="Send with">
                <Segmented
                  value={settings.conversation.enterSends ? "enter" : "mod"}
                  options={["mod", "enter"] as const}
                  labels={{ mod: "⌘⏎", enter: "⏎" }}
                  onChange={(v) => update("conversation", { enterSends: v === "enter" })}
                />
              </Row>
              <Row label="Auto-scroll while streaming">
                <Toggle
                  value={settings.conversation.autoScroll}
                  onChange={(autoScroll) => update("conversation", { autoScroll })}
                />
              </Row>
              <Row label="Expand $reference inspector by default">
                <Toggle
                  value={settings.conversation.referencePreviewOpen}
                  onChange={(referencePreviewOpen) => update("conversation", { referencePreviewOpen })}
                />
              </Row>
            </Group>
          )}

          {section === "sessions" && (
            <Group title="Session list">
              <Row label="Sort sessions by">
                <Segmented
                  value={settings.sessions.sort}
                  options={["modified", "created", "name"] as const}
                  onChange={(sort) => update("sessions", { sort })}
                />
              </Row>
              <Row label="Preview length" hint="Characters of the first message shown in lists.">
                <Slider
                  value={settings.sessions.previewLength}
                  min={40}
                  max={400}
                  step={20}
                  format={(v) => `${v}`}
                  onChange={(previewLength) => update("sessions", { previewLength })}
                />
              </Row>
              <Row
                label="Reopen sessions on launch"
                hint="Restores the sessions that were open when PID last quit."
              >
                <Toggle
                  value={settings.sessions.restoreOnLaunch}
                  onChange={(restoreOnLaunch) => update("sessions", { restoreOnLaunch })}
                />
              </Row>
              <Row
                label="Quitting while a session runs"
                hint="Pi runs inside PID and stops with it. Finish: hide the window and quit when the current turns end."
              >
                <Segmented
                  value={settings.sessions.onQuitWhileRunning}
                  options={["ask", "finish", "quit"] as const}
                  labels={{ ask: "Ask", finish: "Finish first", quit: "Quit now" }}
                  onChange={(onQuitWhileRunning) => update("sessions", { onQuitWhileRunning })}
                />
              </Row>
            </Group>
          )}

          {section === "files" && (
            <Group title="The @ picker">
              <Stacked label="Extra ignore patterns" hint="One glob per line, on top of .gitignore.">
                <TextArea
                  value={settings.files.ignorePatterns.join("\n")}
                  onChange={(v) =>
                    update("files", {
                      ignorePatterns: v
                        .split("\n")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </Stacked>
              <Row label="Show hidden files in @">
                <Toggle
                  value={settings.files.showHidden}
                  onChange={(showHidden) => update("files", { showHidden })}
                />
              </Row>
            </Group>
          )}

          {section === "notifications" && (
            <>
              <Group title="Notify me about">
                <Row label="Run completed">
                  <Toggle
                    value={settings.notifications.runCompleted}
                    onChange={(runCompleted) => update("notifications", { runCompleted })}
                  />
                </Row>
                <Row label="Input or approval required">
                  <Toggle
                    value={settings.notifications.inputRequired}
                    onChange={(inputRequired) => update("notifications", { inputRequired })}
                  />
                </Row>
                <Row label="Errors">
                  <Toggle
                    value={settings.notifications.error}
                    onChange={(error) => update("notifications", { error })}
                  />
                </Row>
                <Row label="Only when PID is not focused">
                  <Toggle
                    value={settings.notifications.onlyWhenUnfocused}
                    onChange={(onlyWhenUnfocused) => update("notifications", { onlyWhenUnfocused })}
                  />
                </Row>
              </Group>
              <NotificationCheck />
            </>
          )}

          {section === "prompt" && <AppendSystemPromptEditor />}

          {section === "advanced" && <Diagnostics />}
        </div>
      </div>
    </PageShell>
  );
}

/**
 * Which Pi is which: the one PID runs in its session workers, and the one on the user's PATH for
 * the terminal. Both share ~/.pi/agent, so drift between them is worth seeing.
 */
function Diagnostics() {
  const [d, setD] = useState<PiDiagnostics>();
  const [err, setErr] = useState<string>();
  useEffect(() => {
    bridge.pi.diagnostics().then(setD, (e: unknown) => setErr(String(e)));
  }, []);
  const compat: Record<PiDiagnostics["compat"], { label: string; tone: "ok" | "warn" | "danger" | "muted" }> =
    {
      tested: { label: "same version", tone: "ok" },
      newer: { label: "your terminal's pi is newer", tone: "warn" },
      older: { label: "your terminal's pi is older", tone: "warn" },
      unknown: d?.terminalPath
        ? { label: "can't compare versions", tone: "warn" }
        : { label: "no pi on PATH", tone: "muted" },
    };
  return (
    <Group
      title="Diagnostics"
      note="PID runs Pi itself, at the version it pins. Your terminal's pi reads and writes the same ~/.pi/agent, so when the two versions drift apart their behaviour can differ."
    >
      {err && <div className="px-3.5 py-2.5 text-xs text-danger">{err}</div>}
      {!d && !err && <div className="px-3.5 py-2.5 text-xs text-ink-3">Probing…</div>}
      {d && (
        <>
          <Row label="Pi runtime in PID">
            <span className="font-mono text-sm text-ink">{d.runtimeVersion}</span>
          </Row>
          <Row label="pi on your PATH" hint={d.terminalPath ? undefined : d.terminalError}>
            {d.terminalPath ? <PathLink path={d.terminalPath} /> : <Badge tone="muted">not installed</Badge>}
          </Row>
          <Row label="Its version" hint={d.terminalPath && d.terminalError ? d.terminalError : undefined}>
            <span className="font-mono text-sm text-ink">{d.terminalVersion ?? "—"}</span>
          </Row>
          <Row label="Compatibility">
            <Badge tone={compat[d.compat].tone}>{compat[d.compat].label}</Badge>
          </Row>
        </>
      )}
    </Group>
  );
}

/* ---- layout primitives: a captioned card with hairline-separated rows ---- */

/**
 * Edits ~/.pi/agent/APPEND_SYSTEM.md in place: Pi's global append-system-prompt file, the same
 * one `pi` picks up in the terminal. Saved a moment after typing stops; an empty box removes the
 * file so Pi is back on its default prompt plus AGENTS.md.
 */
function AppendSystemPromptEditor() {
  const [file, setFile] = useState<AppendSystemPrompt | undefined>();
  const [draft, setDraft] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let alive = true;
    void bridge.eco.appendSystemPrompt().then((f) => {
      if (!alive) return;
      setFile(f);
      setDraft(f.text);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (draft === undefined || file === undefined || draft === file.text) return;
    const t = setTimeout(() => {
      bridge.eco
        .setAppendSystemPrompt(draft)
        .then((f) => {
          setFile(f);
          setError(undefined);
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    }, 400);
    return () => clearTimeout(t);
  }, [draft, file]);

  if (file === undefined || draft === undefined) return null;
  const dirty = draft !== file.text;
  return (
    <Group
      title="Appended to every session"
      note="A trusted project's <folder>/.pi/APPEND_SYSTEM.md replaces this file for sessions in that folder. Replacing the whole prompt is SYSTEM.md, which PID leaves to you."
    >
      <Stacked
        label="Extra rules for Pi"
        hint="Markdown. Pi adds this after its built-in system prompt and before AGENTS.md context."
      >
        <textarea
          value={draft}
          rows={14}
          spellCheck={false}
          placeholder={
            "- Answer in the user's language; keep code, commands, and error text verbatim.\n- Ask before destructive git operations."
          }
          onChange={(e) => setDraft(e.target.value)}
          className="w-full px-2.5 py-2 rounded-md bg-paper border border-line text-xs font-mono leading-[1.6] text-ink outline-none focus:border-accent placeholder:text-ink-3 resize-y"
        />
        <div className="flex items-center gap-3 min-w-0">
          <PathLink path={file.path} />
          <span className="ml-auto shrink-0 text-2xs text-ink-3">
            {error ? (
              <span className="text-danger">{error}</span>
            ) : dirty ? (
              "Saving…"
            ) : file.exists ? (
              "Saved"
            ) : (
              "No file: Pi runs on its default prompt"
            )}
          </span>
        </div>
      </Stacked>
    </Group>
  );
}

/**
 * Proves the notification path rather than describing it.
 *
 * The system decides whether a banner appears, and when it says no it says so silently — nothing
 * shows and nothing explains why, which reads as a feature that never ran. So the answer is
 * printed here, including the one that has a fix attached.
 */
function NotificationCheck() {
  const [result, setResult] = useState<NotifyResult>();
  const [busy, setBusy] = useState(false);
  const send = () => {
    setBusy(true);
    void bridge.notify
      .show({ kind: "runCompleted", title: "PID", body: "This is what a finished run looks like." })
      .then(setResult)
      .finally(() => setBusy(false));
  };
  return (
    <Group
      title="Does it reach the desktop?"
      note="Sent the way a finished run is, so the settings above apply to it too."
    >
      <Row label="Test notification">
        <Action tone="accent" disabled={busy} onClick={send}>
          {busy ? "sending…" : "Send one now"}
        </Action>
      </Row>
      {result && (
        <div className="px-3.5 py-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Badge tone={result.shown && result.confirmed ? "ok" : "warn"}>
              {result.shown
                ? result.confirmed
                  ? "confirmed by the system"
                  : "sent, not confirmed"
                : result.reason}
            </Badge>
          </div>
          <p className="text-xs text-ink-3">
            {EXPLAIN[result.shown ? (result.confirmed ? "confirmed" : "sent") : result.reason]}
          </p>
          {!result.shown && result.reason === "refused" && (
            <div className="flex items-center gap-3">
              <p className="flex-1 min-w-0 text-xs text-danger">{result.error}</p>
              <Action onClick={() => void bridge.notify.openSettings()}>Open System Settings</Action>
            </div>
          )}
        </div>
      )}
    </Group>
  );
}

/** What the answer means, in the terms the user can act on. */
const EXPLAIN: Record<"confirmed" | "sent" | "off" | "focused" | "unsupported" | "refused", string> = {
  confirmed:
    "The system confirmed it. A quiet one is still possible — macOS hides a banner posted while PID is in front.",
  sent: "The system took it without saying whether it appeared, which is as much as macOS reports for a quiet one.",
  off: "Turned off above, so nothing was sent.",
  focused: "Skipped: PID is in front, and “only when PID is not focused” is on.",
  unsupported: "This system does not do desktop notifications.",
  refused: "The system has notifications turned off for PID. Allow them here, then send another.",
};

function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="px-1 pb-1.5">
        <Eyebrow>{title}</Eyebrow>
      </h3>
      <div className="rounded-xl border border-line bg-paper-2 divide-y divide-line overflow-hidden">
        {children}
      </div>
      {note && <p className="px-1 pt-1.5 text-xs text-ink-3">{note}</p>}
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4 px-3.5 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink">{label}</div>
        {hint && <div className="text-xs text-ink-3">{hint}</div>}
      </div>
      <div className="shrink-0 flex justify-end">{children}</div>
    </div>
  );
}

/** A row whose control needs the full width: the scale picker, the theme tiles, a textarea. */
function Stacked({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="px-3.5 py-3 flex flex-col gap-2.5">
      <div>
        <div className="text-sm text-ink">{label}</div>
        {hint && <div className="text-xs text-ink-3">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

/* ---- controls ---- */

/**
 * The scale stops as five miniature windows, the way macOS shows scaled resolutions: the frame
 * stays the same size and the content inside it grows, which is exactly what the setting does.
 */
function ScalePicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-end gap-2">
      {UI_SCALES.map((stop) => {
        const on = Math.abs(stop - value) < 0.001;
        return (
          <button
            type="button"
            key={stop}
            onClick={() => onChange(stop)}
            aria-pressed={on}
            className="flex-1 flex flex-col items-center gap-1.5 group"
            title={`${Math.round(stop * 100)}%`}
          >
            <span
              className={`w-full h-14 rounded-lg border overflow-hidden flex ${
                on ? "border-accent bg-paper-3" : "border-line bg-paper group-hover:border-line-2"
              }`}
            >
              <span className="h-full bg-paper-3 shrink-0" style={{ width: `${22 * stop}%` }} />
              <span
                className="flex-1 min-w-0 flex flex-col justify-center"
                style={{ gap: `${2.5 * stop}px`, padding: `0 ${5 * stop}px` }}
              >
                {[100, 78, 90, 55].map((w, i) => (
                  <span
                    key={w}
                    className={i === 0 ? "bg-ink-2 rounded-full" : "bg-ink-3 rounded-full"}
                    style={{ height: `${2.2 * stop}px`, width: `${w}%`, opacity: i === 0 ? 0.8 : 0.55 }}
                  />
                ))}
              </span>
            </span>
            <span className={`text-2xs tabular-nums ${on ? "text-ink" : "text-ink-3"}`}>
              {Math.round(stop * 100)}%{stop === 1 && <span className="text-ink-3"> · default</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Light / dark / system as three sample windows, so the choice is seen rather than read. */
function ThemePicker({ value, onChange }: { value: ThemeMode; onChange: (v: ThemeMode) => void }) {
  const tiles: { id: ThemeMode; label: string; paper: string; ink: string; muted: string }[] = [
    { id: "light", label: "Light", paper: "#f4f3ef", ink: "#2b2b28", muted: "#dcdbd4" },
    { id: "dark", label: "Dark", paper: "#121211", ink: "#cfcfc9", muted: "#26262a" },
    { id: "system", label: "System", paper: "", ink: "", muted: "" },
  ];
  return (
    <div className="flex gap-3">
      {tiles.map((t) => {
        const on = t.id === value;
        const halves = t.id === "system" ? tiles.slice(0, 2) : [t];
        return (
          <button
            type="button"
            key={t.id}
            onClick={() => onChange(t.id)}
            aria-pressed={on}
            className="flex flex-col items-center gap-1.5"
          >
            <span
              className={`w-24 h-16 rounded-lg border overflow-hidden flex ${
                on ? "border-accent" : "border-line hover:border-line-2"
              }`}
            >
              {halves.map((h) => (
                <span
                  key={h.id}
                  className="h-full flex-1 flex flex-col justify-center gap-1 px-2"
                  style={{ background: h.paper }}
                >
                  <span className="h-1 w-full rounded-full" style={{ background: h.muted }} />
                  <span className="h-1 w-3/5 rounded-full" style={{ background: h.ink, opacity: 0.7 }} />
                  <span className="h-1 w-4/5 rounded-full" style={{ background: h.muted }} />
                </span>
              ))}
            </span>
            <span className={`text-xs ${on ? "text-ink" : "text-ink-3"}`}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function AccentPicker({ value, onChange }: { value: Accent; onChange: (v: Accent) => void }) {
  return (
    <div className="flex items-center gap-2">
      {ACCENTS.map((k) => (
        <button
          type="button"
          key={k}
          onClick={() => onChange(k)}
          aria-pressed={k === value}
          title={ACCENT_LABELS[k]}
          className={`w-6 h-6 rounded-full flex items-center justify-center border ${
            k === value ? "border-accent" : "border-transparent hover:border-line-2"
          }`}
        >
          <span className="w-3.5 h-3.5 rounded-full" style={{ background: ACCENT_SWATCH[k] }} />
        </button>
      ))}
      <span className="ml-1 w-20 text-xs text-ink-3">{ACCENT_LABELS[value]}</span>
    </div>
  );
}

/** Four column widths drawn as the fraction of the window a message line gets. */
function WidthPicker({
  value,
  onChange,
}: {
  value: (typeof CONTENT_WIDTHS)[number];
  onChange: (v: (typeof CONTENT_WIDTHS)[number]) => void;
}) {
  return (
    <div className="flex gap-2">
      {CONTENT_WIDTHS.map((w) => {
        const on = w === value;
        return (
          <button
            type="button"
            key={w}
            onClick={() => onChange(w)}
            aria-pressed={on}
            title={WIDTH_LABELS[w]}
            className={`w-12 h-9 rounded-md border flex items-center justify-center ${
              on ? "border-accent bg-paper-3" : "border-line hover:border-line-2"
            }`}
          >
            <span className="w-full px-1 flex flex-col items-center gap-1">
              {[1, 0.8, 0.92].map((f) => (
                <span
                  key={`${w}-${f}`}
                  className={on ? "bg-ink-2 rounded-full" : "bg-ink-3 rounded-full"}
                  style={{ height: "2px", width: `${WIDTH_FRACTION[w] * f * 100}%`, opacity: 0.7 }}
                />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** A slider with its value beside it: a size is something you feel for, not a number you type. */
function Slider({
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-40 accent-accent"
      />
      <span className="w-12 text-right text-xs text-ink-2 tabular-nums">{format(value)}</span>
    </div>
  );
}

function TextInput({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-56 h-7 px-2 rounded-md bg-paper border border-line text-sm text-ink outline-none focus:border-accent placeholder:text-ink-3"
    />
  );
}

function TextArea({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <textarea
      value={value}
      rows={4}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2 py-1 rounded-md bg-paper border border-line text-xs font-mono text-ink outline-none focus:border-accent"
    />
  );
}

/**
 * A real fragment of a conversation, rendered with the same variables the app uses. Settings apply
 * live everywhere, but the Settings page covers the window while you are in it — this is the piece
 * of PID you are actually adjusting, kept in view.
 */
function Preview() {
  return (
    <section>
      <h3 className="px-1 pb-1.5 text-2xs uppercase tracking-[0.08em] text-ink-3">Preview</h3>
      <div className="rounded-xl border border-line bg-paper flex flex-col gap-2.5 px-4 py-3.5">
        <div className="flex justify-end">
          <div className="msg-text max-w-[78%] rounded-2xl bg-paper-3 px-3.5 py-2.5 leading-[1.6] text-ink">
            Why is the index rebuilt on every keystroke?
          </div>
        </div>
        <div className="prose text-ink">
          <p>
            It isn't — <code>warmSearchIndex</code> runs once, then each write patches the postings in place.
          </p>
        </div>
        <Panel className="flex items-center gap-2 px-2.5 py-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
          <span className="font-mono text-xs text-ink-2 truncate">read src/main/pi/search.ts</span>
          <span className="ml-auto text-2xs text-ink-3 tabular-nums shrink-0">234 lines</span>
        </Panel>
      </div>
    </section>
  );
}

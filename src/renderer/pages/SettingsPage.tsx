import type { PidSettings } from "@shared/settings";
import type { ReactNode } from "react";
import { useState } from "react";
import { useSettings } from "../settings";
import { PageShell } from "./PageShell";

type SectionId = keyof PidSettings;

const SECTIONS: { id: SectionId; label: string; note: string }[] = [
  { id: "appearance", label: "Appearance", note: "How PID looks. Nothing here changes what Pi does." },
  {
    id: "conversation",
    label: "Conversation",
    note: "Composer and timeline behavior. Queue semantics stay Pi's.",
  },
  { id: "sessions", label: "Sessions", note: "Listing and search preferences for Pi session files." },
  {
    id: "files",
    label: "Files & Worktrees",
    note: "The @ file picker and Git worktree defaults. Git remains the source of truth.",
  },
  { id: "notifications", label: "Notifications", note: "Desktop notifications for things that need you." },
  {
    id: "advanced",
    label: "Advanced",
    note: "How PID launches the pi binary. Provider and model configuration stays in Pi.",
  },
];

/**
 * Fine-grained but restrained: PID's own preferences only. Skills, MCP, Extensions,
 * providers, and models are not settings and do not live here.
 */
export function SettingsPage() {
  const { settings, update } = useSettings();
  const [section, setSection] = useState<SectionId>("appearance");
  const meta = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

  return (
    <PageShell
      title="Settings"
      note="PID preferences are stored in PID's own data directory, never in Pi's settings.json."
    >
      <div className="flex gap-6">
        <nav className="w-44 shrink-0 flex flex-col gap-0.5">
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
        <div className="flex-1 max-w-2xl">
          <h2 className="text-lg font-medium text-ink">{meta.label}</h2>
          <p className="text-xs text-ink-3 mb-4">{meta.note}</p>

          {section === "appearance" && (
            <>
              <Row label="Theme" hint="Follows macOS by default.">
                <Segmented
                  value={settings.appearance.theme}
                  options={["system", "light", "dark"]}
                  onChange={(theme) => update("appearance", { theme })}
                />
              </Row>
              <Row label="Font size" hint="Base UI size in pixels.">
                <NumberInput
                  value={settings.appearance.fontSize}
                  min={11}
                  max={18}
                  onChange={(fontSize) => update("appearance", { fontSize })}
                />
              </Row>
              <Row label="Code font" hint="Leave empty for the system monospace stack.">
                <TextInput
                  value={settings.appearance.codeFont}
                  placeholder="JetBrains Mono, SF Mono…"
                  onChange={(codeFont) => update("appearance", { codeFont })}
                />
              </Row>
              <Row label="Density">
                <Segmented
                  value={settings.appearance.density}
                  options={["comfortable", "compact"]}
                  onChange={(density) => update("appearance", { density })}
                />
              </Row>
              <Row label="Tool cards start collapsed">
                <Toggle
                  value={settings.appearance.toolCardsCollapsed}
                  onChange={(toolCardsCollapsed) => update("appearance", { toolCardsCollapsed })}
                />
              </Row>
              <Row label="Thinking starts collapsed">
                <Toggle
                  value={settings.appearance.thinkingCollapsed}
                  onChange={(thinkingCollapsed) => update("appearance", { thinkingCollapsed })}
                />
              </Row>
              <Row label="Sidebar width">
                <NumberInput
                  value={settings.appearance.sidebarWidth}
                  min={200}
                  max={420}
                  step={8}
                  onChange={(sidebarWidth) => update("appearance", { sidebarWidth })}
                />
              </Row>
            </>
          )}

          {section === "conversation" && (
            <>
              <Row label="Enter sends" hint="Off: Enter inserts a newline and ⌘Enter sends.">
                <Toggle
                  value={settings.conversation.enterSends}
                  onChange={(enterSends) => update("conversation", { enterSends })}
                />
              </Row>
              <Row
                label="While Pi is running, send as"
                hint="Steer interrupts; follow-up waits for the current work."
              >
                <Segmented
                  value={settings.conversation.streamingSendMode}
                  options={["steer", "followUp"]}
                  labels={{ steer: "Steer", followUp: "Follow-up" }}
                  onChange={(streamingSendMode) => update("conversation", { streamingSendMode })}
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
            </>
          )}

          {section === "sessions" && (
            <>
              <Row label="Sort sessions by">
                <Segmented
                  value={settings.sessions.sort}
                  options={["modified", "created", "name"]}
                  onChange={(sort) => update("sessions", { sort })}
                />
              </Row>
              <Row label="Default search scope">
                <Segmented
                  value={settings.sessions.searchScope}
                  options={["folder", "all"]}
                  labels={{ folder: "This folder", all: "All folders" }}
                  onChange={(searchScope) => update("sessions", { searchScope })}
                />
              </Row>
              <Row label="Preview length" hint="Characters of the first message shown in lists.">
                <NumberInput
                  value={settings.sessions.previewLength}
                  min={40}
                  max={400}
                  step={20}
                  onChange={(previewLength) => update("sessions", { previewLength })}
                />
              </Row>
              <Row label="Show fork lineage strip">
                <Toggle
                  value={settings.sessions.showForkLineage}
                  onChange={(showForkLineage) => update("sessions", { showForkLineage })}
                />
              </Row>
            </>
          )}

          {section === "files" && (
            <>
              <Row label="Extra ignore patterns for @" hint="One glob per line, on top of .gitignore.">
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
              </Row>
              <Row label="Show hidden files in @">
                <Toggle
                  value={settings.files.showHidden}
                  onChange={(showHidden) => update("files", { showHidden })}
                />
              </Row>
              <Row label="Worktree parent directory" hint="Empty: create worktrees next to the repository.">
                <TextInput
                  value={settings.files.worktreeParentDir}
                  placeholder="~/worktrees"
                  onChange={(worktreeParentDir) => update("files", { worktreeParentDir })}
                />
              </Row>
              <Row label="Confirm before removing a worktree">
                <Toggle
                  value={settings.files.confirmWorktreeRemoval}
                  onChange={(confirmWorktreeRemoval) => update("files", { confirmWorktreeRemoval })}
                />
              </Row>
            </>
          )}

          {section === "notifications" && (
            <>
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
            </>
          )}

          {section === "advanced" && (
            <>
              <Row
                label="pi binary"
                hint="Empty: resolve `pi` from your login shell PATH. Applies to new sessions."
              >
                <TextInput
                  value={settings.advanced.piBinary}
                  placeholder="/opt/homebrew/bin/pi"
                  onChange={(piBinary) => update("advanced", { piBinary })}
                />
              </Row>
              <Row label="Extra pi arguments" hint="Appended to `pi --mode rpc`, e.g. --no-extensions.">
                <TextInput
                  value={settings.advanced.piExtraArgs}
                  placeholder="--thinking high"
                  onChange={(piExtraArgs) => update("advanced", { piExtraArgs })}
                />
              </Row>
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-3 border-b border-line">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink">{label}</div>
        {hint && <div className="text-xs text-ink-3">{hint}</div>}
      </div>
      <div className="shrink-0 w-64 flex justify-end">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={`relative w-9 h-5 rounded-full transition-colors ${value ? "bg-accent" : "bg-paper-4"}`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${value ? "left-4.5" : "left-0.5"}`}
      />
    </button>
  );
}

function Segmented<T extends string>({
  value,
  options,
  labels,
  onChange,
}: {
  value: T;
  options: readonly T[];
  labels?: Partial<Record<T, string>>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-line bg-paper-2 p-0.5">
      {options.map((o) => (
        <button
          type="button"
          key={o}
          onClick={() => onChange(o)}
          className={`h-6 px-2.5 rounded text-xs ${o === value ? "bg-paper-4 text-ink" : "text-ink-2 hover:text-ink"}`}
        >
          {labels?.[o] ?? o}
        </button>
      ))}
    </div>
  );
}

function NumberInput({
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
      }}
      className="w-24 h-7 px-2 rounded-md bg-paper-2 border border-line text-sm text-ink outline-none focus:border-accent tabular-nums"
    />
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
      className="w-full h-7 px-2 rounded-md bg-paper-2 border border-line text-sm text-ink outline-none focus:border-accent placeholder:text-ink-3"
    />
  );
}

function TextArea({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <textarea
      value={value}
      rows={4}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2 py-1 rounded-md bg-paper-2 border border-line text-xs font-mono text-ink outline-none focus:border-accent"
    />
  );
}

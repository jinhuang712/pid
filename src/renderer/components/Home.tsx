import type { SessionSummary } from "@shared/sessions";
import type { ReactNode } from "react";
import { Logo } from "./Logo";

const base = (p: string) => p.split("/").filter(Boolean).pop() ?? p;
const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

/**
 * The entry view: nothing is open yet. Pick a folder, start typing, or resume something recent.
 * The composer below is the same one the conversation uses; sending starts a session in the folder.
 */
export function Home({
  folder,
  folders,
  recent,
  onPickFolder,
  onChooseFolder,
  onOpenSession,
  composer,
}: {
  folder?: string;
  folders: string[];
  recent: SessionSummary[];
  onPickFolder: () => void;
  onChooseFolder: (dir: string) => void;
  onOpenSession: (s: SessionSummary) => void;
  composer: ReactNode;
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
      <div className="flex-1" />
      <div className="flex flex-col items-center gap-7 px-6 pb-2">
        <Logo height={40} className="opacity-90" />
        <div className="text-center flex flex-col gap-3">
          <div className="text-xl text-ink">What are we working on?</div>
          <div className="flex items-center justify-center gap-1.5 text-[12.5px] text-ink-3 flex-wrap">
            <span>in</span>
            {folder ? (
              <FolderChip label={base(folder)} title={folder} active onClick={onPickFolder} />
            ) : (
              <FolderChip label="choose a folder…" onClick={onPickFolder} />
            )}
            {folders
              .filter((f) => f !== folder)
              .slice(0, 4)
              .map((f) => (
                <FolderChip key={f} label={base(f)} title={f} onClick={() => onChooseFolder(f)} />
              ))}
          </div>
        </div>
      </div>
      <div className="shrink-0">{composer}</div>
      <div className="shrink-0 px-6 pb-4">
        <div className="max-w-3xl mx-auto">
          {recent.length > 0 && (
            <>
              <div className="px-3 pb-1 text-[12px] text-ink-3">Recent</div>
              <div className="flex flex-col">
                {recent.map((s) => (
                  <button
                    type="button"
                    key={s.path}
                    onClick={() => onOpenSession(s)}
                    className="h-[30px] px-3 rounded-lg flex items-center gap-3 text-left text-[12.5px] text-ink-2 hover:bg-paper-3 hover:text-ink"
                  >
                    <span className="flex-1 truncate">{s.name || s.firstMessage || "(empty session)"}</span>
                    <span className="text-ink-3 truncate max-w-[30%]">{base(s.cwd)}</span>
                    <span className="text-ink-3 shrink-0 tabular-nums">{ago(s.modified)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <div className="flex-[1.6]" />
    </div>
  );
}

function FolderChip({
  label,
  title,
  active,
  onClick,
}: {
  label: string;
  title?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`h-6 px-2.5 rounded-full text-[12.5px] ${
        active ? "bg-paper-3 text-ink" : "text-ink-3 hover:text-ink hover:bg-paper-3"
      }`}
    >
      {label}
    </button>
  );
}

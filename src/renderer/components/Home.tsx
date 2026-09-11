import type { RepoInfo } from "@shared/git";
import type { SessionSummary } from "@shared/sessions";
import type { ReactNode } from "react";
import { Keys } from "./Key";
import { Logo } from "./Logo";

const base = (p: string) => p.split("/").filter(Boolean).pop() ?? p;
const home = (p: string) => p.replace(/^\/Users\/[^/]+/, "~");
const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

/**
 * The entry view. The folder is the user's decision: an empty field until they pick one,
 * with recent folders offered beneath. The composer wakes up once a folder exists.
 */
export function Home({
  folder,
  repo,
  sessionCount,
  folders,
  recent,
  onPickFolder,
  onChooseFolder,
  onOpenSession,
  composer,
}: {
  folder?: string;
  repo?: RepoInfo | null;
  sessionCount: number;
  folders: string[];
  recent: SessionSummary[];
  onPickFolder: () => void;
  onChooseFolder: (dir: string) => void;
  onOpenSession: (s: SessionSummary) => void;
  composer: ReactNode;
}) {
  const branch = folder
    ? (repo?.worktrees.find((w) => w.path === folder)?.branch ?? repo?.branch)
    : undefined;
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
      <div className="flex-1" />
      <div className="flex flex-col items-center gap-7 px-6">
        <Logo height={36} className="opacity-90" />
        <div className="w-full max-w-3xl flex flex-col gap-2.5">
          <div className="px-1 text-[12px] text-ink-3">Folder</div>
          {folder ? (
            <div className="h-10 px-3.5 rounded-xl bg-paper-2 border border-line flex items-center gap-2 text-ink">
              <FolderGlyph muted={false} />
              <span>{base(folder)}</span>
              <span className="font-mono text-xs text-ink-3 truncate">{home(folder)}</span>
              {branch && <span className="font-mono text-xs text-ink-3">{branch}</span>}
              <span className="flex-1" />
              <span className="text-[12px] text-ink-3">
                {sessionCount} session{sessionCount === 1 ? "" : "s"}
              </span>
              <button type="button" onClick={onPickFolder} className="text-[12px] text-ink-2 hover:text-ink">
                Change
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onPickFolder}
              className="h-10 px-3.5 rounded-xl border border-dashed border-line-2 flex items-center gap-2 text-ink-2 hover:text-ink hover:border-ink-3 text-left"
            >
              <FolderGlyph muted />
              <span className="flex-1">Choose a folder to work in</span>
              <Keys keys={["⌘", "O"]} />
            </button>
          )}
          {folders.filter((f) => f !== folder).length > 0 && (
            <div className="px-1 flex items-center gap-1.5 flex-wrap text-[12px]">
              <span className="text-ink-3 mr-0.5">Recent</span>
              {folders
                .filter((f) => f !== folder)
                .slice(0, 5)
                .map((f) => (
                  <button
                    type="button"
                    key={f}
                    onClick={() => onChooseFolder(f)}
                    title={f}
                    className="h-6 px-2.5 rounded-full bg-paper-2 text-ink-2 hover:text-ink hover:bg-paper-3"
                  >
                    {base(f)}
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>
      <div className={`shrink-0 ${folder ? "" : "opacity-55 pointer-events-none"}`}>{composer}</div>
      {folder && recent.length > 0 && (
        <div className="shrink-0 px-6 pb-4">
          <div className="max-w-3xl mx-auto flex flex-col gap-px">
            <div className="px-3 pb-1 text-[12px] text-ink-3">Recent in {base(folder)}</div>
            {recent.map((s) => (
              <button
                type="button"
                key={s.path}
                onClick={() => onOpenSession(s)}
                className="h-[30px] px-3 rounded-lg flex items-center gap-3 text-left text-[12.5px] text-ink-2 hover:bg-paper-3 hover:text-ink"
              >
                <span className="flex-1 truncate">{s.name || s.firstMessage || "(empty session)"}</span>
                <span className="text-ink-3 shrink-0 tabular-nums">{ago(s.modified)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex-[1.6]" />
    </div>
  );
}

function FolderGlyph({ muted }: { muted: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      className={muted ? "text-ink-3" : "text-ink-2"}
    >
      <title>folder</title>
      <path d="M2 5.5A1.5 1.5 0 0 1 3.5 4H6l1.5 1.5H12.5A1.5 1.5 0 0 1 14 7v4.5A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5z" />
    </svg>
  );
}

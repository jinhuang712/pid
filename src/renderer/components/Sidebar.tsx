import type { SessionSummary } from "@shared/sessions";
import { useSettings } from "../settings";

function base(p: string) {
  return p.split("/").filter(Boolean).pop() ?? p;
}

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function Sidebar({
  folders,
  folder,
  sessions,
  activeSessionPath,
  onOpenFolder,
  onPickFolder,
  onNewSession,
  onOpenSession,
}: {
  folders: string[];
  folder?: string;
  sessions: SessionSummary[];
  activeSessionPath?: string;
  onOpenFolder: (dir: string) => void;
  onPickFolder: () => void;
  onNewSession: () => void;
  onOpenSession: (s: SessionSummary) => void;
}) {
  const { settings } = useSettings();
  return (
    <aside
      style={{ width: settings.appearance.sidebarWidth }}
      className="shrink-0 border-r border-line bg-paper-2 flex flex-col min-h-0"
    >
      <div className="px-2 pt-3 pb-1 flex items-center justify-between">
        <span className="px-1 text-xs text-ink-3">Folders</span>
        <button
          type="button"
          onClick={onPickFolder}
          className="h-6 px-2 rounded-md text-xs text-ink-2 hover:bg-paper-3 hover:text-ink"
        >
          Open…
        </button>
      </div>
      <div className="px-2 max-h-[40%] overflow-y-auto">
        {folders.map((f) => {
          const on = f === folder;
          return (
            <button
              type="button"
              key={f}
              onClick={() => onOpenFolder(f)}
              title={f}
              className={`w-full h-7 px-2 rounded-md flex items-center gap-2 text-left ${on ? "bg-paper-3 text-ink" : "text-ink-2 hover:bg-paper-3 hover:text-ink"}`}
            >
              <span className="truncate">{base(f)}</span>
              <span className="flex-1" />
              <span className="text-xs text-ink-3 truncate max-w-[45%]">
                {f.replace(/^\/Users\/[^/]+/, "~")}
              </span>
            </button>
          );
        })}
        {folders.length === 0 && <div className="px-3 py-2 text-xs text-ink-3">No recent folders</div>}
      </div>
      {folder && (
        <>
          <div className="px-2 pt-3 pb-1 flex items-center justify-between border-t border-line mt-2">
            <span className="px-1 text-xs text-ink-3">Sessions under {base(folder)}</span>
            <button
              type="button"
              onClick={onNewSession}
              className="h-6 px-2 rounded-md text-xs text-ink-2 hover:bg-paper-3 hover:text-ink"
            >
              New
            </button>
          </div>
          <div className="px-2 flex-1 overflow-y-auto pb-3">
            {sessions.map((s) => {
              const on = s.path === activeSessionPath;
              return (
                <button
                  type="button"
                  key={s.path}
                  onClick={() => onOpenSession(s)}
                  title={s.firstMessage}
                  className={`w-full px-2 py-1.5 rounded-md flex flex-col text-left ${on ? "bg-paper-3 text-ink" : "text-ink-2 hover:bg-paper-3 hover:text-ink"}`}
                >
                  <span className="truncate w-full">{s.name || s.firstMessage || "(empty session)"}</span>
                  <span className="text-xs text-ink-3 flex gap-2">
                    <span>{ago(s.modified)}</span>
                    <span>{s.messageCount} msgs</span>
                    {s.parentSessionPath && <span>fork</span>}
                  </span>
                </button>
              );
            })}
            {sessions.length === 0 && <div className="px-3 py-2 text-xs text-ink-3">No sessions yet</div>}
          </div>
        </>
      )}
    </aside>
  );
}

import type { RepoInfo, WorktreeInfo } from "@shared/git";
import { useCallback, useEffect, useState } from "react";
import { bridge } from "../bridge";
import { useSettings } from "../settings";

function base(p: string) {
  return p.split("/").filter(Boolean).pop() ?? p;
}

/**
 * Worktrees of the repository that contains the current folder. Each one is just another
 * Folder to run Pi sessions in; the relationship is used for navigation only.
 */
export function WorktreePanel({
  folder,
  onOpen,
  onStatus,
}: {
  folder: string;
  onOpen: (dir: string) => void;
  onStatus: (msg: string) => void;
}) {
  const { settings } = useSettings();
  const [repo, setRepo] = useState<RepoInfo | null>();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<WorktreeInfo>();

  const refresh = useCallback(() => {
    void bridge.git.repo(folder).then((r) => setRepo(r ?? null));
  }, [folder]);
  useEffect(refresh, [refresh]);

  if (repo === undefined) return null;
  if (repo === null) return null; // not a git repository: nothing to show

  const remove = async (w: WorktreeInfo, force: boolean) => {
    try {
      await bridge.git.removeWorktree({ cwd: folder, path: w.path, force });
      onStatus(`removed worktree ${base(w.path)}`);
      setRemoving(undefined);
      refresh();
    } catch (e) {
      onStatus(String(e));
    }
  };

  const askRemove = async (w: WorktreeInfo) => {
    const safety = await bridge.git.worktreeSafety(folder, w.path);
    if (safety.isMain) return onStatus("The main worktree cannot be removed.");
    if (safety.clean && !settings.files.confirmWorktreeRemoval) return remove(w, false);
    setRemoving(w);
  };

  return (
    <div className="border-t border-line mt-2">
      <div className="px-2 pt-3 pb-1 flex items-center justify-between">
        <span className="px-1 text-xs text-ink-3 truncate" title={repo.root}>
          Worktrees of {base(repo.root)}
        </span>
        <button
          type="button"
          onClick={() => setAdding(!adding)}
          className="h-6 px-2 rounded-md text-xs text-ink-2 hover:bg-paper-3 hover:text-ink"
        >
          {adding ? "Cancel" : "New"}
        </button>
      </div>
      {adding && (
        <AddForm
          repo={repo}
          folder={folder}
          defaultParent={settings.files.worktreeParentDir}
          onDone={(path) => {
            setAdding(false);
            refresh();
            if (path) onOpen(path);
          }}
          onStatus={onStatus}
        />
      )}
      <div className="px-2 pb-2">
        {repo.worktrees.map((w) => {
          const on = w.path === folder || w.isCurrent;
          return (
            <div
              key={w.path}
              className={`group h-7 rounded-md flex items-center ${on ? "bg-paper-3" : "hover:bg-paper-3"}`}
            >
              <button
                type="button"
                onClick={() => onOpen(w.path)}
                title={w.path}
                className={`flex-1 min-w-0 h-full px-2 flex items-center gap-2 text-left ${on ? "text-ink" : "text-ink-2 hover:text-ink"}`}
              >
                <span className="truncate">{base(w.path)}</span>
                <span className="flex-1" />
                <span className="text-xs text-ink-3 font-mono truncate max-w-[45%]">
                  {w.branch ?? w.head.slice(0, 7)}
                </span>
                {w.isMain && <span className="text-xs text-ink-3">primary</span>}
              </button>
              {!w.isMain && (
                <button
                  type="button"
                  onClick={() => void askRemove(w)}
                  title="Remove worktree"
                  className="w-6 h-6 mr-1 rounded text-ink-3 hover:text-danger opacity-0 group-hover:opacity-100"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
      {removing && (
        <RemoveConfirm
          folder={folder}
          worktree={removing}
          onCancel={() => setRemoving(undefined)}
          onConfirm={(force) => void remove(removing, force)}
        />
      )}
    </div>
  );
}

function AddForm({
  repo,
  folder,
  defaultParent,
  onDone,
  onStatus,
}: {
  repo: RepoInfo;
  folder: string;
  defaultParent: string;
  onDone: (path?: string) => void;
  onStatus: (msg: string) => void;
}) {
  const [branch, setBranch] = useState("");
  const [create, setCreate] = useState(true);
  const [busy, setBusy] = useState(false);
  const exists = repo.branches.includes(branch);
  const parent = defaultParent ? defaultParent.replace(/^~/, "") : `${repo.root}/..`;
  const slug = branch.replace(/[^A-Za-z0-9._-]+/g, "-");
  const path = branch ? `${parent}/${base(repo.root)}-${slug}` : "";

  const submit = async () => {
    if (!branch) return;
    setBusy(true);
    try {
      const created = await bridge.git.addWorktree({
        cwd: folder,
        path,
        branch,
        createBranch: create && !exists,
      });
      onStatus(`created worktree ${base(created)}`);
      onDone(created);
    } catch (e) {
      onStatus(String(e));
      setBusy(false);
    }
  };

  return (
    <div className="mx-2 mb-2 p-2 rounded-md border border-line bg-paper text-xs flex flex-col gap-1.5">
      <input
        value={branch}
        onChange={(e) => setBranch(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void submit()}
        placeholder="branch name"
        list="pid-branches"
        className="h-7 px-2 rounded-md bg-paper-2 border border-line outline-none focus:border-accent text-ink placeholder:text-ink-3"
      />
      <datalist id="pid-branches">
        {repo.branches.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
      <label className="flex items-center gap-2 text-ink-2">
        <input
          type="checkbox"
          checked={create && !exists}
          disabled={exists}
          onChange={(e) => setCreate(e.target.checked)}
        />
        {exists ? "check out existing branch" : "create new branch from HEAD"}
      </label>
      {path && (
        <div className="font-mono text-ink-3 truncate" title={path}>
          → {path.replace(/^\/Users\/[^/]+/, "~")}
        </div>
      )}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={!branch || busy}
        className="h-7 rounded-md bg-accent text-white disabled:opacity-40"
      >
        {busy ? "Creating…" : "Create worktree"}
      </button>
    </div>
  );
}

function RemoveConfirm({
  folder,
  worktree,
  onCancel,
  onConfirm,
}: {
  folder: string;
  worktree: WorktreeInfo;
  onCancel: () => void;
  onConfirm: (force: boolean) => void;
}) {
  const [changes, setChanges] = useState<string[]>();
  useEffect(() => {
    void bridge.git.worktreeSafety(folder, worktree.path).then((s) => setChanges(s.changes));
  }, [folder, worktree.path]);
  const dirty = (changes?.length ?? 0) > 0;
  return (
    <div className="mx-2 mb-2 p-2 rounded-md border border-danger/40 bg-danger-soft text-xs flex flex-col gap-1.5">
      <div className="text-ink">
        Remove worktree <span className="font-mono">{base(worktree.path)}</span>?
      </div>
      <div className="text-ink-2">The branch stays; only the checkout directory is removed by git.</div>
      {changes === undefined && <div className="text-ink-3">Checking status…</div>}
      {dirty && (
        <div className="text-danger">
          {changes?.length} uncommitted change{changes?.length === 1 ? "" : "s"} would be lost.
          <pre className="mt-1 max-h-24 overflow-auto font-mono text-ink-2">
            {changes?.slice(0, 8).join("\n")}
          </pre>
        </div>
      )}
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="h-6 px-2 rounded-md border border-line text-ink-2"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onConfirm(dirty)}
          disabled={changes === undefined}
          className="h-6 px-2 rounded-md bg-danger text-white disabled:opacity-40"
        >
          {dirty ? "Remove anyway" : "Remove"}
        </button>
      </div>
    </div>
  );
}

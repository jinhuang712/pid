import type { RepoInfo } from "@shared/git";
import type { PiEvent, RpcExtensionUIRequest, RpcExtensionUIResponse } from "@shared/protocol";
import type { SessionSummary } from "@shared/sessions";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { bridge } from "./bridge";
import { type PiActions, useCompletion } from "./completion";
import { Composer } from "./components/Composer";
import {
  type DialogRequest,
  ExtensionDialog,
  StatusStrip,
  type Toast,
  Toasts,
} from "./components/ExtensionUI";
import { ForkDialog } from "./components/ForkDialog";
import { NavRail, type Page } from "./components/NavRail";
import { QueuePanel } from "./components/QueuePanel";
import { ReferenceChips } from "./components/ReferenceChips";
import { type SessionActions, SessionTree } from "./components/SessionTree";
import { Timeline } from "./components/Timeline";
import { WorktreeAddForm, WorktreeRemoveConfirm } from "./components/WorktreePanel";
import { ExtensionsPage } from "./pages/ExtensionsPage";
import { McpPage } from "./pages/McpPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SkillsPage } from "./pages/SkillsPage";
import { expandReferences, refToken, type SessionReference } from "./session-reference";
import { useSettings } from "./settings";
import { emptyConversation } from "./state/conversation";
import { emptyWorkspace, fromMessages, procForSession, workspaceReducer } from "./state/workspace";

const base = (p: string) => p.split("/").filter(Boolean).pop() ?? p;

export function App() {
  const { settings } = useSettings();
  const [page, setPage] = useState<Page>("sessions");
  const [folder, setFolder] = useState<string>();
  const [folders, setFolders] = useState<string[]>([]);
  const [sessionsByFolder, setSessionsByFolder] = useState<Record<string, SessionSummary[]>>({});
  const [repos, setRepos] = useState<Record<string, RepoInfo | null>>({});
  const [ws, dispatch] = useReducer(workspaceReducer, undefined, emptyWorkspace);
  const [draft, setDraft] = useState("");
  const [refs, setRefs] = useState<SessionReference[]>([]);
  const [status, setStatus] = useState<string>();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [filter, setFilter] = useState("");
  const filterRef = useRef<HTMLInputElement>(null);
  const [forkKey, setForkKey] = useState<string>();
  const [renameKey, setRenameKey] = useState<string>();
  const [worktreeDialog, setWorktreeDialog] = useState<{
    kind: "add" | "remove";
    folder: string;
    path: string;
  }>();

  const active = ws.activeKey ? ws.procs[ws.activeKey] : undefined;
  const key = active?.key;
  const conv = active?.conv ?? emptyConversation();
  const run = <T,>(p: Promise<T>) => p.catch((e) => setStatus(String(e)));

  // ---- folders and their sessions (read-only projections of disk) ----
  const loadFolder = useCallback(async (dir: string) => {
    const [sessions, repo] = await Promise.all([bridge.sessions.list(dir), bridge.git.repo(dir)]);
    setSessionsByFolder((m) => ({ ...m, [dir]: sessions }));
    setRepos((m) => ({ ...m, [dir]: repo ?? null }));
    // worktrees of this repo are folders too; load their sessions so counts are right
    for (const w of repo?.worktrees ?? []) {
      if (w.path !== dir) {
        const s = await bridge.sessions.list(w.path);
        setSessionsByFolder((m) => ({ ...m, [w.path]: s }));
        setRepos((m) => (m[w.path] === undefined ? { ...m, [w.path]: repo ?? null } : m));
      }
    }
  }, []);

  useEffect(() => {
    void bridge.folders.recent().then((fs) => {
      setFolders(fs);
      for (const f of fs) void loadFolder(f);
    });
  }, [loadFolder]);

  const selectFolder = useCallback(
    async (dir: string) => {
      setFolder(dir);
      setFolders(await bridge.folders.remember(dir));
      void loadFolder(dir);
    },
    [loadFolder],
  );

  // ---- notifications ----
  const notify = useCallback(
    (kind: "runCompleted" | "inputRequired" | "error", title: string, body?: string) => {
      const n = settings.notifications;
      if (!n[kind]) return;
      if (n.onlyWhenUnfocused && document.hasFocus()) return;
      try {
        new Notification(title, { body, silent: true });
      } catch {
        // notifications unavailable
      }
    },
    [settings.notifications],
  );
  const toast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  // ---- pi processes ----
  const start = useCallback(
    async (cwd: string, sessionPath?: string) => {
      setStatus(sessionPath ? "resuming session…" : "starting pi…");
      try {
        const handle = await bridge.pi.start({ cwd, sessionPath });
        dispatch({ type: "add", handle });
        for (const ev of handle.earlyEvents)
          if (ev.type === "extension_ui_request" && ev.method === "notify") toast(ev.message, ev.notifyType);
        if (sessionPath) {
          const { messages } = await bridge.pi.command(handle.key, { type: "get_messages" });
          dispatch({ type: "messages", key: handle.key, conv: fromMessages(messages) });
        }
        setStatus(undefined);
        return handle.key;
      } catch (e) {
        setStatus(String(e));
      }
    },
    [toast],
  );

  const refreshState = useCallback(async (k: string) => {
    dispatch({ type: "state", key: k, piState: await bridge.pi.command(k, { type: "get_state" }) });
  }, []);

  useEffect(() => {
    const offEvent = bridge.pi.onEvent(({ key: k, event }) => {
      const proc = ws.procs[k];
      if (!proc) return;
      handleEvent(k, proc.cwd, event);
    });
    const offExit = bridge.pi.onExit(({ key: k, code, stderr }) => {
      dispatch({
        type: "exit",
        key: k,
        message: `pi exited (${code}) ${stderr.split("\n").slice(-2).join(" ")}`,
      });
    });
    return () => {
      offEvent();
      offExit();
    };
  });

  const handleEvent = (k: string, cwd: string, event: PiEvent) => {
    if (event.type === "extension_ui_request") {
      if (event.method === "notify") return toast(event.message, event.notifyType);
      dispatch({ type: "event", key: k, event });
      if (["select", "confirm", "input", "editor"].includes(event.method)) {
        notify("inputRequired", (event as DialogRequest).title, "An extension is waiting for your input");
      }
      return;
    }
    dispatch({ type: "event", key: k, event });
    if (event.type === "thinking_level_changed" || event.type === "session_info_changed")
      void refreshState(k);
    if (event.type === "agent_end") {
      void refreshState(k);
      void loadFolder(cwd);
      if (!event.willRetry) notify("runCompleted", "Pi finished", base(cwd));
    }
    if (
      event.type === "message_end" &&
      event.message.role === "assistant" &&
      event.message.stopReason === "error"
    ) {
      notify("error", "Pi error", event.message.errorMessage);
    }
  };

  // ---- session actions ----
  const openSession = useCallback(
    async (s: SessionSummary) => {
      if (s.path.startsWith("proc:")) return dispatch({ type: "activate", key: s.path.slice(5) });
      const live = procForSession(ws, s.path);
      if (live) return dispatch({ type: "activate", key: live.key });
      if (s.cwd !== folder) await selectFolder(s.cwd);
      await start(s.cwd, s.path);
    },
    [ws, folder, selectFolder, start],
  );

  const ensureLive = useCallback(
    async (s: SessionSummary): Promise<string | undefined> => {
      const live = procForSession(ws, s.path);
      if (live) return live.key;
      return start(s.cwd, s.path);
    },
    [ws, start],
  );

  const referenceSession = useCallback((s: SessionSummary) => {
    const token = refToken(s);
    setDraft((d) => (d.includes(token) ? d : `${d}${d && !d.endsWith(" ") ? " " : ""}${token} `));
    void bridge.sessions
      .read(s.path)
      .then((messages) =>
        setRefs((rs) => [...rs.filter((r) => r.token !== token), { token, session: s, messages }]),
      );
  }, []);

  const sessionActions: SessionActions = {
    openFolder: (dir) => {
      if (dir === "") {
        void bridge.pickFolder().then((d) => {
          if (d) void selectFolder(d);
        });
        return;
      }
      void selectFolder(dir);
    },
    newSession: (dir) => {
      void selectFolder(dir).then(() => start(dir));
    },
    openSession: (s) => void run(openSession(s)),
    fork: (s) =>
      void run(ensureLive(s).then((k) => k && (dispatch({ type: "activate", key: k }), setForkKey(k)))),
    reference: referenceSession,
    rename: (s) => void run(ensureLive(s).then((k) => k && setRenameKey(k))),
    exportHtml: (s) =>
      void run(
        ensureLive(s).then(async (k) => {
          if (!k) return;
          const r = await bridge.pi.command(k, { type: "export_html" });
          toast(`exported ${r.path}`);
        }),
      ),
    closeProcess: (s) => {
      const live = procForSession(ws, s.path);
      if (!live) return;
      void bridge.pi.stop(live.key);
      dispatch({ type: "remove", key: live.key });
    },
    reveal: (path) => void bridge.shell.reveal(path),
    newWorktree: (dir) => setWorktreeDialog({ kind: "add", folder: dir, path: "" }),
    removeWorktree: (dir, path) => setWorktreeDialog({ kind: "remove", folder: dir, path }),
    forgetFolder: (dir) => void bridge.folders.forget(dir).then(setFolders),
  };

  // ---- sending, queue ----
  const send = (raw: string) => {
    if (!key) return;
    const { text, used } = expandReferences(raw, refs);
    if (used.length > 0) setRefs((rs) => rs.filter((r) => !used.includes(r)));
    void run(
      bridge.pi.command(
        key,
        conv.isStreaming ? { type: "follow_up", message: text } : { type: "prompt", message: text },
      ),
    );
  };
  const abort = () => key && void run(bridge.pi.command(key, { type: "abort" }));

  /** Rebuild Pi's queue without one entry, optionally re-adding it in another role. */
  const requeue = async (edit: (q: { steering: string[]; followUp: string[] }) => Promise<void> | void) => {
    if (!key) return;
    const q = await bridge.pi.command(key, { type: "clear_queue" });
    await edit(q);
    for (const m of q.steering) await bridge.pi.command(key, { type: "steer", message: m });
    for (const m of q.followUp) await bridge.pi.command(key, { type: "follow_up", message: m });
  };
  const steerAfterTool = (i: number) =>
    void run(
      requeue(async (q) => {
        const [m] = q.followUp.splice(i, 1);
        if (m && key) await bridge.pi.command(key, { type: "steer", message: m });
      }),
    );
  const steerNow = (i: number) =>
    void run(
      requeue(async (q) => {
        const [m] = q.followUp.splice(i, 1);
        if (!m || !key) return;
        await bridge.pi.command(key, { type: "abort" });
        await bridge.pi.command(key, { type: "prompt", message: m });
      }),
    );
  const removeQueued = (kind: "steer" | "followUp", i: number) =>
    void run(requeue((q) => void (kind === "steer" ? q.steering : q.followUp).splice(i, 1)));

  // ---- fork ----
  const loadForkPoints = useCallback(
    async () => (forkKey ? (await bridge.pi.command(forkKey, { type: "get_fork_messages" })).messages : []),
    [forkKey],
  );
  const doFork = async (entryId: string) => {
    if (!forkKey) return;
    const k = forkKey;
    setForkKey(undefined);
    const r = await bridge.pi.command(k, { type: "fork", entryId });
    if (r.cancelled) return;
    setDraft(r.text);
    const { messages } = await bridge.pi.command(k, { type: "get_messages" });
    dispatch({ type: "messages", key: k, conv: fromMessages(messages) });
    await refreshState(k);
    const cwd = ws.procs[k]?.cwd;
    if (cwd) await loadFolder(cwd);
  };

  // ---- composer completion ----
  const actions: PiActions = {
    compact: () => key && void run(bridge.pi.command(key, { type: "compact" })),
    newSession: () => folder && void start(folder),
    abort,
    clearQueue: () => key && void run(bridge.pi.command(key, { type: "clear_queue" })),
    exportHtml: () =>
      key &&
      void run(bridge.pi.command(key, { type: "export_html" }).then((r) => toast(`exported ${r.path}`))),
    setThinking: (level) =>
      key &&
      void run(
        bridge.pi
          .command(key, { type: "set_thinking_level", level: level as never })
          .then(() => refreshState(key)),
      ),
    fork: () => key && setForkKey(key),
  };
  const allSessions = useMemo(() => Object.values(sessionsByFolder).flat(), [sessionsByFolder]);
  const { complete, pick } = useCompletion({
    key,
    folder,
    sessions: allSessions,
    actions,
    onReference: (ref) => setRefs((rs) => [...rs.filter((r) => r.token !== ref.token), ref]),
  });
  const loadModels = useCallback(
    async () => (key ? (await bridge.pi.command(key, { type: "get_available_models" })).models : []),
    [key],
  );
  const loadLevels = useCallback(
    async () => (key ? (await bridge.pi.command(key, { type: "get_available_thinking_levels" })).levels : []),
    [key],
  );

  // ---- keyboard, menu, dev hooks ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPage("sessions");
        filterRef.current?.focus();
        filterRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    return bridge.onMenuCommand((cmd) => {
      if (cmd.startsWith("page:")) return setPage(cmd.slice(5) as Page);
      if (cmd === "search") return setPage("sessions"), filterRef.current?.focus();
      if (cmd === "open-folder") return sessionActions.openFolder("");
      if (cmd === "new-session") return folder && sessionActions.newSession(folder);
      if (cmd === "fork") return key && setForkKey(key);
      if (cmd === "compact") return actions.compact();
      if (cmd === "abort") return abort();
    });
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    void bridge.appInfo().then(async (info) => {
      if (info.devPage) setPage(info.devPage as Page);
      if (info.devSearch !== undefined) setFilter(info.devSearch);
      if (!info.devOpenFolder) return;
      await selectFolder(info.devOpenFolder);
      const k = await start(info.devOpenFolder, info.devOpenSession);
      if (!k) return;
      if (info.devDraft) setTimeout(() => setDraft(info.devDraft ?? ""), 500);
      if (info.devPrompt) await bridge.pi.command(k, { type: "prompt", message: info.devPrompt });
      if (info.devFollowUp)
        setTimeout(
          () => void bridge.pi.command(k, { type: "follow_up", message: info.devFollowUp ?? "" }),
          1500,
        );
    });
  }, []);

  // ---- derived header ----
  const activeSummary = active?.piState.sessionFile
    ? allSessions.find((s) => s.path === active.piState.sessionFile)
    : undefined;
  const title = active
    ? active.piState.sessionName ||
      activeSummary?.name ||
      activeSummary?.firstMessage ||
      (active.conv.messages.length ? firstUserText(active.conv.messages) : "New session")
    : undefined;
  const branch = active
    ? (repos[active.cwd]?.worktrees.find((w) => w.path === active.cwd)?.branch ?? repos[active.cwd]?.branch)
    : undefined;
  const leftWidth = 40 + settings.appearance.sidebarWidth;

  const respondDialog = (r: RpcExtensionUIResponse) => {
    if (!key) return;
    if (renameKey && r.id === "pid-rename") {
      setRenameKey(undefined);
      if ("value" in r && r.value.trim())
        void run(
          bridge.pi
            .command(key, { type: "set_session_name", name: r.value.trim() })
            .then(() => refreshState(key)),
        );
      return;
    }
    void bridge.pi.uiResponse(key, r);
    dispatch({ type: "dialog-done", key, id: r.id });
  };
  const renameReq: DialogRequest | undefined = renameKey
    ? {
        type: "extension_ui_request",
        id: "pid-rename",
        method: "input",
        title: "Rename session",
        placeholder: title,
      }
    : undefined;
  const dialog = renameReq ?? active?.dialogs[0];

  return (
    <div className="h-full flex flex-col relative">
      {key && dialog && <ExtensionDialog key={dialog.id} req={dialog} onRespond={respondDialog} />}
      {forkKey && (
        <ForkDialog
          title={title ?? ""}
          load={loadForkPoints}
          onFork={(id) => void run(doFork(id))}
          onClose={() => setForkKey(undefined)}
        />
      )}
      {worktreeDialog && (
        <div className="absolute inset-0 z-40 bg-black/30 flex items-start justify-center pt-[16vh]">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 cursor-default"
            onMouseDown={() => setWorktreeDialog(undefined)}
          />
          <dialog
            open
            aria-label="Worktree"
            className="relative m-0 p-2 w-[420px] rounded-xl border border-line bg-paper-2 shadow-2xl text-ink text-sm"
          >
            {worktreeDialog.kind === "add" && repos[worktreeDialog.folder] && (
              <WorktreeAddForm
                repo={repos[worktreeDialog.folder] as RepoInfo}
                folder={worktreeDialog.folder}
                defaultParent={settings.files.worktreeParentDir}
                onDone={(path) => {
                  setWorktreeDialog(undefined);
                  void loadFolder(worktreeDialog.folder);
                  if (path) void selectFolder(path);
                }}
                onStatus={(m) => toast(m)}
              />
            )}
            {worktreeDialog.kind === "remove" && repos[worktreeDialog.folder] && (
              <WorktreeRemoveConfirm
                folder={(repos[worktreeDialog.folder] as RepoInfo).root}
                worktree={{ path: worktreeDialog.path, head: "", isMain: false, isCurrent: false }}
                onCancel={() => setWorktreeDialog(undefined)}
                onConfirm={(force) =>
                  void run(
                    bridge.git
                      .removeWorktree({
                        cwd: (repos[worktreeDialog.folder] as RepoInfo).root,
                        path: worktreeDialog.path,
                        force,
                      })
                      .then(() => {
                        setWorktreeDialog(undefined);
                        toast(`removed worktree ${base(worktreeDialog.path)}`);
                        const root = (repos[worktreeDialog.folder] as RepoInfo).root;
                        if (folder === worktreeDialog.path) void selectFolder(root);
                        void loadFolder(root);
                      }),
                  )
                }
              />
            )}
          </dialog>
        </div>
      )}
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />

      <header className="drag h-11 shrink-0 flex items-center border-b border-line text-ink-2">
        <div style={{ width: leftWidth }} className="shrink-0 pl-[84px] flex items-center">
          <span className="font-medium text-ink">PID</span>
        </div>
        {active && (
          <div className="flex-1 min-w-0 flex items-center gap-2.5 px-4">
            <span className="text-ink truncate">{title}</span>
            <span className="text-line-2">·</span>
            <span className="font-mono text-xs truncate">{active.cwd.replace(/^\/Users\/[^/]+/, "~")}</span>
            {branch && <span className="font-mono text-xs text-ink-3">{branch}</span>}
            {active.exit && <span className="text-xs text-danger truncate">{active.exit}</span>}
          </div>
        )}
      </header>

      <div className="flex-1 flex min-h-0">
        <NavRail page={page} onSelect={setPage} />
        {page === "skills" && (
          <SkillsPage
            folder={folder}
            onUse={(name) => {
              setDraft((d) => `${d}${d && !d.endsWith(" ") ? " " : ""}/${name} `);
              setPage("sessions");
            }}
          />
        )}
        {page === "mcp" && <McpPage folder={folder} />}
        {page === "extensions" && <ExtensionsPage folder={folder} />}
        {page === "settings" && <SettingsPage />}
        <div className={`flex-1 min-w-0 min-h-0 ${page === "sessions" ? "flex" : "hidden"}`}>
          <SessionTree
            folders={folders}
            sessionsByFolder={sessionsByFolder}
            repos={repos}
            ws={ws}
            activeFolder={folder}
            filter={filter}
            filterRef={filterRef}
            onFilter={setFilter}
            actions={sessionActions}
          />
          <main className="flex-1 flex flex-col min-w-0">
            {active ? (
              <Timeline state={conv} />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-ink-3 gap-2 text-sm">
                <div>
                  {folder
                    ? `Pick a session under ${base(folder)} or start a new one.`
                    : "Open a folder to start."}
                </div>
              </div>
            )}
            {status && <div className="px-4 py-1 text-xs text-warn">{status}</div>}
            <QueuePanel
              streaming={conv.isStreaming}
              steering={conv.queue.steering}
              followUp={conv.queue.followUp}
              onSteerAfterTool={steerAfterTool}
              onSteerNow={steerNow}
              onRemove={removeQueued}
            />
            <ReferenceChips refs={refs} onRemove={(t) => setRefs((rs) => rs.filter((r) => r.token !== t))} />
            {active && <StatusStrip statuses={active.statuses} />}
            <Composer
              disabled={!active}
              folder={active?.cwd ?? folder}
              complete={complete}
              pick={pick}
              text={draft}
              setText={setDraft}
              streaming={conv.isStreaming}
              onSend={send}
              onAbort={abort}
              model={
                active?.piState.model
                  ? {
                      provider: active.piState.model.provider,
                      id: active.piState.model.id,
                      contextWindow: active.piState.model.contextWindow,
                    }
                  : undefined
              }
              thinkingLevel={active?.piState.thinkingLevel}
              usage={conv.lastUsage}
              compacting={conv.compacting}
              loadModels={loadModels}
              loadLevels={loadLevels}
              onModel={(m) =>
                key &&
                void run(
                  bridge.pi
                    .command(key, { type: "set_model", provider: m.provider, modelId: m.id })
                    .then(() => refreshState(key)),
                )
              }
              onLevel={(level) =>
                key &&
                void run(
                  bridge.pi.command(key, { type: "set_thinking_level", level }).then(() => refreshState(key)),
                )
              }
            />
          </main>
        </div>
      </div>
    </div>
  );
}

function firstUserText(messages: ReturnType<typeof emptyConversation>["messages"]): string {
  const m = messages.find((x) => x.role === "user");
  if (!m || m.role !== "user") return "New session";
  return typeof m.content === "string"
    ? m.content
    : m.content.map((c) => (c.type === "text" ? c.text : "")).join(" ");
}

export type { RpcExtensionUIRequest };

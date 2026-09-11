import type { RepoInfo } from "@shared/git";
import type { PiEvent, RpcExtensionUIRequest, RpcExtensionUIResponse } from "@shared/protocol";
import type { SessionSummary } from "@shared/sessions";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { bridge } from "./bridge";
import { type PiActions, useCompletion } from "./completion";
import { Composer } from "./components/Composer";
import { type DialogRequest, ExtensionDialog, stripAnsi, type Toast, Toasts } from "./components/ExtensionUI";
import { ForkDialog } from "./components/ForkDialog";
import { Home } from "./components/Home";
import type { Page } from "./components/NavRail";
import { QueuePanel } from "./components/QueuePanel";
import { ReferenceChips } from "./components/ReferenceChips";
import { type SessionActions, SessionTree } from "./components/SessionTree";
import { Timeline } from "./components/Timeline";
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
      // Persist recency for the next launch, but keep this window's order stable: a click must not reshuffle the tree.
      await bridge.folders.remember(dir);
      setFolders((cur) => (cur.includes(dir) ? cur : [...cur, dir]));
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
  /** One toast per distinct message: several pi processes starting in one folder repeat the same notice. */
  const toast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => (t.some((x) => x.message === message) ? t : [...t, { id, message, type }]));
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

  /** From the entry view: start a session in the chosen folder (asking for one if needed), then send. */
  const homeSend = (raw: string) => {
    void run(
      (async () => {
        let dir = folder;
        if (!dir) {
          dir = await bridge.pickFolder();
          if (!dir) return;
          await selectFolder(dir);
        }
        const k = await start(dir);
        if (!k) return;
        const { text, used } = expandReferences(raw, refs);
        if (used.length > 0) setRefs((rs) => rs.filter((r) => !used.includes(r)));
        await bridge.pi.command(k, { type: "prompt", message: text });
      })(),
    );
  };

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
  const recentSessions = useMemo(
    () =>
      folder
        ? [...(sessionsByFolder[folder] ?? [])]
            .sort((x, y) => y.modified.localeCompare(x.modified))
            .slice(0, 5)
        : [],
    [sessionsByFolder, folder],
  );
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
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector("dialog[open]")) return; // dialogs handle their own Escape
      if (page !== "sessions") return setPage("sessions");
      if (ws.activeKey) dispatch({ type: "activate", key: undefined });
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [page, ws.activeKey]);

  useEffect(() => {
    return bridge.onMenuCommand((cmd) => {
      if (cmd.startsWith("page:")) return setPage(cmd.slice(5) as Page);
      if (cmd === "search") return setPage("sessions"), filterRef.current?.focus();
      if (cmd === "open-folder") return sessionActions.openFolder("");
      if (cmd === "new-session") return folder && sessionActions.newSession(folder);
      if (cmd === "fork") return key && setForkKey(key);
      if (cmd === "compact") return actions.compact();
      if (cmd === "abort") return abort();
      if (cmd === "close-session") {
        if (!key) return;
        void bridge.pi.stop(key);
        dispatch({ type: "remove", key });
        setDraft("");
      }
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
  // Pi's auto-generated names (pi-session-<timestamp>_<uuid>) are not titles; the first message is.
  const human = (n?: string) => (n && !/^pi-session-\d{4}-/.test(n) ? n : undefined);
  const title = active
    ? human(active.piState.sessionName) ||
      human(activeSummary?.name) ||
      activeSummary?.firstMessage ||
      (active.conv.messages.length ? firstUserText(active.conv.messages) : undefined)
    : undefined;
  // pi-worktree publishes the session's binding through Pi's widget channel; PID only shows it.
  const worktreeLine = active
    ? stripAnsi(active.widgets["pi-worktree"] ?? active.statuses["pi-worktree"] ?? "")
        .replace(/^\s*🌲\s*/, "")
        .trim() || undefined
    : undefined;
  const branch = active
    ? (repos[active.cwd]?.worktrees.find((w) => w.path === active.cwd)?.branch ?? repos[active.cwd]?.branch)
    : undefined;

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
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />

      <div className="flex-1 flex min-h-0">
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
          page={page}
          onPage={setPage}
        />
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
          <main className="flex-1 flex flex-col min-w-0">
            {/* two tiers: the title owns line one; folder and branch share line two */}
            <div className="drag h-[52px] shrink-0 flex flex-col justify-center gap-0.5 px-7 whitespace-nowrap">
              {active && (
                <>
                  <div className={`truncate leading-tight ${title ? "text-ink" : "text-ink-2"}`}>
                    {title ?? "New session"}
                  </div>
                  <div className="flex items-center gap-2 text-[12px] text-ink-3 leading-tight min-w-0">
                    <span className="inline-flex items-center gap-1 shrink-0" title={active.cwd}>
                      <FolderGlyph />
                      {base(active.cwd)}
                    </span>
                    {worktreeLine ? (
                      <span
                        className="inline-flex items-center gap-1 min-w-0 truncate text-warn"
                        title="pi-worktree binding for this session"
                      >
                        <BranchGlyph />
                        <span className="font-mono truncate">{worktreeLine}</span>
                      </span>
                    ) : (
                      branch && (
                        <span className="inline-flex items-center gap-1 min-w-0 truncate" title={branch}>
                          <BranchGlyph />
                          <span className="font-mono truncate">{branch}</span>
                        </span>
                      )
                    )}
                    {active.exit && <span className="text-danger truncate">{active.exit}</span>}
                  </div>
                </>
              )}
            </div>
            {active ? (
              <>
                <Timeline state={conv} />
                {status && <div className="px-6 py-1 text-xs text-warn">{status}</div>}
                <QueuePanel
                  streaming={conv.isStreaming}
                  steering={conv.queue.steering}
                  followUp={conv.queue.followUp}
                  onSteerAfterTool={steerAfterTool}
                  onSteerNow={steerNow}
                  onRemove={removeQueued}
                />
                <ReferenceChips
                  refs={refs}
                  onRemove={(t) => setRefs((rs) => rs.filter((r) => r.token !== t))}
                />
                <Composer
                  disabled={false}
                  folder={active?.cwd ?? folder}
                  complete={complete}
                  pick={pick}
                  text={draft}
                  setText={setDraft}
                  streaming={conv.isStreaming}
                  onSend={active ? send : homeSend}
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
                      bridge.pi
                        .command(key, { type: "set_thinking_level", level })
                        .then(() => refreshState(key)),
                    )
                  }
                />
              </>
            ) : (
              <Home
                folder={folder}
                folders={folders}
                repo={folder ? repos[folder] : undefined}
                sessionCount={folder ? (sessionsByFolder[folder]?.length ?? 0) : 0}
                recent={recentSessions}
                onPickFolder={() => sessionActions.openFolder("")}
                onChooseFolder={(dir) => void selectFolder(dir)}
                onOpenSession={(s) => void run(openSession(s))}
                composer={
                  <>
                    {status && <div className="px-6 py-1 text-xs text-warn text-center">{status}</div>}
                    <ReferenceChips
                      refs={refs}
                      onRemove={(t) => setRefs((rs) => rs.filter((r) => r.token !== t))}
                    />
                    <Composer
                      disabled={!folder}
                      folder={folder}
                      complete={complete}
                      pick={pick}
                      text={draft}
                      setText={setDraft}
                      streaming={false}
                      onSend={homeSend}
                      onAbort={() => {}}
                      loadModels={loadModels}
                      loadLevels={loadLevels}
                      onModel={() => {}}
                      onLevel={() => {}}
                    />
                  </>
                }
              />
            )}
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

function FolderGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <title>folder</title>
      <path d="M2 5.5A1.5 1.5 0 0 1 3.5 4H6l1.5 1.5H12.5A1.5 1.5 0 0 1 14 7v4.5A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5z" />
    </svg>
  );
}

function BranchGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <title>branch</title>
      <path d="M5 3v4a3 3 0 0 0 3 3h0a3 3 0 0 0 3-3V3" />
      <circle cx="5" cy="13" r="1.5" />
      <circle cx="11" cy="13" r="1.5" />
    </svg>
  );
}

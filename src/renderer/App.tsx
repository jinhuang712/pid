import { only } from "@shared/extension-kinds";
import type { RepoInfo } from "@shared/git";
import { stripPromptBlocks } from "@shared/prompt-blocks";
import type { PiDialogRequest, PiDialogResponse, PiEvent } from "@shared/protocol";
import type { SessionSummary } from "@shared/sessions";
import { worktreeSummary } from "@shared/worktree";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { appendAttachments, parseAttachments, toAttachment } from "./attachments";
import { bridge } from "./bridge";
import { type PiActions, useCompletion } from "./completion";
import { Composer } from "./components/Composer";
import { ExtensionStrip } from "./components/ExtensionStrip";
import { type DialogRequest, ExtensionDialog, type Toast, Toasts } from "./components/ExtensionUI";
import { ForkDialog } from "./components/ForkDialog";
import { Home } from "./components/Home";
import type { Page } from "./components/NavRail";
import { Palette, type PaletteAction } from "./components/Palette";
import { QueuePanel } from "./components/QueuePanel";
import { type SessionActions, SessionTree } from "./components/SessionTree";
import { Timeline } from "./components/Timeline";
import { expandLinks } from "./links";
import { ExtensionPage } from "./pages/ExtensionPage";
import { ExtensionsPage } from "./pages/ExtensionsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SkillsPage } from "./pages/SkillsPage";
import {
  DISPLAY_RE,
  expandReferences,
  refDisplay,
  refMatches,
  refToken,
  TOKEN_RE,
} from "./session-reference";
import { useSettings } from "./settings";
import { HOME_SCOPE, useComposer } from "./state/composer";
import { emptyConversation } from "./state/conversation";
import { emptyWorkspace, fromMessages, procForSession, workspaceReducer } from "./state/workspace";
import { surfaces } from "./surfaces";

const base = (p: string) => p.split("/").filter(Boolean).pop() ?? p;

export function App() {
  const { settings } = useSettings();
  const [page, setPage] = useState<Page>("sessions");
  const [settingsSection, setSettingsSection] = useState<string | undefined>();
  const [folder, setFolder] = useState<string>();
  const [folders, setFolders] = useState<string[]>([]);
  const [sessionsByFolder, setSessionsByFolder] = useState<Record<string, SessionSummary[]>>({});
  const allSessions = useMemo(() => Object.values(sessionsByFolder).flat(), [sessionsByFolder]);
  const [repos, setRepos] = useState<Record<string, RepoInfo | null>>({});
  const [ws, dispatch] = useReducer(workspaceReducer, undefined, emptyWorkspace);
  const [status, setStatus] = useState<string>();
  const [toasts, setToasts] = useState<Toast[]>([]);
  /** Bumped after `/reload` so the `/` menu re-reads pi's command list instead of its cached one. */
  const [commandsEpoch, setCommandsEpoch] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [forkKey, setForkKey] = useState<string>();
  const [renameKey, setRenameKey] = useState<string>();

  const active = ws.activeKey ? ws.procs[ws.activeKey] : undefined;
  const key = active?.key;
  // An exited tab keeps its entry (so the exit reason stays visible) but its pi process is gone:
  // any command sent there is an "unknown pi process" error in the main process.
  const liveKey = active && !active.pending && !active.exit ? active.key : undefined;
  const conv = active?.conv ?? emptyConversation();
  // Draft, $session refs, and attachments live per session; the entry view has its own scope.
  const composer = useComposer(active?.key ?? HOME_SCOPE);
  const { draft, refs, attachments, links, setDraft } = composer;
  const composerRef = useRef(composer);
  composerRef.current = composer;
  const run = <T,>(p: Promise<T>) => p.catch((e) => setStatus(String(e)));

  // ---- folders and their sessions (read-only projections of disk) ----
  const loaded = useRef(new Set<string>());
  const loadFolder = useCallback(async (dir: string) => {
    loaded.current.add(dir);
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
      setFolders((cur) => (cur.includes(dir) ? cur : [...cur, dir]));
      // Persist recency for the next launch, but keep this window's order stable: a click must not reshuffle the tree.
      // Nothing waits on the write: opening a session must not queue behind it.
      void bridge.folders.remember(dir);
      // A folder already in the tree keeps its listing: agent_end reloads it, and re-reading every
      // session file plus git on each click made unfolding stutter.
      if (!loaded.current.has(dir)) void loadFolder(dir);
    },
    [loadFolder],
  );

  // ---- open sessions survive a restart (PID state, derived from live processes; Pi files stay authoritative) ----
  const restored = useRef(false);
  // One string per distinct set of open sessions: streaming deltas change `ws` on every token but not this.
  const openSessionsKey = useMemo(() => {
    const open = Object.values(ws.procs)
      .filter((p) => p.piState.sessionFile && !p.exit && !p.pending)
      .map((p) => `${p.cwd}\u0000${p.piState.sessionFile}`);
    const activePath = ws.activeKey ? ws.procs[ws.activeKey]?.piState.sessionFile : undefined;
    // One entry per file: a renderer reload leaves the previous processes running in main, and
    // restoring their duplicates would double the list on every reload.
    return JSON.stringify({ open: [...new Set(open)], activePath });
  }, [ws]);
  useEffect(() => {
    if (!restored.current) return; // don't overwrite the saved list before it has been restored
    const { open, activePath } = JSON.parse(openSessionsKey) as { open: string[]; activePath?: string };
    void bridge.openSessions.save(
      open.map((s) => {
        const [cwd, path] = s.split("\u0000");
        return { cwd, path };
      }),
      activePath,
    );
  }, [openSessionsKey]);

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
  /** Placeholders the user closed before their process came up; the process is stopped on arrival. */
  const cancelledPending = useRef(new Set<string>());
  /** Latest workspace for callbacks that must not re-create on every streamed token. */
  const wsRef = useRef(ws);
  wsRef.current = ws;
  const start = useCallback(
    async (cwd: string, sessionPath?: string, opts: { background?: boolean } = {}) => {
      // A session has one process. Opening it again (a second click, a duplicated restore list)
      // switches to the one that is already running instead of spawning a twin.
      const live = sessionPath ? procForSession(wsRef.current, sessionPath) : undefined;
      if (live && !live.exit) {
        if (!opts.background) dispatch({ type: "activate", key: live.key });
        return live.pending ? undefined : live.key;
      }
      setStatus(sessionPath ? "resuming session…" : "starting pi…");
      // Resuming: show the file's messages now, while pi spawns and loads its extensions.
      // Reading the file and starting the process run side by side; the snapshot wins the race by seconds.
      let pendingKey: string | undefined;
      if (sessionPath) {
        pendingKey = `pending:${crypto.randomUUID()}`;
        dispatch({ type: "pending", key: pendingKey, cwd, sessionPath, background: opts.background });
        const k = pendingKey;
        void bridge.sessions
          .readBranch(sessionPath)
          .then((messages) => dispatch({ type: "messages", key: k, conv: fromMessages(messages) }))
          .catch(() => {}); // pi's get_messages fills the timeline in a moment anyway
      }
      try {
        const handle = await bridge.pi.start({ cwd, sessionPath });
        if (pendingKey && cancelledPending.current.delete(pendingKey)) {
          void bridge.pi.stop(handle.key);
          setStatus(undefined);
          return undefined;
        }
        dispatch({ type: "add", handle, replaces: pendingKey });
        if (pendingKey) composerRef.current.move(pendingKey, handle.key);
        for (const ev of handle.earlyEvents)
          if (ev.type === "dialog" && ev.method === "notify") toast(ev.message, ev.notifyType);
        if (sessionPath) {
          const { messages } = await bridge.pi.command(handle.key, { type: "get_messages" });
          dispatch({ type: "messages", key: handle.key, conv: fromMessages(messages) });
        }
        setStatus(undefined);
        return handle.key;
      } catch (e) {
        if (pendingKey) dispatch({ type: "remove", key: pendingKey });
        setStatus(String(e));
      }
    },
    [toast],
  );

  const refreshState = useCallback(async (k: string) => {
    try {
      dispatch({ type: "state", key: k, piState: await bridge.pi.command(k, { type: "get_state" }) });
    } catch (e) {
      // Fired off events (`agent_end`, `session_info_changed`) that can land right as the process
      // exits; the exit banner already explains that, so only surface other failures.
      if (!String(e).includes("unknown pi process")) setStatus(String(e));
    }
  }, []);

  // Subscribe once; the handler reads the latest closure through a ref instead of
  // re-registering IPC listeners on every render (there is one render per streamed token).
  const onPiEvent = useRef<(k: string, event: PiEvent) => void>(() => {});
  useEffect(() => {
    const offEvent = bridge.pi.onEvent(({ key: k, event }) => onPiEvent.current(k, event));
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
  }, []);
  onPiEvent.current = (k, event) => {
    const proc = ws.procs[k];
    if (!proc) return;
    handleEvent(k, proc.cwd, event);
  };

  const handleEvent = (k: string, cwd: string, event: PiEvent) => {
    if (event.type === "dialog") {
      if (event.method === "notify") return toast(event.message, event.notifyType);
      dispatch({ type: "event", key: k, event });
      if (["select", "confirm", "input", "editor"].includes(event.method)) {
        notify("inputRequired", (event as DialogRequest).title, "An extension is waiting for your input");
      }
      return;
    }
    // An extension threw. The session keeps running, so this is a toast rather than a banner —
    // but it is never silent: a broken extension used to look like a feature quietly not working.
    if (event.type === "extension_error") {
      return toast(`${base(event.extensionPath)}: ${event.error}`, "error");
    }
    dispatch({ type: "event", key: k, event });
    if (event.type === "thinking_level_changed") void refreshState(k);
    if (event.type === "session_info_changed") {
      // The name is already on disk by the time pi emits this; the sidebar reads
      // its titles from the folder listing, so re-list or the row keeps the old one.
      void refreshState(k);
      void loadFolder(cwd);
    }
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
      // folder bookkeeping (recency, git, session list) runs alongside the start, not ahead of it
      if (s.cwd !== folder) void selectFolder(s.cwd);
      await start(s.cwd, s.path);
    },
    [ws, folder, selectFolder, start],
  );

  const ensureLive = useCallback(
    async (s: SessionSummary): Promise<string | undefined> => {
      const live = procForSession(ws, s.path);
      if (live?.pending) return undefined; // still starting; nothing can be sent yet
      if (live) return live.key;
      return start(s.cwd, s.path);
    },
    [ws, start],
  );

  /** Put the session's $token on the clipboard; pasting it into any composer attaches the reference. */
  const copySessionReference = (s: SessionSummary) => {
    const token = refToken(s);
    void navigator.clipboard.writeText(token).then(
      () => toast(`Copied ${token}`),
      (e) => toast(String(e), "error"),
    );
  };

  // A reference that appears in the draft (pasted, typed, or restored) and names a known session is
  // attached automatically, so it shows in the tray before it is sent. A pasted full $token is
  // rewritten to its display form, "$label(shortid)", the moment the session is recognised.
  const resolving = useRef(new Set<string>());
  useEffect(() => {
    const scope = active?.key ?? HOME_SCOPE;
    const spelled = draft.match(new RegExp(`${TOKEN_RE.source}\\b`, "g")) ?? [];
    const displayed = [...draft.matchAll(new RegExp(DISPLAY_RE.source, "g"))].map((m) => m[1]);
    for (const hit of new Set([...spelled, ...displayed])) {
      const s = allSessions.find((x) => refMatches(x, hit));
      if (!s) continue;
      const token = refToken(s);
      if (hit.startsWith("$")) setDraft((d) => d.split(hit).join(refDisplay(s)));
      const pending = `${scope}:${token}`;
      if (refs.some((r) => r.token === token) || resolving.current.has(pending)) continue;
      resolving.current.add(pending);
      void bridge.sessions
        .read(s.path)
        .then((messages) => composerRef.current.addRef({ token, session: s, messages }))
        .catch((e) => setStatus(String(e)))
        .finally(() => resolving.current.delete(pending));
    }
  }, [draft, refs, allSessions, active?.key, setDraft]);

  /** Dropping a reference from the tray also drops it from the draft, so it does not come back. */
  const removeRef = (token: string) => {
    const ref = refs.find((r) => r.token === token);
    composer.removeRef(token);
    const forms = ref ? [refDisplay(ref.session), token] : [token];
    setDraft((d) => forms.reduce((t, f) => t.split(`${f} `).join("").split(f).join(""), d));
  };

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
      void selectFolder(dir);
      void run(start(dir));
    },
    openSession: (s) => void run(openSession(s)),
    fork: (s) =>
      void run(ensureLive(s).then((k) => k && (dispatch({ type: "activate", key: k }), setForkKey(k)))),
    copyReference: copySessionReference,
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
      if (live.pending) cancelledPending.current.add(live.key);
      else void bridge.pi.stop(live.key);
      dispatch({ type: "remove", key: live.key });
    },
    reveal: (path) => void bridge.shell.reveal(path),
    forgetFolder: (dir) => void bridge.folders.forget(dir).then(setFolders),
  };

  // ---- attachments: absolute paths only, stat'd for the chip, appended to the message as text ----
  const attach = (paths: string[]) => {
    const c = composer;
    void bridge.files.stat(paths).then((infos) => c.addAttachments(infos.map(toAttachment)));
  };
  const removeAttachment = composer.removeAttachment;
  /** Pasted image → temp file → attached by path, the same way the Pi terminal treats a paste. */
  const pasteImage = (file: File) =>
    void run(
      file
        .arrayBuffer()
        .then((buf) => bridge.files.saveClipboardImage(new Uint8Array(buf), file.type))
        .then((path) => attach([path])),
    );

  /**
   * Send the composed message: draft, then `$session` blocks, then the attachment paths. Nothing
   * hidden. Refs and attachments are dropped only after Pi accepted the message; if the send fails
   * the draft comes back too, so a dead process never eats what the user typed or dragged in.
   */
  const deliver = (k: string, raw: string, kind: "prompt" | "follow_up") => {
    const c = composer;
    const unfolded = expandLinks(raw, c.links);
    const { text, used } = expandReferences(unfolded.text, c.refs);
    const message = appendAttachments(text, c.attachments);
    const sent = c.attachments;
    return bridge.pi.command(k, { type: kind, message }).then(
      () => c.consume(used, sent, unfolded.used),
      (e) => {
        c.restoreDraft(raw);
        throw e;
      },
    );
  };

  // ---- sending, queue ----
  const send = (raw: string) => {
    if (!liveKey) return;
    void run(deliver(liveKey, raw, conv.isStreaming ? "follow_up" : "prompt"));
  };

  /** From the palette: a fresh session in the current folder, prompted with the typed text. */
  const askInFolder = (text: string) => {
    if (!folder) return;
    void run(start(folder).then((k) => k && bridge.pi.command(k, { type: "prompt", message: text })));
  };

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
        const c = composer;
        const k = await start(dir);
        if (!k) {
          c.restoreDraft(raw);
          return;
        }
        await deliver(k, raw, "prompt");
      })(),
    );
  };

  /** Rebuild Pi's queue without one entry, optionally re-adding it in another role. */
  /**
   * Best effort: Pi's RPC has no atomic queue edit, so this is clear + re-add, several round trips
   * while the agent may keep running. If re-adding fails part-way, whatever did not make it back
   * lands in the composer draft rather than vanishing.
   */
  const requeue = async (edit: (q: { steering: string[]; followUp: string[] }) => Promise<void> | void) => {
    if (!key) return;
    const c = composer;
    const q = await bridge.pi.command(key, { type: "clear_queue" });
    await edit(q);
    const pending: string[] = [...q.steering, ...q.followUp];
    try {
      for (const m of q.steering) {
        await bridge.pi.command(key, { type: "steer", message: m });
        pending.shift();
      }
      for (const m of q.followUp) {
        await bridge.pi.command(key, { type: "follow_up", message: m });
        pending.shift();
      }
    } catch (e) {
      if (pending.length > 0) c.restoreDraft(pending.join("\n\n"));
      throw new Error(
        `queue edit interrupted; ${pending.length} message(s) moved to the composer. ${String(e)}`,
      );
    }
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
  /**
   * A command PID issues on the user's behalf (reload, abort, …) is acknowledged in the timeline:
   * a live row while it runs (when `running` is given), then one settled row with the outcome.
   * `done` returning undefined leaves no row — for commands pi already reports through its events.
   */
  const command = async <T,>(
    k: string,
    running: string | undefined,
    p: Promise<T>,
    done: (r: T) => string | undefined,
    failed: (reason: string) => string,
  ) => {
    const id = Date.now() + Math.random();
    if (running !== undefined) dispatch({ type: "command-start", key: k, id, text: running });
    try {
      const r = await p;
      dispatch({ type: "command-end", key: k, id, outcome: { ok: true, text: done(r) } });
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      dispatch({ type: "command-end", key: k, id, outcome: { ok: false, text: failed(reason) } });
    }
  };
  /** Runs `/reload` and reports what the session has afterwards, naming commands that are new. */
  const reload = async (k: string) => {
    const names = async () => (await bridge.pi.command(k, { type: "get_commands" })).commands;
    const before = new Set((await names()).map((c) => c.name));
    await bridge.pi.command(k, { type: "reload" });
    const after = await names();
    setCommandsEpoch((n) => n + 1);
    const count = (source: string) => after.filter((c) => c.source === source).length;
    const added = after.filter((c) => !before.has(c.name)).map((c) => c.name.replace(/^skill:/, ""));
    const parts = [
      "reloaded",
      `${count("skill")} skills`,
      `${count("extension")} extension commands`,
      ...(count("prompt") > 0 ? [`${count("prompt")} prompts`] : []),
      ...(added.length > 0 ? [`${added.length} new: ${added.join(", ")}`] : []),
    ];
    return parts.join(" · ");
  };
  const actions: PiActions = {
    compact: () =>
      liveKey &&
      void command(
        liveKey,
        undefined,
        bridge.pi.command(liveKey, { type: "compact" }),
        () => undefined, // compaction_end draws its own row
        (r) => `compact failed · ${r}`,
      ),
    newSession: () => folder && void start(folder),
    abort: () =>
      liveKey &&
      void command(
        liveKey,
        "aborting…",
        bridge.pi.command(liveKey, { type: "abort" }),
        () => "aborted",
        (r) => `abort failed · ${r}`,
      ),
    clearQueue: () =>
      liveKey &&
      void command(
        liveKey,
        undefined,
        bridge.pi.command(liveKey, { type: "clear_queue" }),
        (r) => {
          const n = r.steering.length + r.followUp.length;
          return n === 0 ? "queue was already empty" : `queue cleared · ${n} dropped`;
        },
        (r) => `clear queue failed · ${r}`,
      ),
    exportHtml: () =>
      liveKey &&
      void command(
        liveKey,
        "exporting…",
        bridge.pi.command(liveKey, { type: "export_html" }),
        (r) => `exported ${r.path}`,
        (r) => `export failed · ${r}`,
      ),
    reload: () =>
      liveKey &&
      void command(
        liveKey,
        "reloading…",
        reload(liveKey),
        (t) => t,
        (r) => `reload failed · ${r}`,
      ),
    setThinking: (level) =>
      liveKey &&
      void command(
        liveKey,
        undefined,
        bridge.pi
          .command(liveKey, { type: "set_thinking_level", level: level as never })
          .then(() => refreshState(liveKey)),
        () => `thinking: ${level}`,
        (r) => `thinking: ${level} failed · ${r}`,
      ),
    fork: () => key && setForkKey(key),
  };
  /** The composer's stop button and the palette abort the same way the `#abort` action does. */
  const abort = actions.abort;
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
    key: liveKey,
    folder,
    sessions: allSessions,
    actions,
    commandsEpoch,
    onReference: composer.addRef,
  });
  const loadModels = useCallback(
    async () => (liveKey ? (await bridge.pi.command(liveKey, { type: "get_available_models" })).models : []),
    [liveKey],
  );
  const loadLevels = useCallback(
    async () =>
      liveKey ? (await bridge.pi.command(liveKey, { type: "get_available_thinking_levels" })).levels : [],
    [liveKey],
  );

  // ---- restore last open sessions (sequentially: each pi start is a few seconds) ----
  const restoring = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    // StrictMode mounts twice in dev; a second pass would start every session again and, once
    // saved, double the list on every launch.
    if (restoring.current) return;
    restoring.current = true;
    void (async () => {
      const saved = await bridge.openSessions.get();
      const { activeSession } = saved;
      // A state file written before entries were unique may list one session many times.
      const openSessions = saved.openSessions.filter(
        (o, i, all) => all.findIndex((x) => x.path === o.path) === i,
      );
      if (!settings.sessions.restoreOnLaunch || openSessions.length === 0) {
        restored.current = true;
        return;
      }
      setStatus(`reopening ${openSessions.length} session${openSessions.length === 1 ? "" : "s"}…`);
      // Every reopened session needs its folder row, or the tab has nowhere to appear.
      for (const cwd of new Set(openSessions.map((o) => o.cwd))) {
        setFolders((cur) => (cur.includes(cwd) ? cur : [...cur, cwd]));
        if (!loaded.current.has(cwd)) void loadFolder(cwd);
      }
      let activeKey: string | undefined;
      for (const o of openSessions) {
        const k = await start(o.cwd, o.path, { background: true });
        if (k && o.path === activeSession) activeKey = k;
      }
      if (activeKey) dispatch({ type: "activate", key: activeKey });
      const last = openSessions.at(-1);
      if (last)
        setFolder((cur) => cur ?? openSessions.find((o) => o.path === activeSession)?.cwd ?? last.cwd);
      setStatus(undefined);
      restored.current = true;
    })();
  }, []);

  // ---- keyboard, menu, dev hooks ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
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
      if (cmd === "search") return setPaletteOpen(true);
      if (cmd === "open-folder") return sessionActions.openFolder("");
      if (cmd === "new-session") return folder && sessionActions.newSession(folder);
      if (cmd === "fork") return key && setForkKey(key);
      if (cmd === "compact") return actions.compact();
      if (cmd === "abort") return abort();
      if (cmd === "close-session") closeActive();
    });
  });

  /** Close the active session's process (or cancel it if it is still starting). */
  const closeActive = () => {
    if (!active) return;
    if (active.pending) cancelledPending.current.add(active.key);
    else void bridge.pi.stop(active.key);
    composer.clear(active.key);
    dispatch({ type: "remove", key: active.key });
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    void bridge.appInfo().then(async (info) => {
      if (info.devPage) {
        // PID_PAGE=settings/prompt lands on one Settings section.
        const [pg, sub] = info.devPage.split("/");
        setPage(pg as Page);
        if (sub) setSettingsSection(sub);
      }
      if (info.devSearch !== undefined) setPaletteOpen(true);
      if (!info.devOpenFolder) return;
      await selectFolder(info.devOpenFolder);
      const k = await start(info.devOpenFolder, info.devOpenSession);
      if (!k) return;
      if (info.devDraft) setTimeout(() => composerRef.current.setDraft(info.devDraft ?? ""), 500);
      if (info.devAttach) attach(info.devAttach.split(":").filter(Boolean));
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
  // An extension publishes the binding it made; PID shows it in place of the plain git branch,
  // because "where this work lands" is the more useful answer when the two differ.
  const worktreeLine = worktreeSummary(active ? only(active.published, "binding") : undefined);
  const branch = active
    ? (repos[active.cwd]?.worktrees.find((w) => w.path === active.cwd)?.branch ?? repos[active.cwd]?.branch)
    : undefined;

  const respondDialog = (r: PiDialogResponse) => {
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
        type: "dialog",
        id: "pid-rename",
        method: "input",
        title: "Rename session",
        placeholder: title,
      }
    : undefined;
  const dialog = renameReq ?? active?.dialogs[0];

  // Every page beyond PID's own was described by an extension, and is here only while one is
  // describing it. PID knows none of their names.
  const pages = useMemo(() => surfaces(ws), [ws]);
  useEffect(() => {
    // Closing the last session that filled a page takes the page with it.
    setPage((cur) =>
      cur === "sessions" || cur === "settings" || pages.some((s) => s.id === cur) ? cur : "sessions",
    );
  }, [pages]);

  const paletteActions: PaletteAction[] = [
    {
      id: "new",
      label: "New session",
      hint: ["⌘", "N"],
      run: () => folder && sessionActions.newSession(folder),
    },
    { id: "open", label: "Open folder…", hint: ["⌘", "O"], run: () => sessionActions.openFolder("") },
    {
      id: "close",
      label: "Close session",
      hint: ["⌘", "W"],
      run: closeActive,
    },
    { id: "fork", label: "Fork from…", hint: ["⌘", "⇧", "F"], run: () => key && setForkKey(key) },
    { id: "compact", label: "Compact context", run: () => actions.compact() },
    ...pages.map((s) => ({ id: s.id, label: s.label, run: () => setPage(s.id) })),
    { id: "settings", label: "Settings", hint: ["⌘", ","], run: () => setPage("settings") },
  ];

  return (
    <div className="h-full flex flex-col relative">
      {key && dialog && <ExtensionDialog key={dialog.id} req={dialog} onRespond={respondDialog} />}
      {paletteOpen && (
        <Palette
          folder={folder}
          actions={paletteActions}
          onClose={() => setPaletteOpen(false)}
          onOpenFolder={(dir) => void selectFolder(dir)}
          onOpenSession={(s) => void run(openSession(s))}
          onReference={copySessionReference}
          onAsk={askInFolder}
        />
      )}
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
          ws={ws}
          activeFolder={folder}
          onSearch={() => setPaletteOpen(true)}
          actions={sessionActions}
          page={page}
          pages={pages}
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
        {pages.map(
          (s) =>
            s.page &&
            page === s.id && (
              <ExtensionPage
                key={s.id}
                page={s.page}
                onCommand={
                  s.sessionKey
                    ? (command) =>
                        bridge.pi.command(s.sessionKey as string, { type: "prompt", message: command })
                    : undefined
                }
              />
            ),
        )}
        {page === "extensions" && <ExtensionsPage folder={folder} />}
        {page === "settings" && <SettingsPage initialSection={settingsSection} />}
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
                        title="Worktree binding for this session"
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
                {/* keyed per session file (stable across the pending → live handover): scroll position
                    and the rendered window start fresh for each session */}
                <Timeline key={active.piState.sessionFile ?? key} state={conv} cwd={active.cwd} />
                {status && <div className="px-6 py-1 text-xs text-warn">{status}</div>}
                <QueuePanel
                  streaming={conv.isStreaming}
                  steering={conv.queue.steering}
                  followUp={conv.queue.followUp}
                  onSteerAfterTool={steerAfterTool}
                  onSteerNow={steerNow}
                  onRemove={removeQueued}
                />
                <ExtensionStrip widgets={active.widgets} statuses={active.statuses} />
                <Composer
                  blocked={
                    active.pending
                      ? "Starting Pi… you can type; sending waits until it is ready."
                      : active.exit
                        ? "Pi exited. Reopen the session to continue."
                        : undefined
                  }
                  folder={active?.cwd ?? folder}
                  complete={complete}
                  pick={pick}
                  text={draft}
                  setText={setDraft}
                  streaming={conv.isStreaming}
                  onSend={active ? send : homeSend}
                  onAbort={abort}
                  attachments={attachments}
                  onAttach={attach}
                  onRemoveAttachment={removeAttachment}
                  onPasteImage={pasteImage}
                  refs={refs}
                  onRemoveRef={removeRef}
                  links={links}
                  onAddLinks={composer.addLinks}
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
                  providerUsage={only(active.published, "usage")}
                  sessionUsage={conv.sessionUsage}
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
                      attachments={attachments}
                      onAttach={attach}
                      onRemoveAttachment={removeAttachment}
                      onPasteImage={pasteImage}
                      refs={refs}
                      onRemoveRef={removeRef}
                      links={links}
                      onAddLinks={composer.addLinks}
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
  const raw =
    typeof m.content === "string"
      ? m.content
      : m.content.map((c) => (c.type === "text" ? c.text : "")).join(" ");
  // the words only: attachment paths and $session blocks are shown as chips, not as a title
  return stripPromptBlocks(raw) || (parseAttachments(raw).attachments[0]?.name ?? "New session");
}

export type { PiDialogRequest };

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

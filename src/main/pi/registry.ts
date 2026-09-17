import { randomUUID } from "node:crypto";
import type {
  PiCommand,
  PiDialogResponse,
  PiEvent,
  PiEventEnvelope,
  PiExitEnvelope,
  PiSessionState,
  StartPiOptions,
} from "@shared/protocol";
import type { BrowserWindow } from "electron";
import { logLine } from "../log";
import { warmShellEnv } from "../shell-env";
import { SessionProcess } from "./session-process";

/** How long a fresh worker gets to build its runtime before we call the start failed. */
export const STARTUP_TIMEOUT_MS = 15_000;

/** The backstop for a worker that will not go even after `kill` SIGTERMs it. */
export const STOP_DEADLINE_MS = 3000;

/** Live session workers owned by this window. Nothing here is persisted. */
export class PiRegistry {
  private procs = new Map<string, SessionProcess>();

  constructor(private win: () => BrowserWindow | undefined) {}

  /**
   * One worker per session file.
   *
   * A renderer reload (⌘R) forgets the keys it was holding, so the window asks for the same
   * session again; adopting the worker that already owns the file is what keeps a single writer
   * on it. Pi's session format assumes that — it takes no lock, and two runtimes appending to one
   * file turn it into sibling branches nothing resumes. A session with no file yet always gets a
   * worker of its own.
   */
  async start(opts: StartPiOptions) {
    const existing = opts.sessionPath ? this.liveFor(opts.sessionPath) : undefined;
    if (existing) {
      const { key, proc } = existing;
      try {
        const state = await proc.started;
        // Adoption is not a session start, so no extension republishes: hand the window what the
        // session is already showing, in the same events the reducer replays for a fresh start. A
        // worker that will not answer leaves the window with nothing to replay, which is what it
        // would have had anyway.
        const ui = await proc.request({ type: "get_ui_state" }).catch(() => undefined);
        return { key, cwd: proc.cwd, state, earlyEvents: ui ? ui.events : [] };
      } catch (err) {
        this.discard(key, proc);
        throw new Error(this.why(err, proc));
      }
    }
    const key = randomUUID();
    let early: PiEvent[] | undefined = [];
    // What the log calls this session: the file it resumes, or the folder a new one lands in.
    const whom = opts.sessionPath ?? opts.cwd;
    /** Set once the runtime is up: before that, an exit is a start failure, not a session ending. */
    let ready = false;
    await warmShellEnv(); // never probe the login shell synchronously on the IPC thread
    const proc = new SessionProcess({
      cwd: opts.cwd,
      sessionPath: opts.sessionPath,
      onEvent: (event) => {
        if (early) early.push(event);
        else this.send("pi:event", { key, event } satisfies PiEventEnvelope);
      },
      onExit: (code, stderr) => {
        this.procs.delete(key);
        logLine(
          ready ? "exit" : "start",
          `${whom} ${code === null ? "stopped" : `exited (${code})`}${tail(stderr)}`,
        );
        this.send("pi:exit", { key, code, signal: null, stderr } satisfies PiExitEnvelope);
      },
    });
    this.procs.set(key, proc);
    let state: PiSessionState;
    try {
      state = await withTimeout(proc.started, STARTUP_TIMEOUT_MS);
      ready = true;
    } catch (err) {
      // A failed runtime build, an early crash, or a worker that never answered: leave nothing
      // running and surface why.
      this.discard(key, proc);
      throw new Error(this.why(err, proc));
    }
    const earlyEvents = early;
    early = undefined;
    return { key, cwd: opts.cwd, state, earlyEvents };
  }

  async command(key: string, command: PiCommand) {
    return this.get(key).request(command);
  }

  respondUI(key: string, response: PiDialogResponse) {
    this.get(key).respondUI(response);
  }

  stop(key: string) {
    this.procs.get(key)?.kill();
    this.procs.delete(key);
  }

  busyCount(): number {
    return [...this.procs.values()].filter((p) => p.busy).length;
  }

  /** Resolves once no process has a turn in flight (or all exited). Polls; turns end via events we already receive. */
  whenAllIdle(): Promise<void> {
    return new Promise((resolve) => {
      const tick = () => (this.busyCount() === 0 ? resolve() : setTimeout(tick, 500));
      tick();
    });
  }

  /**
   * Stop every worker, and let Pi's runtime dispose before its process is taken down — that is
   * where an extension's `session_shutdown` runs. `kill` SIGTERMs whatever does not answer; the
   * deadline is only for a process that will not go at all, which must not hold up the quit.
   */
  async stopAll(): Promise<void> {
    const procs = [...this.procs.values()];
    this.procs.clear();
    for (const p of procs) p.kill();
    await Promise.race([
      Promise.all(procs.map((p) => p.done)),
      new Promise<void>((resolve) => {
        setTimeout(resolve, STOP_DEADLINE_MS).unref();
      }),
    ]);
  }

  private get(key: string): SessionProcess {
    const p = this.procs.get(key);
    if (!p) throw new Error(`unknown session worker ${key}`);
    return p;
  }

  /** The live worker that already owns this session file, if any. */
  private liveFor(sessionPath: string): { key: string; proc: SessionProcess } | undefined {
    for (const [key, proc] of this.procs) {
      if (proc.owns(sessionPath) && !proc.exited) return { key, proc };
    }
    return undefined;
  }

  /** Forget a worker and make sure nothing is left running under it. */
  private discard(key: string, proc: SessionProcess) {
    this.procs.delete(key);
    proc.kill();
  }

  /** Why a start failed, including the worker's own output when it left any. */
  private why(err: unknown, proc: SessionProcess): string {
    const detail = proc.stderrTail.trim();
    return detail ? `${(err as Error).message}\n${detail}` : (err as Error).message;
  }

  private send(channel: string, payload: unknown) {
    const w = this.win();
    if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

/** The one line of worker output worth keeping beside "it stopped": the rest is its own problem. */
function tail(stderr: string): string {
  const line = stderr.trim().split("\n").filter(Boolean).at(-1);
  if (!line) return "";
  return ` · ${line.length > 300 ? `${line.slice(0, 300)}…` : line}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`the session worker did not start within ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

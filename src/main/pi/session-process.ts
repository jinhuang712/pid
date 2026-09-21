import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { PiCommand, PiDialogResponse, PiEvent, PiSessionState, ResponseDataOf } from "@shared/protocol";
import { type UtilityProcess, utilityProcess } from "electron";
import { shellEnv } from "../shell-env";
import type { MainToWorker, WorkerStartOptions, WorkerToMain } from "./worker-protocol";

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

/**
 * Does this event leave a turn in flight?
 *
 * `agent_end` also fires between retry attempts, with `willRetry` set; treating that as the end of
 * the turn let a quit land inside the backoff and drop the retry. `agent_settled` is the one that
 * means the turn is over for good.
 */
export function turnInFlight(event: PiEvent, busy: boolean): boolean {
  if (event.type === "agent_start") return true;
  if (event.type === "agent_end") return Boolean(event.willRetry);
  if (event.type === "agent_settled") return false;
  return busy;
}

export interface SessionProcessOptions extends WorkerStartOptions {
  onEvent: (event: PiEvent) => void;
  onExit: (code: number | null, stderr: string) => void;
}

/** How long Pi's runtime gets to dispose before the worker is killed anyway. */
const DISPOSE_GRACE_MS = 1500;

/**
 * One session worker, seen from the main process.
 *
 * The same handle `pi --mode rpc` had: commands in, events out, one process per session. The
 * agent runs in the worker on Pi's own AgentSessionRuntime, so nothing here parses a protocol —
 * messages cross as structured clones.
 */
export class SessionProcess {
  readonly cwd: string;
  /** The file this worker was asked to resume, when it was resumed by path. */
  private readonly sessionPath?: string;
  /** The file Pi is writing: the one resumed, or the one it created for a fresh session. */
  private ownFile?: string;
  /** Resolves once the process is gone, however it went. This is what a quit waits on. */
  readonly done: Promise<void>;
  private doneResolve!: () => void;
  /** The fallback kill, armed by `kill` and cleared as soon as the process goes. */
  private stopper?: NodeJS.Timeout;
  /** Set while a stop is in flight, so asking twice does not dispose twice. */
  private stopping = false;
  private child: UtilityProcess;
  private stderr = "";
  private pending = new Map<string, Pending>();
  private closed = false;
  /** True between agent_start and agent_end: a turn is in flight. */
  busy = false;
  /** Resolves with the session state once the runtime is up, or rejects with why it is not. */
  readonly started: Promise<PiSessionState>;

  constructor(private opts: SessionProcessOptions) {
    this.cwd = opts.cwd;
    this.sessionPath = opts.sessionPath;
    this.child = utilityProcess.fork(join(__dirname, "session-worker.js"), [], {
      serviceName: "pid-session",
      stdio: "pipe",
      // Pi's bash tool and anything an extension spawns inherit the worker's environment, so it has to be the
      // login shell's: a GUI app's PATH is not the one the user's tools live on.
      env: shellEnv(),
    });

    this.started = new Promise<PiSessionState>((resolve, reject) => {
      this.startResolve = resolve;
      this.startReject = reject;
    });
    this.done = new Promise<void>((resolve) => {
      this.doneResolve = resolve;
    });

    this.child.stderr?.setEncoding("utf8");
    this.child.stderr?.on("data", (chunk: string) => this.collectStderr(chunk));
    // An extension that writes to stdout would be protocol noise for a
    // `pi --mode rpc` child; here they are just logs, so they join the same tail.
    this.child.stdout?.setEncoding("utf8");
    this.child.stdout?.on("data", (chunk: string) => this.collectStderr(chunk));

    this.child.on("message", (msg: WorkerToMain) => this.onMessage(msg));
    this.child.on("exit", (code) => this.finish(code, `the session worker exited (${code})`));

    this.post({
      kind: "start",
      options: { cwd: opts.cwd, sessionPath: opts.sessionPath },
    });
  }

  private startResolve!: (state: PiSessionState) => void;
  private startReject!: (err: Error) => void;

  private collectStderr(chunk: string) {
    this.stderr = (this.stderr + chunk).slice(-8000);
  }

  private post(message: MainToWorker) {
    if (this.closed) return;
    try {
      this.child.postMessage(message);
    } catch {
      // The process can be gone before its exit event reaches us — `closed` flips on that event —
      // and then there is nowhere for this to go. Say so in the tail; the exit path reports the
      // state a beat later.
      this.collectStderr(`could not post ${message.kind}: the worker is gone\n`);
    }
  }

  /** Idempotent terminal transition: reject every pending request and notify the owner once. */
  private finish(code: number | null, reason: string) {
    if (this.closed) return;
    this.closed = true;
    this.busy = false;
    if (this.stopper) clearTimeout(this.stopper);
    this.stopper = undefined;
    this.startReject(new Error(reason));
    for (const p of this.pending.values()) p.reject(new Error(reason));
    this.pending.clear();
    this.doneResolve();
    this.opts.onExit(code, this.stderr);
  }

  private onMessage(msg: WorkerToMain) {
    switch (msg.kind) {
      case "started":
        this.ownFile = msg.state.sessionFile;
        for (const d of msg.diagnostics) this.collectStderr(`${d}\n`);
        this.startResolve(msg.state);
        return;
      case "start-failed":
        this.startReject(new Error(msg.message));
        return;
      case "response": {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        const r = msg.response;
        if (r.success) p.resolve("data" in r ? r.data : undefined);
        else p.reject(new Error(r.error));
        return;
      }
      case "event": {
        const event = msg.event;
        this.busy = turnInFlight(event, this.busy);
        this.opts.onEvent(event);
        return;
      }
      case "log":
        this.collectStderr(`${msg.text}\n`);
        return;
      case "disposed":
        // The runtime is down and has told its extensions; the process itself is done.
        this.child.kill();
        return;
    }
  }

  /**
   * Send a command and wait for its response. `timeoutMs` is only for calls PID makes on its own
   * behalf: a prompt the worker did receive must never be timed out and retried, that would
   * duplicate the turn.
   */
  request<C extends PiCommand>(command: C, timeoutMs?: number): Promise<ResponseDataOf<C["type"]>> {
    if (this.closed) return Promise.reject(new Error("the session worker is not running"));
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      let timer: NodeJS.Timeout | undefined;
      const settle = (fn: (v: never) => void) => (v: never) => {
        if (timer) clearTimeout(timer);
        this.pending.delete(id);
        fn(v);
      };
      this.pending.set(id, {
        resolve: settle(resolve as (v: never) => void) as (v: unknown) => void,
        reject: settle(reject as (v: never) => void) as (e: Error) => void,
      });
      if (timeoutMs) {
        timer = setTimeout(() => {
          this.pending
            .get(id)
            ?.reject(new Error(`the session worker did not answer ${command.type} within ${timeoutMs}ms`));
        }, timeoutMs);
      }
      this.post({ kind: "command", id, command });
    });
  }

  /**
   * Does this worker own that session file?
   *
   * A session given a path is known before it starts; one Pi created the file for is only known
   * once it has reported `started`, so both are asked. Missing the second is how a reload forked a
   * second writer onto a file this worker was already appending to.
   */
  owns(file: string): boolean {
    return this.sessionPath === file || this.ownFile === file;
  }

  respondUI(response: PiDialogResponse) {
    this.post({ kind: "ui-response", response });
  }

  get stderrTail(): string {
    return this.stderr;
  }

  get exited(): boolean {
    return this.closed;
  }

  /**
   * Stop the worker, giving Pi's runtime the chance to shut down first.
   *
   * `runtime.dispose()` is what emits `session_shutdown` — the one place an extension closes what
   * it opened, killable bash children among them — and SIGTERM alone skips it. So the worker is
   * asked, and killed if it does not answer.
   */
  kill() {
    if (this.closed || this.stopping) return;
    this.stopping = true;
    this.post({ kind: "dispose" });
    this.stopper = setTimeout(() => this.child.kill(), DISPOSE_GRACE_MS);
    this.stopper.unref?.();
  }
}

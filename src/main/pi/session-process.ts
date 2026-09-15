import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type {
  PiCommand,
  PiEvent,
  ResponseDataOf,
  RpcExtensionUIResponse,
  RpcSessionState,
} from "@shared/protocol";
import { type UtilityProcess, utilityProcess } from "electron";
import { shellEnv } from "../shell-env";
import type { MainToWorker, WorkerStartOptions, WorkerToMain } from "./worker-protocol";

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

export interface SessionProcessOptions extends WorkerStartOptions {
  onEvent: (event: PiEvent) => void;
  onExit: (code: number | null, stderr: string) => void;
}

/**
 * One session worker, seen from the main process.
 *
 * The same handle `pi --mode rpc` had: commands in, events out, one process per session. The
 * agent runs in the worker on Pi's own AgentSessionRuntime, so nothing here parses a protocol —
 * messages cross as structured clones.
 */
export class SessionProcess {
  readonly cwd: string;
  private child: UtilityProcess;
  private stderr = "";
  private pending = new Map<string, Pending>();
  private closed = false;
  /** True between agent_start and agent_end: a turn is in flight. */
  busy = false;
  /** Resolves with the session state once the runtime is up, or rejects with why it is not. */
  readonly started: Promise<RpcSessionState>;

  constructor(private opts: SessionProcessOptions) {
    this.cwd = opts.cwd;
    this.child = utilityProcess.fork(join(__dirname, "session-worker.js"), [], {
      serviceName: "pid-session",
      stdio: "pipe",
      // Pi's bash tool and its MCP servers inherit the worker's environment, so it has to be the
      // login shell's: a GUI app's PATH is not the one the user's tools live on.
      env: shellEnv(),
    });

    this.started = new Promise<RpcSessionState>((resolve, reject) => {
      this.startResolve = resolve;
      this.startReject = reject;
    });

    this.child.stderr?.setEncoding("utf8");
    this.child.stderr?.on("data", (chunk: string) => this.collectStderr(chunk));
    // Extensions that write to stdout (MCP status lines, for one) would be protocol noise for a
    // `pi --mode rpc` child; here they are just logs, so they join the same tail.
    this.child.stdout?.setEncoding("utf8");
    this.child.stdout?.on("data", (chunk: string) => this.collectStderr(chunk));

    this.child.on("message", (msg: WorkerToMain) => this.onMessage(msg));
    this.child.on("exit", (code) => this.finish(code, `the session worker exited (${code})`));

    this.post({
      kind: "start",
      options: { cwd: opts.cwd, sessionPath: opts.sessionPath, extensionPaths: opts.extensionPaths },
    });
  }

  private startResolve!: (state: RpcSessionState) => void;
  private startReject!: (err: Error) => void;

  private collectStderr(chunk: string) {
    this.stderr = (this.stderr + chunk).slice(-8000);
  }

  private post(message: MainToWorker) {
    if (!this.closed) this.child.postMessage(message);
  }

  /** Idempotent terminal transition: reject every pending request and notify the owner once. */
  private finish(code: number | null, reason: string) {
    if (this.closed) return;
    this.closed = true;
    this.busy = false;
    this.startReject(new Error(reason));
    for (const p of this.pending.values()) p.reject(new Error(reason));
    this.pending.clear();
    this.opts.onExit(code, this.stderr);
  }

  private onMessage(msg: WorkerToMain) {
    switch (msg.kind) {
      case "started":
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
        if (event.type === "agent_start") this.busy = true;
        if (event.type === "agent_end" || event.type === "agent_settled") this.busy = false;
        this.opts.onEvent(event);
        return;
      }
      case "log":
        this.collectStderr(`${msg.text}\n`);
        return;
      case "disposed":
        this.kill();
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

  respondUI(response: RpcExtensionUIResponse) {
    this.post({ kind: "ui-response", response });
  }

  get stderrTail(): string {
    return this.stderr;
  }

  get exited(): boolean {
    return this.closed;
  }

  kill() {
    if (this.closed) return;
    this.child.kill();
    this.finish(null, "the session worker was stopped");
  }
}

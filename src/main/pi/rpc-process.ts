import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type {
  PiCommand,
  PiEvent,
  ResponseDataOf,
  RpcExtensionUIResponse,
  RpcResponse,
} from "@shared/protocol";
import { shellEnv } from "../shell-env";

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

export interface PiProcessOptions {
  cwd: string;
  sessionPath?: string;
  /** Override for the pi executable; default resolves `pi` on the login shell PATH. */
  binary?: string;
  extraArgs?: string[];
  onEvent: (event: PiEvent) => void;
  onExit: (code: number | null, signal: NodeJS.Signals | null, stderr: string) => void;
}

/**
 * One `pi --mode rpc` child process. JSON lines in, JSON lines out.
 * Splits strictly on "\n" — never use readline here, it also splits on U+2028/2029.
 */
export class PiProcess {
  readonly cwd: string;
  private child: ChildProcessWithoutNullStreams;
  private buffer = "";
  private stderr = "";
  private pending = new Map<string, Pending>();
  private closed = false;
  /** True between agent_start and agent_end: a turn is in flight. */
  busy = false;

  constructor(private opts: PiProcessOptions) {
    this.cwd = opts.cwd;
    const args = ["--mode", "rpc"];
    if (opts.sessionPath) args.push("--session", opts.sessionPath);
    if (opts.extraArgs) args.push(...opts.extraArgs);
    this.child = spawn(opts.binary || "pi", args, {
      cwd: opts.cwd,
      env: shellEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => this.onStdout(chunk));
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk: string) => {
      this.stderr = (this.stderr + chunk).slice(-8000);
    });
    this.child.on("exit", (code, signal) => this.finish(code, signal, `pi exited (${code ?? signal})`));
    // A spawn failure (ENOENT, EACCES) fires "error" and may never fire "exit": treat it as an exit.
    this.child.on("error", (err) => {
      this.stderr = `${this.stderr}\n${err.message}`.slice(-8000);
      this.finish(null, null, `pi failed to start: ${err.message}`);
    });
  }

  /** Idempotent terminal transition: reject every pending request and notify the owner once. */
  private finish(code: number | null, signal: NodeJS.Signals | null, reason: string) {
    if (this.closed) return;
    this.closed = true;
    this.busy = false;
    for (const p of this.pending.values()) p.reject(new Error(reason));
    this.pending.clear();
    this.opts.onExit(code, signal, this.stderr);
  }

  private onStdout(chunk: string) {
    this.buffer += chunk;
    let i: number = this.buffer.indexOf("\n");
    while (i >= 0) {
      const line = this.buffer.slice(0, i);
      this.buffer = this.buffer.slice(i + 1);
      if (line.trim()) this.onLine(line);
      i = this.buffer.indexOf("\n");
    }
  }

  private onLine(line: string) {
    let msg: RpcResponse | PiEvent;
    try {
      msg = JSON.parse(line);
    } catch {
      this.stderr += `\n[unparseable stdout] ${line.slice(0, 200)}`;
      return;
    }
    if (msg.type === "response") {
      const p = msg.id ? this.pending.get(msg.id) : undefined;
      if (!p) return;
      this.pending.delete(msg.id as string);
      if (msg.success) p.resolve("data" in msg ? msg.data : undefined);
      else p.reject(new Error(msg.error));
      return;
    }
    if (msg.type === "agent_start") this.busy = true;
    if (msg.type === "agent_end" || msg.type === "agent_settled") this.busy = false;
    this.opts.onEvent(msg);
  }

  /**
   * Send a command and wait for its response. `timeoutMs` is only for handshakes such as
   * get_state: a prompt that Pi did receive must never be timed out and retried, that would
   * duplicate the turn.
   */
  request<C extends PiCommand>(command: C, timeoutMs?: number): Promise<ResponseDataOf<C["type"]>> {
    if (this.closed) return Promise.reject(new Error("pi process is not running"));
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
          const p = this.pending.get(id);
          if (p) p.reject(new Error(`pi did not answer ${command.type} within ${timeoutMs}ms`));
        }, timeoutMs);
      }
      this.child.stdin.write(`${JSON.stringify({ id, ...command })}\n`, (err) => {
        if (err) this.pending.get(id)?.reject(err);
      });
    });
  }

  respondUI(response: RpcExtensionUIResponse) {
    if (this.closed) return;
    this.child.stdin.write(`${JSON.stringify(response)}\n`);
  }

  get stderrTail(): string {
    return this.stderr;
  }

  get exited(): boolean {
    return this.closed;
  }

  kill() {
    if (this.closed) return;
    this.child.kill("SIGTERM");
  }
}

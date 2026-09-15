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
import { warmShellEnv } from "../shell-env";
import { SessionProcess } from "./session-process";

/** How long a fresh worker gets to build its runtime before we call the start failed. */
export const STARTUP_TIMEOUT_MS = 15_000;

/** Live session workers owned by this window. Nothing here is persisted. */
export class PiRegistry {
  private procs = new Map<string, SessionProcess>();

  constructor(private win: () => BrowserWindow | undefined) {}

  async start(opts: StartPiOptions) {
    const key = randomUUID();
    let early: PiEvent[] | undefined = [];
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
        this.send("pi:exit", { key, code, signal: null, stderr } satisfies PiExitEnvelope);
      },
    });
    this.procs.set(key, proc);
    let state: PiSessionState;
    try {
      state = await withTimeout(proc.started, STARTUP_TIMEOUT_MS);
    } catch (err) {
      // A failed runtime build, an early crash, or a worker that never answered: leave nothing
      // running and surface why.
      this.procs.delete(key);
      proc.kill();
      const detail = proc.stderrTail.trim();
      throw new Error(detail ? `${(err as Error).message}\n${detail}` : (err as Error).message);
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

  stopAll() {
    for (const p of this.procs.values()) p.kill();
    this.procs.clear();
  }

  private get(key: string): SessionProcess {
    const p = this.procs.get(key);
    if (!p) throw new Error(`unknown session worker ${key}`);
    return p;
  }

  private send(channel: string, payload: unknown) {
    const w = this.win();
    if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
  }
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

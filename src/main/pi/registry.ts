import { randomUUID } from "node:crypto";
import type {
  PiCommand,
  PiEvent,
  PiEventEnvelope,
  PiExitEnvelope,
  ResponseDataOf,
  RpcExtensionUIResponse,
  StartPiOptions,
} from "@shared/protocol";
import type { BrowserWindow } from "electron";
import { loadSettings } from "../settings";
import { warmShellEnv } from "../shell-env";
import { bundledExtensionArgs, currentBundled } from "./bundled";
import { detachFork } from "./detach-fork";
import { readPiHome } from "./ecosystem";
import { PiProcess } from "./rpc-process";

/** How long a fresh `pi --mode rpc` gets to answer get_state before we call the start failed. */
export const STARTUP_TIMEOUT_MS = 15_000;

/** Live pi processes owned by this window. Nothing here is persisted. */
export class PiRegistry {
  private procs = new Map<string, PiProcess>();

  constructor(private win: () => BrowserWindow | undefined) {}

  async start(opts: StartPiOptions) {
    const key = randomUUID();
    let early: PiEvent[] | undefined = [];
    const adv = loadSettings().advanced;
    await warmShellEnv(); // never probe the login shell synchronously on the IPC thread
    const proc = new PiProcess({
      cwd: opts.cwd,
      sessionPath: opts.sessionPath,
      binary: adv.piBinary || undefined,
      // PID's bridge (and the bundled MCP adapter when the user has none) ride along per process.
      extraArgs: [
        ...bundledExtensionArgs(readPiHome().packages, currentBundled()),
        ...adv.piExtraArgs.split(/\s+/).filter(Boolean),
      ],
      onEvent: (event) => {
        if (early) early.push(event);
        else this.send("pi:event", { key, event } satisfies PiEventEnvelope);
      },
      onExit: (code, signal, stderr) => {
        this.procs.delete(key);
        this.send("pi:exit", { key, code, signal, stderr } satisfies PiExitEnvelope);
      },
    });
    this.procs.set(key, proc);
    let state: ResponseDataOf<"get_state">;
    try {
      state = await proc.request({ type: "get_state" }, STARTUP_TIMEOUT_MS);
    } catch (err) {
      // Spawn error, early crash, or a hung binary: make sure nothing lingers and surface why.
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
    const proc = this.get(key);
    const r = await proc.request(command);
    // a fork is a plain new session in PID: drop pi's parentSession stamp from its header
    if (command.type === "fork") {
      const state = await proc.request({ type: "get_state" });
      if (state.sessionFile) await detachFork(state.sessionFile);
    }
    return r;
  }

  respondUI(key: string, response: RpcExtensionUIResponse) {
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

  private get(key: string): PiProcess {
    const p = this.procs.get(key);
    if (!p) throw new Error(`unknown pi process ${key}`);
    return p;
  }

  private send(channel: string, payload: unknown) {
    const w = this.win();
    if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

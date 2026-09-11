import { randomUUID } from "node:crypto";
import type {
  PiCommand,
  PiEvent,
  PiEventEnvelope,
  PiExitEnvelope,
  RpcExtensionUIResponse,
  StartPiOptions,
} from "@shared/protocol";
import type { BrowserWindow } from "electron";
import { loadSettings } from "../settings";
import { warmShellEnv } from "../shell-env";
import { PiProcess } from "./rpc-process";

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
      extraArgs: adv.piExtraArgs.split(/\s+/).filter(Boolean),
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
    const state = await proc.request({ type: "get_state" });
    const earlyEvents = early;
    early = undefined;
    return { key, cwd: opts.cwd, state, earlyEvents };
  }

  command(key: string, command: PiCommand) {
    return this.get(key).request(command);
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

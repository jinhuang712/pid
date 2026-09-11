import type {
  PiCommand,
  PiEventEnvelope,
  PiExitEnvelope,
  PiHandle,
  ResponseDataOf,
  RpcExtensionUIResponse,
  StartPiOptions,
} from "@shared/protocol";
import type { SessionSummary } from "@shared/sessions";

export interface AppInfo {
  version: string;
  electron: string;
  platform: NodeJS.Platform;
  devOpenFolder?: string;
  devPrompt?: string;
  devFollowUp?: string;
  devOpenSession?: string;
}

export interface Bridge {
  appInfo(): Promise<AppInfo>;
  pickFolder(): Promise<string | undefined>;
  folders: {
    recent(): Promise<string[]>;
    remember(dir: string): Promise<string[]>;
  };
  sessions: {
    list(cwd: string): Promise<SessionSummary[]>;
    listAll(): Promise<SessionSummary[]>;
  };
  pi: {
    start(opts: StartPiOptions): Promise<PiHandle>;
    command<C extends PiCommand>(key: string, command: C): Promise<ResponseDataOf<C["type"]>>;
    uiResponse(key: string, response: RpcExtensionUIResponse): Promise<void>;
    stop(key: string): Promise<void>;
    onEvent(listener: (e: PiEventEnvelope) => void): () => void;
    onExit(listener: (e: PiExitEnvelope) => void): () => void;
  };
}

declare global {
  interface Window {
    bridge: Bridge;
  }
}

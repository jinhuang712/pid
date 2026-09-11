import type {
  PiCommand,
  PiEventEnvelope,
  PiExitEnvelope,
  PiHandle,
  ResponseDataOf,
  RpcExtensionUIResponse,
  StartPiOptions,
} from "@shared/protocol";

export interface AppInfo {
  version: string;
  electron: string;
  platform: NodeJS.Platform;
  devOpenFolder?: string;
  devPrompt?: string;
}

export interface Bridge {
  appInfo(): Promise<AppInfo>;
  pickFolder(): Promise<string | undefined>;
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

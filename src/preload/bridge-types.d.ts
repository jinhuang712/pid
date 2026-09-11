import type { ExtensionView, McpView, PiHome, SkillView } from "@shared/ecosystem";
import type { AddWorktreeOptions, RemoveWorktreeOptions, RepoInfo, WorktreeSafety } from "@shared/git";
import type {
  PiCommand,
  PiEventEnvelope,
  PiExitEnvelope,
  PiHandle,
  ResponseDataOf,
  RpcExtensionUIResponse,
  StartPiOptions,
} from "@shared/protocol";
import type { SearchHit, SearchScope, SessionMessage, SessionSummary } from "@shared/sessions";
import type { PidSettings } from "@shared/settings";

export interface AppInfo {
  version: string;
  electron: string;
  platform: NodeJS.Platform;
  devOpenFolder?: string;
  devPrompt?: string;
  devFollowUp?: string;
  devOpenSession?: string;
  devDraft?: string;
  devSearch?: string;
  devPage?: string;
}

export interface Bridge {
  appInfo(): Promise<AppInfo>;
  pickFolder(): Promise<string | undefined>;
  folders: {
    recent(): Promise<string[]>;
    remember(dir: string): Promise<string[]>;
  };
  files: {
    list(cwd: string): Promise<string[]>;
  };
  git: {
    repo(cwd: string): Promise<RepoInfo | undefined>;
    addWorktree(o: AddWorktreeOptions): Promise<string>;
    worktreeSafety(cwd: string, path: string): Promise<WorktreeSafety>;
    removeWorktree(o: RemoveWorktreeOptions): Promise<void>;
  };
  settings: {
    get(): Promise<PidSettings>;
    set(s: PidSettings): Promise<PidSettings>;
  };
  eco: {
    home(): Promise<PiHome>;
    skills(cwd?: string): Promise<SkillView[]>;
    extensions(cwd?: string): Promise<ExtensionView[]>;
    mcp(cwd?: string): Promise<McpView>;
  };
  shell: {
    reveal(path: string): Promise<void>;
    openPath(path: string): Promise<string>;
  };
  sessions: {
    list(cwd: string): Promise<SessionSummary[]>;
    listAll(): Promise<SessionSummary[]>;
    read(path: string): Promise<SessionMessage[]>;
    search(query: string, scope: SearchScope): Promise<SearchHit[]>;
    dropIndex(): Promise<void>;
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

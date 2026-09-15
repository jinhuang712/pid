import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { PiDiagnostics } from "@shared/diagnostics";
import type {
  AppendSystemPrompt,
  ExtensionView,
  McpToggle,
  McpView,
  PiHome,
  ResourceToggle,
  SkillView,
} from "@shared/ecosystem";
import type { PathInfo } from "@shared/files";
import type { RepoInfo } from "@shared/git";
import type {
  PiCommand,
  PiEventEnvelope,
  PiExitEnvelope,
  PiHandle,
  ResponseDataOf,
  RpcExtensionUIResponse,
  StartPiOptions,
} from "@shared/protocol";
import type {
  FolderSuggestion,
  SearchHit,
  SearchScope,
  SessionMessage,
  SessionSummary,
} from "@shared/sessions";
import type { PidSettings } from "@shared/settings";
import type { UsageSnapshot } from "@shared/usage";

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
  /** Colon-separated absolute paths to attach on launch. */
  devAttach?: string;
}

export interface Bridge {
  appInfo(): Promise<AppInfo>;
  onMenuCommand(listener: (cmd: string) => void): () => void;
  /** Absolute path of a dropped File, via Electron's webUtils. */
  pathOf(file: File): string | undefined;
  pickFolder(): Promise<string | undefined>;
  folders: {
    recent(): Promise<string[]>;
    remember(dir: string): Promise<string[]>;
    forget(dir: string): Promise<string[]>;
    suggest(query: string): Promise<FolderSuggestion[]>;
  };
  openSessions: {
    get(): Promise<{ openSessions: { cwd: string; path: string }[]; activeSession?: string }>;
    save(open: { cwd: string; path: string }[], active?: string): Promise<void>;
  };
  files: {
    list(cwd: string): Promise<string[]>;
    /** Existence, kind and size for attachment chips. Content is never read. */
    stat(paths: string[]): Promise<PathInfo[]>;
    /** Small data-URL preview (images, and PDFs where the OS renders them); undefined when it cannot. */
    thumbnail(path: string): Promise<string | undefined>;
    pick(kind: "file" | "folder"): Promise<string[]>;
    /** Pasted image bytes → a temp file path, the way the Pi terminal handles paste. */
    saveClipboardImage(bytes: Uint8Array, mime: string): Promise<string>;
  };
  git: {
    repo(cwd: string): Promise<RepoInfo | undefined>;
  };
  settings: {
    get(): Promise<PidSettings>;
    set(s: PidSettings): Promise<PidSettings>;
    /** Settings changed outside the renderer — the View menu's interface-scale items. */
    onChange(listener: (s: PidSettings) => void): () => void;
  };
  usage: {
    /**
     * Tell the main process which model is in front of the user, and get the reading it already
     * has. Quota belongs to the account behind the model, so this is the only session fact the
     * usage service needs — pass undefined when no session is open.
     */
    watch(model: { provider: string; baseUrl: string } | undefined): Promise<UsageSnapshot>;
    /** A turn settled, so the quota moved. Debounced in the main process. */
    turnEnded(): Promise<void>;
    /** Refetch now, ignoring the last reading. The Refresh button in settings. */
    refresh(): Promise<UsageSnapshot>;
    onChange(listener: (s: UsageSnapshot) => void): () => void;
  };
  eco: {
    home(): Promise<PiHome>;
    skills(cwd?: string): Promise<SkillView[]>;
    extensions(cwd?: string): Promise<ExtensionView[]>;
    mcp(cwd?: string): Promise<McpView>;
    /** Write a skill/extension on-off state into Pi's settings, as `pi config` would. */
    setResource(req: ResourceToggle): Promise<void>;
    /** Write an MCP server's `disabled` flag into mcp.json, as `/mcp` would. */
    setMcp(req: McpToggle): Promise<void>;
    /** ~/.pi/agent/APPEND_SYSTEM.md, the file Pi appends to its system prompt. */
    appendSystemPrompt(): Promise<AppendSystemPrompt>;
    /** Write the file in place; empty text removes it. Applies to new sessions. */
    setAppendSystemPrompt(text: string): Promise<AppendSystemPrompt>;
  };
  shell: {
    reveal(path: string): Promise<void>;
    openPath(path: string): Promise<string>;
    /** http(s) and mailto only; anything else is ignored. */
    openExternal(url: string): Promise<void>;
  };
  sessions: {
    list(cwd: string): Promise<SessionSummary[]>;
    listAll(): Promise<SessionSummary[]>;
    read(path: string): Promise<SessionMessage[]>;
    /** Full messages of the active branch, straight from the file; shown while pi is still starting. */
    readBranch(path: string): Promise<AgentMessage[]>;
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
    /** Which pi binary, which version, which SDK, which MCP adapter. Probes `pi --version`. */
    diagnostics(): Promise<PiDiagnostics>;
  };
}

declare global {
  interface Window {
    bridge: Bridge;
  }
}

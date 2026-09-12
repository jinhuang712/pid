/**
 * Views of the Pi ecosystem on this machine. PID shows them and flips their on/off state
 * by writing the same settings `pi config` and `/mcp` write; Pi owns everything else.
 */

/** Where a toggle is written: Pi's global settings, or the project's `.pi/` overrides. */
export type ToggleScope = "global" | "project";

/**
 * Project-layer state of a resource, mirroring `pi config --local`:
 * "load" / "unload" are explicit overrides; "inherit" means the global setting applies.
 */
export type ProjectState = "load" | "unload" | "inherit";

export interface SkillView {
  name: string;
  description: string;
  path: string;
  baseDir: string;
  /** Where it was discovered: "user", "project", or a package source such as "npm:pi-mcp-adapter". */
  source: string;
  disableModelInvocation: boolean;
  /** Effective state after global and project settings, as Pi resolves it. */
  enabled: boolean;
  /** Present when listed with a project directory. */
  projectState?: ProjectState;
}

export type Compat = "compatible" | "partial" | "unsupported";

export interface ExtensionView {
  name: string;
  /** settings.json package source, or "user" / "project" for loose extension files. */
  source: string;
  scope: "user" | "project" | "package";
  baseDir: string;
  /** Extension entry files as Pi resolves them; toggles apply to all of them. */
  entries: string[];
  /** Source files scanned for compatibility. */
  files: string[];
  compat: Compat;
  /** TUI-only APIs found in the source, if any. */
  tuiApis: string[];
  /** Cross-mode UI APIs found (work in PID through the RPC UI sub-protocol). */
  uiApis: string[];
  version?: string;
  description?: string;
  /** Effective state after global and project settings; true when every entry loads. */
  enabled: boolean;
  /** Present when listed with a project directory. */
  projectState?: ProjectState;
}

export interface McpServerView {
  name: string;
  /** The file that defines the server (lowest layer that has a command or url). */
  configPath: string;
  /** Every config file mentioning this server, lowest precedence first. */
  definedIn: string[];
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  url?: string;
  auth?: string;
  directTools?: boolean;
  /** Effective `disabled` after all layers. */
  disabled: boolean;
  /** `disabled` as written in the global mcp.json, if that file defines the server. */
  globalDisabled?: boolean;
  /** `disabled` as written in the project's .pi/mcp.json override, if any. */
  projectDisabled?: boolean;
  /** From pi-mcp-adapter's tool cache; undefined when the server has never been connected. */
  cachedTools?: { name: string; description?: string }[];
}

export interface McpView {
  /**
   * Which pi-mcp-adapter a PID-started Pi loads: the user's own package, PID's bundled copy
   * (added per process with `-e`, nothing written to Pi's settings), or none.
   */
  adapterSource: "user" | "bundled" | "none";
  /** Version of the bundled copy, when that is what will load. */
  adapterVersion?: string;
  configPaths: string[];
  cachePath?: string;
  servers: McpServerView[];
}

export interface PiHome {
  agentDir: string;
  settingsPath: string;
  /** Package sources, with any per-package filter objects reduced to their source string. */
  packages: string[];
  defaultProvider?: string;
  defaultModel?: string;
  defaultThinkingLevel?: string;
}

export interface ResourceToggle {
  kind: "skills" | "extensions";
  /** Resource file paths as Pi resolves them (SKILL.md files, extension entry files). */
  paths: string[];
  scope: ToggleScope;
  /** Project directory; required for scope "project", optional context otherwise. */
  cwd?: string;
  /** Global scope: "load" or "unload". Project scope: any of the three. */
  state: ProjectState;
}

export interface McpToggle {
  name: string;
  scope: ToggleScope;
  cwd?: string;
  disabled: boolean;
}

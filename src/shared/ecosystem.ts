/**
 * Views of the Pi ecosystem on this machine. PID shows them and flips their on/off state
 * by writing the same settings `pi config` and `/mcp` write; Pi owns everything else.
 */

import type { UiUsage } from "./extension-ui";

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
  /** Where it was discovered: "user", "project", or a package source such as "npm:pi-view". */
  source: string;
  disableModelInvocation: boolean;
  /** Effective state after global and project settings, as Pi resolves it. */
  enabled: boolean;
  /** Present when listed with a project directory. */
  projectState?: ProjectState;
}

export interface ExtensionView {
  name: string;
  /** settings.json package source, or "user" / "project" for loose extension files. */
  source: string;
  scope: "user" | "project" | "package";
  baseDir: string;
  /** Extension entry files as Pi resolves them; toggles apply to all of them. */
  entries: string[];
  /** Source files scanned for UI usage. */
  files: string[];
  /**
   * Which `ctx.ui` members the source reaches for, grouped by what PID does with each. The Pi
   * terminal serves all of them, so this is the difference between the two hosts.
   */
  ui: UiUsage;
  version?: string;
  description?: string;
  /** Effective state after global and project settings; true when every entry loads. */
  enabled: boolean;
  /** Present when listed with a project directory. */
  projectState?: ProjectState;
}

/** One entry of the MCP tool cache (`~/.pi/agent/mcp-cache.json`, shared by pid-mcp and pi-mcp-adapter). */
export interface McpToolSummary {
  name: string;
  description?: string;
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
  /**
   * How the server's tools reach the model: `true` always visible, a list pins those names,
   * anything else ("search", false, absent) waits for `mcp_search`.
   */
  directTools?: boolean | string[] | "search";
  /** Effective `disabled` after all layers. */
  disabled: boolean;
  /** `disabled` as written in the global mcp.json, if that file defines the server. */
  globalDisabled?: boolean;
  /** `disabled` as written in the project's .pi/mcp.json override, if any. */
  projectDisabled?: boolean;
  /** From the MCP tool cache; undefined when the server has never been connected. */
  cachedTools?: McpToolSummary[];
}

export interface McpView {
  configPaths: string[];
  cachePath?: string;
  /**
   * The whole tool cache by server name. Runtime-registered servers appear here too — they have no
   * config entry, so this is the only place the page can learn their tools.
   */
  cacheTools?: Record<string, McpToolSummary[]>;
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

/** Contents of ~/.pi/agent/APPEND_SYSTEM.md, the rules Pi appends to its system prompt. */
export interface AppendSystemPrompt {
  path: string;
  text: string;
  /** False when the file is absent: Pi then runs on its default prompt plus AGENTS.md. */
  exists: boolean;
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

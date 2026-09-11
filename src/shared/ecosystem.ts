/** Read-only views of the Pi ecosystem on this machine. PID shows them; Pi owns them. */

export interface SkillView {
  name: string;
  description: string;
  path: string;
  baseDir: string;
  /** Where it was discovered: "user", "project", or a package source such as "npm:pi-mcp-adapter". */
  source: string;
  disableModelInvocation: boolean;
}

export type Compat = "compatible" | "partial" | "unsupported";

export interface ExtensionView {
  name: string;
  /** settings.json package source, or "user" / "project" for loose extension files. */
  source: string;
  scope: "user" | "project" | "package";
  baseDir: string;
  /** Extension entry files (as declared by the package or found in the directory). */
  files: string[];
  compat: Compat;
  /** TUI-only APIs found in the source, if any. */
  tuiApis: string[];
  /** Cross-mode UI APIs found (work in PID through the RPC UI sub-protocol). */
  uiApis: string[];
  version?: string;
  description?: string;
}

export interface McpServerView {
  name: string;
  configPath: string;
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  url?: string;
  auth?: string;
  directTools?: boolean;
  /** From pi-mcp-adapter's tool cache; undefined when the server has never been connected. */
  cachedTools?: { name: string; description?: string }[];
}

export interface McpView {
  adapterInstalled: boolean;
  configPaths: string[];
  cachePath?: string;
  servers: McpServerView[];
}

export interface PiHome {
  agentDir: string;
  settingsPath: string;
  packages: string[];
  defaultProvider?: string;
  defaultModel?: string;
  defaultThinkingLevel?: string;
}

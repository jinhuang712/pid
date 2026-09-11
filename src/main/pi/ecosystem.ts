import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import type { Compat, ExtensionView, McpServerView, McpView, PiHome, SkillView } from "@shared/ecosystem";

/**
 * Discovery of skills, extensions, and MCP servers. Read-only: mirrors what Pi loads
 * from ~/.pi/agent and <cwd>/.pi, using Pi's own skill loader where possible.
 */

const sdk = () => import("@earendil-works/pi-coding-agent");

export function agentDir(): string {
  return process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
}

export function readPiHome(): PiHome {
  const dir = agentDir();
  const settingsPath = join(dir, "settings.json");
  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  } catch {
    // no settings yet
  }
  const packages = Array.isArray(settings.packages)
    ? (settings.packages as unknown[]).filter((p) => typeof p === "string")
    : [];
  return {
    agentDir: dir,
    settingsPath,
    packages: packages as string[],
    defaultProvider: str(settings.defaultProvider),
    defaultModel: str(settings.defaultModel),
    defaultThinkingLevel: str(settings.defaultThinkingLevel),
  };
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

interface ResolvedPackage {
  source: string;
  baseDir: string;
  extensions: string[];
  skills: string[];
  version?: string;
  description?: string;
}

/** Resolve a settings.json package source the way Pi does: npm: → agentDir/npm/node_modules, else a path relative to agentDir. */
function resolvePackage(source: string): ResolvedPackage | undefined {
  const dir = agentDir();
  let baseDir: string;
  if (source.startsWith("npm:")) {
    const spec = source.slice(4);
    const name = spec.startsWith("@") ? spec.split("@").slice(0, 2).join("@") : spec.split("@")[0];
    baseDir = join(dir, "npm", "node_modules", name);
  } else if (source.startsWith("git:")) {
    baseDir = join(dir, "git", basename(source.slice(4)).replace(/\.git$/, ""));
  } else {
    baseDir = isAbsolute(source) ? source : resolve(dir, source);
  }
  if (!existsSync(baseDir)) return undefined;
  let pkg: { version?: string; description?: string; pi?: { extensions?: string[]; skills?: string[] } } = {};
  try {
    pkg = JSON.parse(readFileSync(join(baseDir, "package.json"), "utf8"));
  } catch {
    // a bare directory
  }
  const extensions = (pkg.pi?.extensions ?? []).map((p) => resolve(baseDir, p));
  const skills = (pkg.pi?.skills ?? []).map((p) => resolve(baseDir, p));
  if (extensions.length === 0 && !pkg.pi) {
    // No manifest: treat the directory itself as the extension root, mirroring Pi's fallback.
    extensions.push(baseDir);
  }
  return { source, baseDir, extensions, skills, version: pkg.version, description: pkg.description };
}

export async function listSkills(cwd?: string): Promise<SkillView[]> {
  const { loadSkillsFromDir } = await sdk();
  const out: SkillView[] = [];
  const add = (dir: string, source: string) => {
    if (!existsSync(dir)) return;
    const { skills } = loadSkillsFromDir({ dir, source });
    for (const s of skills) {
      out.push({
        name: s.name,
        description: s.description,
        path: s.filePath,
        baseDir: s.baseDir,
        source,
        disableModelInvocation: s.disableModelInvocation,
      });
    }
  };
  add(join(agentDir(), "skills"), "user");
  if (cwd) add(join(cwd, ".pi", "skills"), "project");
  for (const source of readPiHome().packages) {
    const pkg = resolvePackage(source);
    if (!pkg) continue;
    for (const dir of pkg.skills) add(dir, source);
  }
  return out;
}

/** UI methods that only work in the terminal UI (no RPC equivalent) vs. ones PID can serve. */
const TUI_ONLY = [
  "ui.custom(",
  "setFooter(",
  "setHeader(",
  "onTerminalInput(",
  "setEditorComponent(",
  "getEditorComponent(",
  "addAutocompleteProvider(",
  "setWorkingMessage(",
  "setWorkingVisible(",
  "setWorkingIndicator(",
  "setHiddenThinkingLabel(",
  "pasteToEditor(",
  "getEditorText(",
  "setTheme(",
  "getAllThemes(",
  "setToolsExpanded(",
  "registerMessageRenderer(",
  "registerEntryRenderer(",
];
const CROSS_MODE = [
  "ui.select(",
  "ui.confirm(",
  "ui.input(",
  "ui.editor(",
  "ui.notify(",
  "setStatus(",
  "setWidget(",
  "setTitle(",
  "setEditorText(",
];

function sourceFiles(entry: string, acc: string[] = [], depth = 0): string[] {
  if (depth > 4 || !existsSync(entry)) return acc;
  const st = statSync(entry);
  if (st.isFile()) {
    if (/\.(ts|js|mts|mjs|cts|cjs|tsx|jsx)$/.test(entry)) acc.push(entry);
    return acc;
  }
  for (const name of readdirSync(entry)) {
    if (name === "node_modules" || name.startsWith(".") || (name === "dist" && depth > 0)) continue;
    sourceFiles(join(entry, name), acc, depth + 1);
  }
  return acc;
}

function scanCompat(files: string[]): { compat: Compat; tuiApis: string[]; uiApis: string[] } {
  const tui = new Set<string>();
  const ui = new Set<string>();
  let guarded = false;
  for (const f of files.slice(0, 200)) {
    let text: string;
    try {
      text = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    for (const api of TUI_ONLY) if (text.includes(api)) tui.add(api.replace(/\($/, ""));
    for (const api of CROSS_MODE) if (text.includes(api)) ui.add(api.replace(/\($/, ""));
    if (/mode\s*===?\s*["']tui["']|hasUI/.test(text)) guarded = true;
  }
  let compat: Compat = "compatible";
  if (tui.size > 0) compat = guarded ? "partial" : "unsupported";
  return { compat, tuiApis: [...tui], uiApis: [...ui] };
}

export function listExtensions(cwd?: string): ExtensionView[] {
  const out: ExtensionView[] = [];
  const looseDir = (dir: string, scope: "user" | "project") => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      if (name.startsWith(".") || name.startsWith("_")) continue;
      const full = join(dir, name);
      const files = sourceFiles(full);
      if (files.length === 0) continue;
      out.push({
        name: name.replace(/\.(ts|js|mts|mjs)$/, ""),
        source: scope,
        scope,
        baseDir: statSync(full).isDirectory() ? full : dirname(full),
        files,
        ...scanCompat(files),
      });
    }
  };
  looseDir(join(agentDir(), "extensions"), "user");
  if (cwd) looseDir(join(cwd, ".pi", "extensions"), "project");
  for (const source of readPiHome().packages) {
    const pkg = resolvePackage(source);
    if (!pkg) {
      out.push({
        name: source,
        source,
        scope: "package",
        baseDir: "",
        files: [],
        compat: "unsupported",
        tuiApis: ["(package not installed)"],
        uiApis: [],
      });
      continue;
    }
    if (pkg.extensions.length === 0) continue; // skills-only package
    const files = pkg.extensions.flatMap((e) => sourceFiles(e));
    out.push({
      name: basename(pkg.baseDir),
      source,
      scope: "package",
      baseDir: pkg.baseDir,
      files,
      version: pkg.version,
      description: pkg.description,
      ...scanCompat(files),
    });
  }
  return out;
}

/** MCP as configured for pi-mcp-adapter (the MCP integration in this Pi install). */
export function readMcp(cwd?: string): McpView {
  const home = readPiHome();
  const adapterInstalled = home.packages.some((p) => p.includes("pi-mcp-adapter"));
  const candidates = [
    join(agentDir(), "mcp.json"),
    ...(cwd ? [join(cwd, ".pi", "mcp.json"), join(cwd, ".mcp.json")] : []),
  ];
  const configPaths = candidates.filter((p) => existsSync(p));
  const servers: McpServerView[] = [];
  for (const configPath of configPaths) {
    let cfg: { mcpServers?: Record<string, Record<string, unknown>> } = {};
    try {
      cfg = JSON.parse(readFileSync(configPath, "utf8"));
    } catch {
      continue;
    }
    for (const [name, s] of Object.entries(cfg.mcpServers ?? {})) {
      servers.push({
        name,
        configPath,
        transport: typeof s.url === "string" ? "http" : "stdio",
        command: str(s.command),
        args: Array.isArray(s.args) ? (s.args as string[]) : undefined,
        url: str(s.url),
        auth: str(s.auth),
        directTools: typeof s.directTools === "boolean" ? s.directTools : undefined,
      });
    }
  }
  const cachePath = join(agentDir(), "mcp-cache.json");
  if (existsSync(cachePath)) {
    try {
      const cache = JSON.parse(readFileSync(cachePath, "utf8")) as {
        servers?: Record<string, { tools?: { name: string; description?: string }[] }>;
      };
      for (const s of servers) {
        const c = cache.servers?.[s.name];
        if (c?.tools) s.cachedTools = c.tools.map((t) => ({ name: t.name, description: t.description }));
      }
    } catch {
      // unreadable cache: show servers without tools
    }
  }
  return { adapterInstalled, configPaths, cachePath: existsSync(cachePath) ? cachePath : undefined, servers };
}

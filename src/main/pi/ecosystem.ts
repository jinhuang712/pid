import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";

import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import type { ResolvedResource } from "@earendil-works/pi-coding-agent";
import type {
  Compat,
  ExtensionView,
  McpServerView,
  McpToolSummary,
  McpView,
  PiHome,
  SkillView,
} from "@shared/ecosystem";
import { adapterSource, currentBundled, userMcpExtension } from "./bundled";
import { mcpGlobalPath, mcpProjectPaths, projectStateOf, resolveResources } from "./toggles";

/**
 * Discovery of skills, extensions, and MCP servers: what Pi loads from ~/.pi/agent and <cwd>/.pi,
 * resolved by Pi's own package manager so enabled/disabled state matches `pi config`.
 */

const sdk = () => import("@earendil-works/pi-coding-agent");

let getAgentDir: (() => string) | undefined;

/**
 * Load Pi's own `getAgentDir` so `agentDir()` below can stay synchronous.
 *
 * The agent directory is not `~/.pi/agent` unconditionally: PI_CODING_AGENT_DIR wins and is
 * tilde-expanded, and the directory name comes from the installed package rather than a literal.
 * Asking Pi keeps PID pointed wherever Pi points instead of PID keeping a second copy of that rule.
 *
 * What is cached is the function, not its answer: Pi re-reads the environment on every call and
 * so does PID. Call this once at start-up, before anything reads the agent directory.
 */
export async function configureAgentDir(): Promise<void> {
  getAgentDir ??= (await sdk()).getAgentDir;
}

export function agentDir(): string {
  if (!getAgentDir) throw new Error("configureAgentDir() must run before agentDir()");
  return getAgentDir();
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
  const packages: string[] = [];
  if (Array.isArray(settings.packages)) {
    for (const p of settings.packages as unknown[]) {
      if (typeof p === "string") packages.push(p);
      else if (p && typeof p === "object" && typeof (p as { source?: unknown }).source === "string")
        packages.push((p as { source: string }).source);
    }
  }
  return {
    agentDir: dir,
    settingsPath,
    packages,
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

const canonical = (p: string) => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};

async function projectSettings(cwd: string) {
  const { SettingsManager } = await sdk();
  return SettingsManager.create(cwd, agentDir(), { projectTrusted: true }).getProjectSettings();
}

export async function listSkills(cwd?: string): Promise<SkillView[]> {
  const { loadSkillsFromDir } = await sdk();
  const resolved = await resolveResources(cwd);
  const state = new Map(resolved.project.skills.map((r) => [canonical(r.path), r]));
  const proj = cwd ? await projectSettings(cwd) : undefined;
  const out: SkillView[] = [];
  const add = (dir: string, source: string) => {
    if (!existsSync(dir)) return;
    const { skills } = loadSkillsFromDir({ dir, source });
    for (const s of skills) {
      const r = state.get(canonical(s.filePath));
      out.push({
        name: s.name,
        description: s.description,
        path: s.filePath,
        baseDir: s.baseDir,
        source,
        disableModelInvocation: s.disableModelInvocation,
        enabled: r?.enabled ?? true,
        projectState: cwd && r && proj ? projectStateOf("skills", r, cwd, proj, agentDir()) : undefined,
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

function readManifest(baseDir: string): { version?: string; description?: string } {
  try {
    const pkg = JSON.parse(readFileSync(join(baseDir, "package.json"), "utf8"));
    return { version: str(pkg.version), description: str(pkg.description) };
  } catch {
    return {};
  }
}

/** Package name for display: "npm:pi-mcp-adapter@1.2" → "pi-mcp-adapter", "../../dev/pi/pi-view" → "pi-view". */
function packageName(source: string, baseDir?: string): string {
  if (baseDir) return basename(baseDir);
  const spec = source.replace(/^(npm|git|github):/, "");
  const noVersion = spec.startsWith("@") ? spec.replace(/(@[^/]+\/[^@]+)@.*/, "$1") : spec.split("@")[0];
  return basename(noVersion.replace(/\.git$/, ""));
}

/**
 * Extensions as Pi resolves them. Package extensions are one card per package (all entry files
 * toggle together); loose extensions under an `extensions/` directory are one card per entry.
 */
export async function listExtensions(cwd?: string): Promise<ExtensionView[]> {
  const resolved = await resolveResources(cwd);
  const proj = cwd ? await projectSettings(cwd) : undefined;
  const groups = new Map<string, { meta: ResolvedResource["metadata"]; items: ResolvedResource[] }>();
  for (const r of resolved.project.extensions) {
    const key =
      r.metadata.origin === "package"
        ? `package:${r.metadata.scope}:${r.metadata.source}:${r.metadata.baseDir ?? ""}`
        : `top:${r.metadata.scope}:${r.path}`;
    const g = groups.get(key) ?? { meta: r.metadata, items: [] };
    g.items.push(r);
    groups.set(key, g);
  }
  const out: ExtensionView[] = [];
  for (const { meta, items } of groups.values()) {
    const entries = items.map((r) => r.path);
    const isPackage = meta.origin === "package";
    const first = items[0];
    // Loose "foo.ts" sits directly in extensions/; "foo/index.ts" is a directory extension.
    const looseDir =
      !isPackage && basename(dirname(first.path)) !== "extensions" ? dirname(first.path) : undefined;
    const baseDir = isPackage ? (meta.baseDir ?? dirname(first.path)) : (looseDir ?? dirname(first.path));
    const files = isPackage || looseDir ? sourceFiles(baseDir) : sourceFiles(first.path);
    const manifest = isPackage ? readManifest(baseDir) : {};
    const scope: ExtensionView["scope"] = isPackage
      ? "package"
      : meta.scope === "project"
        ? "project"
        : "user";
    const states =
      cwd && proj ? items.map((r) => projectStateOf("extensions", r, cwd, proj, agentDir())) : [];
    out.push({
      name: isPackage
        ? packageName(meta.source, meta.baseDir)
        : looseDir
          ? basename(looseDir)
          : basename(first.path).replace(/\.(ts|js|mts|mjs|cts|cjs)$/, ""),
      source: isPackage ? meta.source : scope,
      scope,
      baseDir,
      entries,
      files,
      ...scanCompat(files),
      version: manifest.version,
      description: manifest.description,
      enabled: items.every((r) => r.enabled),
      projectState: states.length
        ? states.every((s) => s === states[0])
          ? states[0]
          : "inherit"
        : undefined,
    });
  }
  out.sort((a, b) => (a.scope === b.scope ? a.name.localeCompare(b.name) : a.scope === "package" ? -1 : 1));
  return out;
}

/** MCP as configured for the MCP extension: layers merged by server name, project files winning. */
export function readMcp(cwd?: string): McpView {
  const home = readPiHome();
  const bundled = currentBundled();
  const source = adapterSource(home.packages, bundled);
  const globalPath = mcpGlobalPath();
  const layers: { path: string; scope: "global" | "shared" | "pi" }[] = [
    { path: globalPath, scope: "global" },
  ];
  if (cwd) {
    const p = mcpProjectPaths(cwd);
    layers.push({ path: p.shared, scope: "shared" }, { path: p.pi, scope: "pi" });
  }
  const configPaths: string[] = [];
  const merged = new Map<string, McpServerView & { raw: Record<string, unknown> }>();
  for (const layer of layers) {
    if (!existsSync(layer.path)) continue;
    let cfg: Record<string, unknown> = {};
    try {
      cfg = JSON.parse(readFileSync(layer.path, "utf8"));
    } catch {
      continue;
    }
    configPaths.push(layer.path);
    const servers = (cfg.mcpServers ?? cfg["mcp-servers"] ?? {}) as Record<string, Record<string, unknown>>;
    for (const [name, s] of Object.entries(servers)) {
      if (!s || typeof s !== "object") continue;
      const prev = merged.get(name);
      const raw = { ...prev?.raw, ...s };
      const view: McpServerView & { raw: Record<string, unknown> } = {
        name,
        configPath: prev?.configPath ?? layer.path,
        definedIn: [...(prev?.definedIn ?? []), layer.path],
        transport: typeof raw.url === "string" ? "http" : "stdio",
        command: str(raw.command),
        args: Array.isArray(raw.args) ? (raw.args as string[]) : undefined,
        url: str(raw.url),
        auth: str(raw.auth),
        directTools:
          typeof raw.directTools === "boolean" || raw.directTools === "search"
            ? raw.directTools
            : Array.isArray(raw.directTools)
              ? (raw.directTools as string[]).filter((t): t is string => typeof t === "string")
              : undefined,
        disabled: raw.disabled === true,
        globalDisabled: prev?.globalDisabled,
        projectDisabled: prev?.projectDisabled,
        raw,
      };
      if (!prev && !(typeof s.command === "string" || typeof s.url === "string")) {
        // an override with no definition underneath: nothing Pi can start
        view.configPath = layer.path;
      }
      if (layer.scope === "global") view.globalDisabled = s.disabled === true;
      if (layer.scope === "pi" && "disabled" in s) view.projectDisabled = s.disabled === true;
      merged.set(name, view);
    }
  }
  const servers: McpServerView[] = [...merged.values()]
    .filter((s) => s.command || s.url)
    .map(({ raw: _raw, ...s }) => s);
  const cachePath = join(agentDir(), "mcp-cache.json");
  let cacheTools: Record<string, McpToolSummary[]> | undefined;
  if (existsSync(cachePath)) {
    try {
      const cache = JSON.parse(readFileSync(cachePath, "utf8")) as {
        servers?: Record<string, { tools?: McpToolSummary[] }>;
      };
      cacheTools = {};
      for (const [name, entry] of Object.entries(cache.servers ?? {})) {
        if (entry?.tools)
          cacheTools[name] = entry.tools.map((t) => ({ name: t.name, description: t.description }));
      }
      for (const s of servers) {
        const tools = cacheTools[s.name];
        if (tools) s.cachedTools = tools;
      }
    } catch {
      // unreadable cache: show servers without tools
    }
  }
  return {
    adapterSource: source,
    adapterName:
      source === "user" ? userMcpExtension(home.packages) : source === "bundled" ? "pid-mcp" : undefined,
    adapterVersion: source === "bundled" ? bundled.adapterVersion : undefined,
    configPaths,
    cachePath: existsSync(cachePath) ? cachePath : undefined,
    ...(cacheTools && Object.keys(cacheTools).length > 0 ? { cacheTools } : {}),
    servers,
  };
}

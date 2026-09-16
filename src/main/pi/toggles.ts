import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type {
  PackageSource,
  ResolvedPaths,
  ResolvedResource,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { ProjectState, ResourceToggle, ToggleScope } from "@shared/ecosystem";
import { agentDir } from "./ecosystem";

/**
 * On/off switches for skills and extensions.
 *
 * Skills and extensions: the same `+pattern` / `-pattern` entries `pi config` writes, through Pi's
 * own SettingsManager (file lock, only modified fields persisted). Global scope edits
 * ~/.pi/agent/settings.json; project scope edits <cwd>/.pi/settings.json exactly like
 * `pi config --local`, including the three-state load / unload / inherit override.
 *
 * These are the only writes PID makes under Pi's directories, and they are Pi's own formats through
 * Pi's own code paths. An extension's own configuration is the extension's to write.
 */

const sdk = () => import("@earendil-works/pi-coding-agent");

type ResourceKind = "skills" | "extensions";
type Prefixed = {
  source: string;
  extensions?: string[];
  skills?: string[];
  prompts?: string[];
  themes?: string[];
  autoload?: boolean;
};
const RESOURCE_KEYS = ["extensions", "skills", "prompts", "themes"] as const;

export interface Resolved {
  cwd: string;
  /** Pi's resolution with project settings ignored (what `pi config` shows in global mode). */
  global: ResolvedPaths;
  /** Resolution with project settings layered on top; equals `global` when no cwd was given. */
  project: ResolvedPaths;
}

/** Resolve resources the way `pi config` does: once without project settings, once with. */
export async function resolveResources(cwd?: string): Promise<Resolved> {
  const { DefaultPackageManager, SettingsManager } = await sdk();
  const dir = agentDir();
  const effectiveCwd = cwd ?? homedir();
  const skip = async () => "skip" as const;
  const globalSm = SettingsManager.create(effectiveCwd, dir, { projectTrusted: false });
  const global = await new DefaultPackageManager({
    cwd: effectiveCwd,
    agentDir: dir,
    settingsManager: globalSm,
  }).resolve(skip);
  if (!cwd) return { cwd: effectiveCwd, global, project: global };
  const projectSm = SettingsManager.create(cwd, dir, { projectTrusted: true });
  const project = await new DefaultPackageManager({ cwd, agentDir: dir, settingsManager: projectSm }).resolve(
    skip,
  );
  return { cwd, global, project };
}

const canonical = (p: string) => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};
const itemKey = (kind: ResourceKind, path: string) => `${kind}:${canonical(path)}`;
const stripPrefix = (entry: string) => (/^[!+-]/.test(entry) ? entry.slice(1) : entry);
const isPrefixed = (entry: string) => /^[!+-]/.test(entry);
const isLocalPath = (v: string) =>
  !/^(npm|git|github|https?|ssh|file):/.test(v.trim()) || v.trim().startsWith("file:");
function resolvePath(input: string, baseDir: string): string {
  let p = input.trim();
  if (p.startsWith("file:")) p = p.slice(5);
  if (p === "~") p = homedir();
  else if (p.startsWith("~/")) p = join(homedir(), p.slice(2));
  return isAbsolute(p) ? resolve(p) : resolve(baseDir, p);
}

class Toggler {
  private inherited = new Map<string, boolean>();
  constructor(
    private kind: ResourceKind,
    private cwd: string,
    private agentDir: string,
    private sm: SettingsManager,
    resolved: Resolved,
    private items: Map<string, ResolvedResource>,
  ) {
    for (const r of resolved.global[kind]) this.inherited.set(itemKey(kind, r.path), r.enabled);
  }

  static async create(kind: ResourceKind, scope: ToggleScope, cwd: string | undefined) {
    const { SettingsManager } = await sdk();
    const dir = agentDir();
    const resolved = await resolveResources(cwd);
    const list = scope === "project" ? resolved.project[kind] : resolved.global[kind];
    const items = new Map(list.map((r) => [canonical(r.path), r]));
    const sm = SettingsManager.create(resolved.cwd, dir, { projectTrusted: scope === "project" });
    return new Toggler(kind, resolved.cwd, dir, sm, resolved, items);
  }

  item(path: string): ResolvedResource {
    const r = this.items.get(canonical(path));
    if (!r)
      throw new Error(`Pi does not know this ${this.kind === "skills" ? "skill" : "extension"}: ${path}`);
    return r;
  }

  private topLevelBaseDir(scope: "user" | "project") {
    return scope === "project" ? join(this.cwd, ".pi") : this.agentDir;
  }
  private itemScope(r: ResolvedResource): "user" | "project" {
    return r.metadata.scope === "project" ? "project" : "user";
  }
  private resourcePattern(r: ResolvedResource) {
    return relative(r.metadata.baseDir ?? this.topLevelBaseDir(this.itemScope(r)), r.path);
  }
  private packagePattern(r: ResolvedResource) {
    return relative(r.metadata.baseDir ?? dirname(r.path), r.path);
  }
  private resourcePatternForScope(r: ResolvedResource, scope: "user" | "project") {
    const sourceScope = this.itemScope(r);
    if (scope !== sourceScope) return r.path;
    return relative(r.metadata.baseDir ?? this.topLevelBaseDir(sourceScope), r.path);
  }
  private topLevelOverridePatterns(r: ResolvedResource, scope: "user" | "project") {
    const base = this.topLevelBaseDir(scope);
    const set = new Set([this.resourcePatternForScope(r, scope), r.path, relative(base, r.path)]);
    if (r.metadata.baseDir) set.add(relative(r.metadata.baseDir, r.path));
    return set;
  }
  private isInheritedGlobalItem(r: ResolvedResource) {
    return this.itemScope(r) === "user" || this.inherited.has(itemKey(this.kind, r.path));
  }
  private setPaths(scope: "user" | "project", paths: string[]) {
    if (scope === "project") {
      if (this.kind === "extensions") this.sm.setProjectExtensionPaths(paths);
      else this.sm.setProjectSkillPaths(paths);
    } else if (this.kind === "extensions") this.sm.setExtensionPaths(paths);
    else this.sm.setSkillPaths(paths);
  }
  private packageSourceMatches(
    left: string,
    leftScope: "user" | "project",
    right: string,
    rightScope: "user" | "project",
  ) {
    if (left === right) return true;
    if (!isLocalPath(left) || !isLocalPath(right)) return false;
    return (
      resolvePath(left, this.topLevelBaseDir(leftScope)) ===
      resolvePath(right, this.topLevelBaseDir(rightScope))
    );
  }
  private sourceOf(p: PackageSource) {
    return typeof p === "string" ? p : p.source;
  }

  /** Global mode: a plain on/off, written to the settings layer that owns the item. */
  setGlobal(r: ResolvedResource, enabled: boolean) {
    if (this.itemScope(r) !== "user")
      throw new Error("Project-scoped resources are toggled in project scope");
    if (r.metadata.origin === "top-level") {
      const settings = this.sm.getGlobalSettings();
      const pattern = this.resourcePattern(r);
      const updated = (settings[this.kind] ?? []).filter((p) => stripPrefix(p) !== pattern);
      updated.push(`${enabled ? "+" : "-"}${pattern}`);
      this.setPaths("user", updated);
      return;
    }
    const packages: PackageSource[] = [...(this.sm.getGlobalSettings().packages ?? [])];
    const idx = packages.findIndex((p) => this.sourceOf(p) === r.metadata.source);
    if (idx === -1) throw new Error(`Package ${r.metadata.source} is not in Pi's global settings`);
    let pkg = packages[idx] as Prefixed;
    if (typeof pkg === "string") pkg = { source: pkg };
    const pattern = this.packagePattern(r);
    const updated = (pkg[this.kind] ?? []).filter((p) => stripPrefix(p) !== pattern);
    updated.push(`${enabled ? "+" : "-"}${pattern}`);
    pkg[this.kind] = updated;
    packages[idx] = RESOURCE_KEYS.some((k) => pkg[k] !== undefined) ? pkg : pkg.source;
    this.sm.setPackages(packages);
  }

  /** Project mode: load / unload override, or inherit to fall back to the global state. */
  setProject(r: ResolvedResource, state: ProjectState) {
    if (r.metadata.origin === "top-level") {
      const current = this.sm.getProjectSettings()[this.kind] ?? [];
      const inherited = this.isInheritedGlobalItem(r);
      const pattern = inherited ? r.path : this.resourcePatternForScope(r, "project");
      const patterns = this.topLevelOverridePatterns(r, "project");
      const updated = current.filter((entry) => {
        const target = stripPrefix(entry);
        if (isPrefixed(entry) && patterns.has(target)) return false;
        return !(state === "inherit" && inherited && target === pattern);
      });
      if (state !== "inherit") {
        if (inherited && !updated.includes(pattern)) updated.push(pattern);
        updated.push(`${state === "load" ? "+" : "-"}${pattern}`);
      }
      this.setPaths("project", updated);
      return;
    }
    const packages: PackageSource[] = [...(this.sm.getProjectSettings().packages ?? [])];
    let idx = packages.findIndex((p) =>
      this.packageSourceMatches(r.metadata.source, this.itemScope(r), this.sourceOf(p), "project"),
    );
    if (idx === -1) {
      if (state === "inherit") return;
      packages.push(this.overrideSource(r));
      idx = packages.length - 1;
    }
    let pkg = packages[idx] as Prefixed;
    if (typeof pkg === "string") pkg = { source: pkg };
    const pattern = this.packagePattern(r);
    const updated = (pkg[this.kind] ?? []).filter((entry) => stripPrefix(entry) !== pattern);
    if (state !== "inherit") updated.push(`${state === "load" ? "+" : "-"}${pattern}`);
    pkg[this.kind] = updated.length > 0 ? updated : undefined;
    if (!RESOURCE_KEYS.some((k) => pkg[k] !== undefined)) {
      if (pkg.autoload === false) packages.splice(idx, 1);
      else packages[idx] = pkg.source;
    } else packages[idx] = pkg;
    this.sm.setProjectPackages(packages);
  }

  private overrideSource(r: ResolvedResource): PackageSource {
    const source = r.metadata.source;
    if (!isLocalPath(source)) return { source, autoload: false };
    const abs = resolvePath(source, this.topLevelBaseDir(this.itemScope(r)));
    return { source: relative(this.topLevelBaseDir("project"), abs) || ".", autoload: false };
  }

  async flush() {
    await this.sm.flush();
    const errors = this.sm.drainErrors();
    if (errors.length > 0) throw errors[0].error;
  }
}

/** Current project-layer override state, computed like `pi config --local` shows it. */
export function projectStateOf(
  kind: ResourceKind,
  r: ResolvedResource,
  cwd: string,
  projectSettings: { packages?: PackageSource[]; skills?: string[]; extensions?: string[] },
  agent: string,
): ProjectState {
  const scope = r.metadata.scope === "project" ? "project" : "user";
  const topBase = (s: "user" | "project") => (s === "project" ? join(cwd, ".pi") : agent);
  const fromEntries = (entries: string[], patterns: Set<string>, emptyIsUnload: boolean): ProjectState => {
    if (entries.length === 0 && emptyIsUnload) return "unload";
    let state: ProjectState = "inherit";
    for (const e of entries) {
      if (!patterns.has(stripPrefix(e))) continue;
      state = e.startsWith("!") || e.startsWith("-") ? "unload" : "load";
    }
    return state;
  };
  if (r.metadata.origin === "top-level") {
    const forScope =
      scope === "project" ? relative(r.metadata.baseDir ?? topBase("project"), r.path) : r.path;
    const patterns = new Set([forScope, r.path, relative(topBase("project"), r.path)]);
    if (r.metadata.baseDir) patterns.add(relative(r.metadata.baseDir, r.path));
    return fromEntries(projectSettings[kind] ?? [], patterns, false);
  }
  const pkg = (projectSettings.packages ?? []).find((p) => {
    const src = typeof p === "string" ? p : p.source;
    if (src === r.metadata.source) return true;
    if (!isLocalPath(src) || !isLocalPath(r.metadata.source)) return false;
    return resolvePath(src, topBase("project")) === resolvePath(r.metadata.source, topBase(scope));
  });
  if (!pkg || typeof pkg !== "object") return "inherit";
  const entries = pkg[kind];
  if (entries === undefined) return "inherit";
  return fromEntries(
    entries,
    new Set([relative(r.metadata.baseDir ?? dirname(r.path), r.path)]),
    pkg.autoload !== false,
  );
}

export async function setResourceState(req: ResourceToggle): Promise<void> {
  if (req.scope === "project" && !req.cwd) throw new Error("Project scope needs a project directory");
  const t = await Toggler.create(req.kind, req.scope, req.cwd);
  for (const path of req.paths) {
    const r = t.item(path);
    if (req.scope === "project") t.setProject(r, req.state);
    else if (req.state === "inherit") throw new Error("Global scope has no inherit state");
    else t.setGlobal(r, req.state === "load");
  }
  await t.flush();
}

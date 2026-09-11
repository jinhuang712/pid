import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Toggles write into a throwaway agent dir (PI_CODING_AGENT_DIR) and a throwaway project,
 * then Pi's own resolver is asked what it would load. Nothing under the real ~/.pi is touched.
 */
let agent: string;
let project: string;
let pkgDir: string;
const prevAgentDir = process.env.PI_CODING_AGENT_DIR;

const json = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const skill = (dir: string, name: string) => {
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(join(dir, name, "SKILL.md"), `---\nname: ${name}\ndescription: ${name} skill\n---\nbody\n`);
  return join(dir, name, "SKILL.md");
};

beforeAll(() => {
  const root = mkdtempSync(join(tmpdir(), "pid-toggles-"));
  agent = join(root, "agent");
  project = join(root, "project");
  pkgDir = join(root, "pkg");
  mkdirSync(join(agent, "extensions", "loose"), { recursive: true });
  writeFileSync(join(agent, "extensions", "loose", "index.ts"), "export default function () {}\n");
  writeFileSync(join(agent, "extensions", "flat.ts"), "export default function () {}\n");
  skill(join(agent, "skills"), "alpha");
  skill(join(project, ".pi", "skills"), "beta");
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(join(pkgDir, "package.json"), JSON.stringify({ name: "pkg", pi: { extensions: ["ext.ts"], skills: ["skills"] } }));
  writeFileSync(join(pkgDir, "ext.ts"), "export default function () {}\n");
  skill(join(pkgDir, "skills"), "gamma");
  writeFileSync(join(agent, "settings.json"), JSON.stringify({ packages: [pkgDir] }, null, 2));
  writeFileSync(
    join(agent, "mcp.json"),
    JSON.stringify({ mcpServers: { srv: { command: "echo", args: ["hi"] }, off: { command: "x", disabled: true } } }),
  );
  process.env.PI_CODING_AGENT_DIR = agent;
});
afterAll(() => {
  if (prevAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = prevAgentDir;
});

describe("skills and extensions", () => {
  it("resolves everything enabled to begin with", async () => {
    const { listExtensions, listSkills } = await import("../src/main/pi/ecosystem");
    const skills = await listSkills(project);
    expect(skills.map((s) => [s.name, s.enabled, s.projectState])).toEqual([
      ["alpha", true, "inherit"],
      ["beta", true, "inherit"],
      ["gamma", true, "inherit"],
    ]);
    const ext = await listExtensions(project);
    expect(ext.map((e) => [e.name, e.scope, e.enabled]).sort()).toEqual([
      ["flat", "user", true],
      ["loose", "user", true],
      ["pkg", "package", true],
    ]);
  });

  it("global unload writes -pattern the way pi config does", async () => {
    const { setResourceState } = await import("../src/main/pi/toggles");
    const { listSkills, listExtensions } = await import("../src/main/pi/ecosystem");
    await setResourceState({ kind: "skills", paths: [join(agent, "skills", "alpha", "SKILL.md")], scope: "global", state: "unload" });
    expect(json(join(agent, "settings.json")).skills).toEqual(["-skills/alpha/SKILL.md"]);
    expect((await listSkills()).find((s) => s.name === "alpha")?.enabled).toBe(false);

    await setResourceState({ kind: "extensions", paths: [join(agent, "extensions", "loose", "index.ts")], scope: "global", state: "unload" });
    expect(json(join(agent, "settings.json")).extensions).toEqual(["-extensions/loose/index.ts"]);
    expect((await listExtensions()).find((e) => e.name === "loose")?.enabled).toBe(false);

    // Flipping back replaces the entry instead of stacking a second one.
    await setResourceState({ kind: "skills", paths: [join(agent, "skills", "alpha", "SKILL.md")], scope: "global", state: "load" });
    expect(json(join(agent, "settings.json")).skills).toEqual(["+skills/alpha/SKILL.md"]);
  });

  it("package resources become an object-form packages entry", async () => {
    const { setResourceState } = await import("../src/main/pi/toggles");
    const { listSkills, readPiHome } = await import("../src/main/pi/ecosystem");
    await setResourceState({ kind: "skills", paths: [join(pkgDir, "skills", "gamma", "SKILL.md")], scope: "global", state: "unload" });
    expect(json(join(agent, "settings.json")).packages).toEqual([{ source: pkgDir, skills: ["-skills/gamma/SKILL.md"] }]);
    expect(readPiHome().packages).toEqual([pkgDir]); // object form still counts as installed
    expect((await listSkills()).find((s) => s.name === "gamma")?.enabled).toBe(false);
    await setResourceState({ kind: "skills", paths: [join(pkgDir, "skills", "gamma", "SKILL.md")], scope: "global", state: "load" });
  });

  it("project scope layers load / unload / inherit over the global state", async () => {
    const { setResourceState } = await import("../src/main/pi/toggles");
    const { listSkills } = await import("../src/main/pi/ecosystem");
    const alpha = join(agent, "skills", "alpha", "SKILL.md");
    await setResourceState({ kind: "skills", paths: [alpha], scope: "project", cwd: project, state: "unload" });
    const ps = json(join(project, ".pi", "settings.json"));
    expect(ps.skills).toEqual([alpha, `-${alpha}`]);
    let view = (await listSkills(project)).find((s) => s.name === "alpha");
    expect(view?.enabled).toBe(false);
    expect(view?.projectState).toBe("unload");
    // The global file is untouched by a project write.
    expect(json(join(agent, "settings.json")).skills).toEqual(["+skills/alpha/SKILL.md"]);

    await setResourceState({ kind: "skills", paths: [alpha], scope: "project", cwd: project, state: "inherit" });
    expect(json(join(project, ".pi", "settings.json")).skills ?? []).toEqual([]);
    view = (await listSkills(project)).find((s) => s.name === "alpha");
    expect(view?.enabled).toBe(true);
    expect(view?.projectState).toBe("inherit");

    // A project-owned skill is disabled with a pattern relative to .pi/
    const beta = join(project, ".pi", "skills", "beta", "SKILL.md");
    await setResourceState({ kind: "skills", paths: [beta], scope: "project", cwd: project, state: "unload" });
    expect(json(join(project, ".pi", "settings.json")).skills).toEqual(["-skills/beta/SKILL.md"]);
    expect((await listSkills(project)).find((s) => s.name === "beta")?.enabled).toBe(false);
  });

  it("refuses to toggle a project skill in global scope", async () => {
    const { setResourceState } = await import("../src/main/pi/toggles");
    const beta = join(project, ".pi", "skills", "beta", "SKILL.md");
    await expect(setResourceState({ kind: "skills", paths: [beta], scope: "global", cwd: project, state: "load" })).rejects.toThrow();
  });
});

describe("mcp", () => {
  it("reads the disabled flag and merges layers by name", async () => {
    const { readMcp } = await import("../src/main/pi/ecosystem");
    const v = readMcp(project);
    expect(v.servers.map((s) => [s.name, s.disabled])).toEqual([
      ["srv", false],
      ["off", true],
    ]);
  });

  it("global toggle edits the entry in place", async () => {
    const { setMcpDisabled } = await import("../src/main/pi/toggles");
    const { readMcp } = await import("../src/main/pi/ecosystem");
    setMcpDisabled({ name: "srv", scope: "global", disabled: true });
    expect(json(join(agent, "mcp.json")).mcpServers.srv).toEqual({ command: "echo", args: ["hi"], disabled: true });
    setMcpDisabled({ name: "off", scope: "global", disabled: false });
    expect(json(join(agent, "mcp.json")).mcpServers.off).toEqual({ command: "x" });
    expect(readMcp().servers.map((s) => [s.name, s.disabled])).toEqual([
      ["srv", true],
      ["off", false],
    ]);
  });

  it("project toggle writes a disabled-only override and never copies the definition", async () => {
    const { setMcpDisabled } = await import("../src/main/pi/toggles");
    const { readMcp } = await import("../src/main/pi/ecosystem");
    // srv is globally disabled now; enabling it for the project needs an explicit false.
    setMcpDisabled({ name: "srv", scope: "project", cwd: project, disabled: false });
    expect(json(join(project, ".pi", "mcp.json")).mcpServers.srv).toEqual({ disabled: false });
    let s = readMcp(project).servers.find((x) => x.name === "srv");
    expect(s?.disabled).toBe(false);
    expect(s?.projectDisabled).toBe(false);
    expect(s?.command).toBe("echo");

    setMcpDisabled({ name: "off", scope: "project", cwd: project, disabled: true });
    expect(json(join(project, ".pi", "mcp.json")).mcpServers.off).toEqual({ disabled: true });
    // Re-enabling a server that lower layers do not disable removes the override entirely.
    setMcpDisabled({ name: "off", scope: "project", cwd: project, disabled: false });
    expect(json(join(project, ".pi", "mcp.json")).mcpServers.off).toBeUndefined();
    s = readMcp(project).servers.find((x) => x.name === "off");
    expect(s?.projectDisabled).toBeUndefined();
  });
});

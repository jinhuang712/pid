import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { listFiles } from "../src/main/files";
import { gitRootRelative, globMatch, ignoredDir, ignoredFile } from "../src/shared/glob";

const touch = (dir: string, ...paths: string[]) => {
  for (const p of paths) {
    const full = join(dir, p);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, "");
  }
};

describe("globMatch", () => {
  it("treats * as crossing a slash, so *.log means every log", () => {
    expect(globMatch("*.log", "a/b/c.log")).toBe(true);
    expect(globMatch("*.log", "c.log")).toBe(true);
    expect(globMatch("*.log", "c.logs")).toBe(false);
  });
  it("reads a trailing slash as a directory, matching the directory itself and nothing else", () => {
    expect(globMatch("tmp/", "tmp")).toBe(true);
    expect(globMatch("tmp/", "tmp/x")).toBe(false);
    expect(ignoredDir("tmp", { ignorePatterns: ["tmp/"] })).toBe(true);
  });
  it("matches one character with ? and leaves regex metacharacters alone", () => {
    expect(globMatch("a?c", "abc")).toBe(true);
    expect(globMatch("a?c", "ac")).toBe(false);
    expect(globMatch("a?c", "a/c")).toBe(true);
    expect(globMatch("a.txt", "axtxt")).toBe(false);
  });
  it("never matches on a broken pattern instead of throwing", () => {
    expect(globMatch("[", "anything")).toBe(false);
  });
});

describe("the ignore rules", () => {
  it("keeps build output and VCS metadata out even with no settings", () => {
    expect(ignoredDir("node_modules", {})).toBe(true);
    expect(ignoredDir("a/node_modules", {})).toBe(true);
    expect(ignoredDir(".git", {})).toBe(true);
    expect(ignoredDir("src", {})).toBe(false);
  });
  it("hides dot-files by default and shows them when asked", () => {
    expect(ignoredFile(".DS_Store", {})).toBe(true);
    expect(ignoredFile("a/.hidden/b.txt", {})).toBe(true);
    expect(ignoredFile(".DS_Store", { showHidden: true })).toBe(false);
  });
  it("lets a user pattern match by name whatever the depth, or by path", () => {
    expect(ignoredFile("docs/draft.md", { ignorePatterns: ["draft.md"] })).toBe(true);
    expect(ignoredFile("a/b/draft.md", { ignorePatterns: ["draft.md"] })).toBe(true);
    // A bare name means that name anywhere: the wider reading is the one a person expects,
    // and the prompt shows the paths before anything is sent.
    expect(ignoredFile("docs/foo.md", { ignorePatterns: ["*.md"] })).toBe(true);
    expect(ignoredFile("docs/final.txt", { ignorePatterns: ["*.md"] })).toBe(false);
    expect(ignoredFile("docs/final.md", { ignorePatterns: ["docs/keep.md"] })).toBe(false);
  });
  it("treats blank lines and comments as no pattern at all", () => {
    expect(ignoredFile("keep.txt", { ignorePatterns: ["", "  ", "# a note"] })).toBe(false);
  });
});

describe("gitRootRelative", () => {
  it("re-roots paths under the queried subdirectory of a repo", () => {
    expect(gitRootRelative("packages/a", ["packages/a/index.ts", "packages/b/x.ts"])).toEqual(["index.ts"]);
  });
  it("keeps the repo root's own listing untouched", () => {
    expect(gitRootRelative("", ["a.ts", "b/c.ts"])).toEqual(["a.ts", "b/c.ts"]);
  });
  it("returns nothing for a subdirectory the repo has no files in", () => {
    expect(gitRootRelative("empty", ["a.ts"])).toEqual([]);
  });
});

describe("listFiles (temp dirs)", () => {
  it("walks a plain folder, skipping the ignored subtrees and hidden files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pid-files-"));
    touch(dir, "a.txt", "src/b.txt", "node_modules/pkg/index.js", ".DS_Store", "notes/.keep.md");
    expect((await listFiles(dir)).sort()).toEqual(["a.txt", "src/b.txt"]);
    expect((await listFiles(dir, { showHidden: true })).sort()).toEqual([
      ".DS_Store",
      "a.txt",
      "notes/.keep.md",
      "src/b.txt",
    ]);
    expect((await listFiles(dir, { ignorePatterns: ["src/"] })).sort()).toEqual(["a.txt"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("answers from git inside a repo, and re-roots a subdirectory listing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pid-files-git-"));
    execFileSync("git", ["init", "-q", "-b", "main", dir]);
    writeFileSync(join(dir, ".gitignore"), "*.log\n");
    touch(dir, "root.txt", "pkg/inside.ts", "build/out.log");
    execFileSync("git", ["add", "-A"], { cwd: dir });
    // git's own view: tracked plus untracked, minus .gitignore, minus PID's hidden and noise rules
    expect((await listFiles(dir)).sort()).toEqual(["pkg/inside.ts", "root.txt"]);
    expect((await listFiles(dir, { showHidden: true })).sort()).toEqual([
      ".gitignore",
      "pkg/inside.ts",
      "root.txt",
    ]);
    // A listing from inside the repo re-roots git's paths, or the composer could not open them
    expect((await listFiles(join(dir, "pkg"))).sort()).toEqual(["inside.ts"]);
    expect(await listFiles(join(dir, "pkg"), { ignorePatterns: ["*.ts"] })).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });
});

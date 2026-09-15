import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdir, realpath, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type { PathInfo } from "@shared/files";
import { gitRootRelative, ignoredDir, ignoredFile, type ListOptions } from "@shared/glob";
import { nativeImage } from "electron";

const execFileP = promisify(execFile);
/** A pathological tree should not freeze the renderer's fuzzy filter; git's own listings stop here too. */
const LIMIT = 20000;

/**
 * Files under a folder, as relative posix paths, narrowed by the user's file-search settings.
 * A git repo answers through git's own view — tracked plus untracked, `.gitignore` respected —
 * because that is the list a person sees in their editor. Anything else walks the tree.
 */
export async function listFiles(cwd: string, opts: ListOptions = {}): Promise<string[]> {
  // Canonicalised once: macOS reports /tmp and /var as their /private twins, git answers with the
  // resolved spelling, and comparing the two would look like a repo somewhere else entirely.
  const abs = await canonical(cwd);
  const files = await gitFiles(abs, opts);
  if (files !== undefined) return files.slice(0, LIMIT);
  return await walkFiles(abs, opts);
}

/** A path that exists resolves; one that does not (or is denied) is left as told. */
async function canonical(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}

/** `undefined` means "not a repo (or git failed)", which sends the caller to the walker. */
async function gitFiles(abs: string, opts: ListOptions): Promise<string[] | undefined> {
  let toplevel: string;
  let stdout: string;
  try {
    const r = await execFileP("git", ["rev-parse", "--show-toplevel"], { cwd: abs });
    toplevel = r.stdout.trim();
    if (!toplevel) return undefined;
    const listed = await execFileP("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
      cwd: toplevel,
      maxBuffer: 64 * 1024 * 1024,
    });
    stdout = listed.stdout;
  } catch {
    return undefined;
  }
  // Paths arrive relative to the repo root; the caller can only open paths under its own folder.
  const prefix = relative(await canonical(toplevel), abs)
    .split("\\")
    .join("/");
  return gitRootRelative(prefix, stdout.split("\0").filter(Boolean)).filter((f) => !ignoredFile(f, opts));
}

/** The non-git path: everything readable under the folder except the ignored subtrees. */
async function walkFiles(root: string, opts: ListOptions): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string) => {
    if (out.length >= LIMIT) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= LIMIT) return;
      const rel = relative(root, join(dir, e.name)).split("\\").join("/");
      if (e.isDirectory() || (e.isSymbolicLink() && (await isDirectory(join(dir, e.name))))) {
        if (!ignoredDir(rel, opts)) await walk(join(dir, e.name));
      } else if (e.isFile() || e.isSymbolicLink()) {
        if (!ignoredFile(rel, opts)) out.push(rel);
      }
    }
  };
  await walk(root);
  return out;
}
async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/** What the composer needs to draw a chip: exists, directory or file, size. Never reads content. */
export async function statPaths(paths: string[]): Promise<PathInfo[]> {
  return Promise.all(
    paths.map(async (path) => {
      try {
        const s = await stat(path);
        if (s.isDirectory()) {
          const entries = await readdir(path).catch(() => []);
          return { path, exists: true, isDirectory: true, size: entries.length };
        }
        return { path, exists: true, isDirectory: false, size: s.size };
      } catch {
        return { path, exists: false, isDirectory: false, size: 0 };
      }
    }),
  );
}

const THUMB = 160;

/**
 * A small in-memory preview for the chip. QuickLook on macOS renders images and PDFs alike;
 * elsewhere plain images are decoded. Nothing is written to disk.
 */
export async function thumbnail(path: string): Promise<string | undefined> {
  try {
    const img = await nativeImage.createThumbnailFromPath(path, { width: THUMB, height: THUMB });
    if (!img.isEmpty()) return img.toDataURL();
  } catch {
    // fall through to a plain decode
  }
  try {
    const img = nativeImage.createFromPath(path);
    if (img.isEmpty()) return undefined;
    const { width, height } = img.getSize();
    const scale = Math.min(1, THUMB / Math.max(width, height));
    return img.resize({ width: Math.round(width * scale), height: Math.round(height * scale) }).toDataURL();
  } catch {
    return undefined;
  }
}

/** A pasted image has no path. Do what the Pi terminal does: write it to the OS temp dir and attach that path. */
export async function saveClipboardImage(bytes: Uint8Array, mime: string): Promise<string> {
  const ext =
    mime === "image/jpeg" ? "jpg" : mime === "image/gif" ? "gif" : mime === "image/webp" ? "webp" : "png";
  const path = join(tmpdir(), `pi-clipboard-${randomUUID()}.${ext}`);
  await writeFile(path, bytes);
  return path;
}

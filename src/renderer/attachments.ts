import type { PathInfo } from "@shared/files";
import { SKILL_BLOCK_RE } from "@shared/prompt-blocks";

/**
 * Attachments are absolute paths, nothing more. PID never copies bytes: the path goes into the
 * prompt as visible text and Pi reads it with its own tools (`read` handles images natively),
 * exactly as the Pi terminal does when an image is pasted.
 */
export type AttachmentKind = "image" | "pdf" | "folder" | "file";

export interface Attachment {
  path: string;
  kind: AttachmentKind;
  name: string;
  /** Bytes for files, entry count for folders. Unknown until stat returns. */
  size?: number;
  missing?: boolean;
}

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "heic", "tif", "tiff", "svg"]);

export function kindOf(info: PathInfo): AttachmentKind {
  if (info.isDirectory) return "folder";
  const ext = info.path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (IMAGE_EXT.has(ext)) return "image";
  return "file";
}

export function toAttachment(info: PathInfo): Attachment {
  return {
    path: info.path,
    kind: kindOf(info),
    name: info.path.split("/").filter(Boolean).pop() ?? info.path,
    size: info.size,
    missing: !info.exists,
  };
}

export function fmtSize(a: Attachment): string {
  if (a.size === undefined) return "";
  if (a.kind === "folder") return `${a.size} item${a.size === 1 ? "" : "s"}`;
  const n = a.size;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const ATTACHMENTS_OPEN = "<attachments>";
export const ATTACHMENTS_CLOSE = "</attachments>";

/**
 * The exact text appended to a message. One line per attachment: kind, then the absolute path.
 * Paths may contain spaces, so the kind is a fixed-width first word and the rest of the line is the path.
 */
export function renderAttachments(list: Attachment[]): string {
  if (list.length === 0) return "";
  const lines = list.map((a) => `${a.kind.padEnd(6)} ${a.path}`);
  return `${ATTACHMENTS_OPEN}\n${lines.join("\n")}\n${ATTACHMENTS_CLOSE}`;
}

export function appendAttachments(text: string, list: Attachment[]): string {
  const block = renderAttachments(list);
  if (!block) return text;
  return text ? `${text}\n\n${block}` : block;
}

/** Inverse of renderAttachments, for showing a sent message with its attachments as chips again. */
export function parseAttachments(text: string): { body: string; attachments: Attachment[] } {
  const start = text.lastIndexOf(ATTACHMENTS_OPEN);
  if (start < 0) return { body: text, attachments: [] };
  const end = text.indexOf(ATTACHMENTS_CLOSE, start);
  if (end < 0) return { body: text, attachments: [] };
  const inner = text.slice(start + ATTACHMENTS_OPEN.length, end);
  const attachments: Attachment[] = [];
  for (const raw of inner.split("\n")) {
    const m = /^(image|pdf|folder|file)\s+(\/.+)$/.exec(raw.trim());
    if (!m) continue;
    const kind = m[1] as AttachmentKind;
    const path = m[2];
    attachments.push({ path, kind, name: path.split("/").filter(Boolean).pop() ?? path });
  }
  const body = (text.slice(0, start) + text.slice(end + ATTACHMENTS_CLOSE.length)).trimEnd();
  return { body, attachments };
}

// ---- inline tokens: what gets highlighted in the composer and chipped in the timeline ----

export type Segment =
  | { type: "text"; text: string }
  | { type: "url"; text: string; href: string }
  | { type: "session"; text: string; token: string; label?: string }
  | { type: "mention"; text: string; path: string };

/** URL, then $token with an optional ("label") that expandReferences adds, then @path. Order matters: first match wins. */
const TOKEN_RE =
  /(https?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?])|(?<=^|\s)(\$[0-9a-f]{8})(?: \("((?:[^"\\]|\\.)*)"\))?|(?<=^|\s)(@\/?[^\s@]*[^\s@.,;:!?])/g;

export function segment(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ type: "text", text: text.slice(last, at) });
    if (m[1]) out.push({ type: "url", text: m[1], href: m[1] });
    else if (m[2]) out.push({ type: "session", text: m[0], token: m[2], label: m[3] });
    else if (m[4]) out.push({ type: "mention", text: m[4], path: m[4].slice(1) });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out;
}

export function urlsIn(text: string): string[] {
  const seen = new Set<string>();
  for (const s of segment(text)) if (s.type === "url") seen.add(s.href);
  return [...seen];
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ---- skill invocations in a sent message ----

export interface SentSkill {
  name: string;
  location: string;
  /** SKILL.md body as Pi inlined it. */
  text: string;
}

/**
 * Pi expands `/klook-status extra words` into the skill's full SKILL.md before it becomes the user
 * message, so that is all the transcript ever sees. Fold it back: the body is what the user
 * effectively typed (`/klook-status extra words`), the skill text becomes a collapsible chip.
 */
export function parseSkillBlock(text: string): { body: string; skill?: SentSkill } {
  const m = SKILL_BLOCK_RE.exec(text);
  if (!m) return { body: text };
  const args = (m[4] ?? "").trim();
  return {
    body: args ? `/${m[1]} ${args}` : `/${m[1]}`,
    skill: { name: m[1], location: m[2], text: m[3] },
  };
}

// ---- session reference blocks in a sent message ----

export interface SentReference {
  token: string;
  title: string;
  folder: string;
  scope: string;
  text: string;
}

const REF_INTRO = "\n\nReferenced sessions (explicitly attached by the user):\n";

/** Split the visible session-reference blocks off a sent message so they render as chips, not as XML. */
export function parseReferences(text: string): { body: string; references: SentReference[] } {
  const at = text.indexOf(REF_INTRO);
  if (at < 0) return { body: text, references: [] };
  const tail = text.slice(at + REF_INTRO.length);
  const references: SentReference[] = [];
  const re =
    /<session-reference token="([^"]*)" title="([^"]*)" folder="([^"]*)" scope="([^"]*)">\n?([\s\S]*?)\n?<\/session-reference>/g;
  for (const m of tail.matchAll(re)) {
    references.push({ token: m[1], title: m[2], folder: m[3], scope: m[4], text: m[5] });
  }
  if (references.length === 0) return { body: text, references: [] };
  return { body: text.slice(0, at), references };
}

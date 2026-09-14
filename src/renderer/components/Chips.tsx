import { type ReactNode, useEffect, useState } from "react";
import { type Attachment, fmtSize } from "../attachments";
import { bridge } from "../bridge";

/**
 * One chip grammar for everything the user brings into a message: attached paths, `$session`
 * references, links. The composer shows them removable; the timeline shows them as sent.
 *
 *   glyph · name · meta        24px tall, paper-3 ground, hairline border, 8px radius
 *   image/pdf tiles            56px square preview with the same border, badge for PDF
 */

export function Glyph({ kind }: { kind: Attachment["kind"] | "link" | "session" }) {
  const common = {
    width: 12,
    height: 12,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (kind) {
    case "folder":
      return (
        <svg {...common}>
          <title>folder</title>
          <path d="M2 4.5h4l1.5 1.5H14v7H2z" />
        </svg>
      );
    case "image":
      return (
        <svg {...common}>
          <title>image</title>
          <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
          <path d="m3 12 3.5-4 2.5 3 1.5-1.5L13 12" />
          <circle cx="10.5" cy="6" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "pdf":
      return (
        <svg {...common}>
          <title>pdf</title>
          <path d="M4 2h5.5L13 5.5V14H4z" />
          <path d="M9.5 2v3.5H13" />
          <path d="M6 11h4M6 8.5h2" />
        </svg>
      );
    case "link":
      return (
        <svg {...common}>
          <title>link</title>
          <path d="M6.5 9.5 9.5 6.5" />
          <path d="M7 4.5 8.5 3a2.5 2.5 0 0 1 3.5 3.5L10.5 8" />
          <path d="M9 11.5 7.5 13a2.5 2.5 0 0 1-3.5-3.5L5.5 8" />
        </svg>
      );
    case "session":
      return (
        <svg {...common}>
          <title>session</title>
          <path d="M3 3.5h10v7H7l-3 2.5v-2.5H3z" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <title>file</title>
          <path d="M4 2h5.5L13 5.5V14H4z" />
          <path d="M9.5 2v3.5H13" />
        </svg>
      );
  }
}

const CHIP_BASE =
  "group relative inline-flex items-center gap-1.5 h-6 pl-2 pr-2 rounded-lg bg-paper-3 border border-line text-[12px] text-ink";

export function Chip({
  glyph,
  label,
  meta,
  title,
  tone,
  onRemove,
  onClick,
  href,
  children,
  wide,
}: {
  glyph: ReactNode;
  label: ReactNode;
  meta?: ReactNode;
  /** Session chips carry a token and a title; give them more room before truncating. */
  wide?: boolean;
  title?: string;
  tone?: "warn" | "danger";
  onRemove?: () => void;
  onClick?: () => void;
  href?: string;
  children?: ReactNode;
}) {
  const glyphTone = tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : "text-ink-2";
  const inner = (
    <>
      <span className={`shrink-0 ${glyphTone}`}>{glyph}</span>
      <span className="truncate">{label}</span>
      {meta && <span className="shrink-0 text-ink-3 tabular-nums">{meta}</span>}
      {children}
    </>
  );
  const pad = onRemove ? "group-hover:pr-6" : "";
  const CHIP = `${CHIP_BASE} ${wide ? "max-w-96" : "max-w-64"}`;
  if (href)
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        title={title}
        className={`${CHIP} ${pad} hover:border-line-2 hover:text-ink no-underline`}
      >
        {inner}
        {onRemove && <Remove onClick={onRemove} />}
      </a>
    );
  if (onClick)
    return (
      <span className={`${CHIP} ${pad}`} title={title}>
        <button type="button" onClick={onClick} className="contents text-left hover:text-ink">
          {inner}
        </button>
        {onRemove && <Remove onClick={onRemove} />}
      </span>
    );
  return (
    <span className={`${CHIP} ${pad}`} title={title}>
      {inner}
      {onRemove && <Remove onClick={onRemove} />}
    </span>
  );
}

function Remove({ onClick, tile }: { onClick: () => void; tile?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick();
      }}
      title="Remove"
      aria-label="Remove"
      className={`absolute flex items-center justify-center rounded-full text-ink-2 hover:text-ink opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity ${
        tile
          ? "top-1 right-1 w-4 h-4 bg-paper-2/90 shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
          : "right-1 top-1/2 -translate-y-1/2 w-4 h-4 hover:bg-paper-4"
      }`}
    >
      <svg width="8" height="8" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2" fill="none">
        <title>remove</title>
        <path d="M3 3l10 10M13 3L3 13" />
      </svg>
    </button>
  );
}

/** Data-URL preview from the main process; cached per path for the life of the window. */
const thumbs = new Map<string, Promise<string | undefined>>();
export function useThumbnail(path: string, enabled: boolean): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!enabled) return;
    let p = thumbs.get(path);
    if (!p) {
      p = bridge.files.thumbnail(path);
      thumbs.set(path, p);
    }
    let live = true;
    void p.then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [path, enabled]);
  return url;
}

/** An attached path. Images and PDFs become tiles when a preview exists; everything else is a chip. */
export function AttachmentChip({
  a,
  onRemove,
  onOpen,
}: {
  a: Attachment;
  onRemove?: () => void;
  onOpen?: () => void;
}) {
  const visual = a.kind === "image" || a.kind === "pdf";
  const thumb = useThumbnail(a.path, visual && !a.missing);
  const title = a.missing ? `${a.path} (missing)` : a.path;
  if (visual && thumb) {
    return (
      <span
        className="group relative inline-block w-14 h-14 rounded-[10px] border border-line bg-paper-3 overflow-hidden"
        title={title}
      >
        <button
          type="button"
          onClick={onOpen}
          className={`block w-full h-full ${onOpen ? "cursor-pointer" : "cursor-default"}`}
          tabIndex={onOpen ? 0 : -1}
        >
          <img src={thumb} alt={a.name} className="w-full h-full object-cover" draggable={false} />
        </button>
        {a.kind === "pdf" && (
          <span className="absolute left-1 bottom-1 h-4 px-1 rounded bg-paper-2/90 text-[9.5px] font-medium tracking-wide text-ink-2 leading-4">
            PDF
          </span>
        )}
        {onRemove && <Remove onClick={onRemove} tile />}
      </span>
    );
  }
  return (
    <Chip
      glyph={<Glyph kind={a.kind} />}
      label={a.name + (a.kind === "folder" ? "/" : "")}
      meta={a.missing ? "missing" : fmtSize(a)}
      title={title}
      tone={a.missing ? "danger" : undefined}
      onRemove={onRemove}
      onClick={onOpen}
    />
  );
}

import { useState } from "react";
import type { Attachment } from "../attachments";
import {
  estimateTokens,
  refLabel,
  renderReference,
  type SessionReference,
  shortId,
} from "../session-reference";
import { AttachmentChip, Chip, Glyph, LinkChip } from "./Chips";

/**
 * Everything the next message carries besides its words, in one row inside the composer:
 * attached paths, `$session` references, and the links found in the draft. Attachments and
 * references can be removed here; links are just the text and go away with it.
 */
export function ContextTray({
  attachments,
  refs,
  urls,
  onRemoveAttachment,
  onRemoveRef,
}: {
  attachments: Attachment[];
  refs: SessionReference[];
  urls: string[];
  onRemoveAttachment: (path: string) => void;
  onRemoveRef: (token: string) => void;
}) {
  const [openToken, setOpenToken] = useState<string>();
  if (attachments.length + refs.length + urls.length === 0) return null;
  const open = refs.find((r) => r.token === openToken);
  const rendered = open ? renderReference(open) : undefined;
  return (
    <div className="px-3 pt-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {attachments.map((a) => (
          <AttachmentChip
            key={a.path}
            a={a}
            onRemove={() => onRemoveAttachment(a.path)}
            onOpen={() => void window.bridge.shell.openPath(a.path)}
          />
        ))}
        {refs.map((r) => {
          const rr = renderReference(r);
          const label = refLabel(r.session);
          const isOpen = openToken === r.token;
          return (
            <Chip
              key={r.token}
              glyph={<Glyph kind="session" />}
              tone="warn"
              label={
                <>
                  <span className="font-mono text-warn">${shortId(r.session)}</span> <span>{label}</span>
                </>
              }
              meta={`${rr.included}/${rr.total} · ~${estimateTokens(rr.chars).toLocaleString()} tok`}
              title={`${r.session.cwd}\nClick to inspect the exact text that will be sent`}
              onClick={() => setOpenToken(isOpen ? undefined : r.token)}
              onRemove={() => onRemoveRef(r.token)}
              wide
            />
          );
        })}
        {urls.map((u) => (
          <LinkChip key={u} href={u} />
        ))}
      </div>
      {rendered && open && (
        <div className="mt-2 rounded-lg border border-line bg-paper">
          <div className="px-3 h-7 flex items-center justify-between text-xs text-ink-3 border-b border-line">
            <span>
              Appended to your message as-is · {rendered.included} of {rendered.total} messages
            </span>
            <button type="button" onClick={() => setOpenToken(undefined)} className="hover:text-ink">
              hide
            </button>
          </div>
          <pre className="px-3 py-2 text-xs text-ink-2 whitespace-pre-wrap max-h-56 overflow-y-auto font-mono">
            {rendered.text}
          </pre>
        </div>
      )}
    </div>
  );
}

import { useCallback, useMemo, useReducer } from "react";
import type { Attachment } from "../attachments";
import type { LinkRef } from "../links";
import type { SessionReference } from "../session-reference";

/**
 * What the user has typed but not yet sent, per session. Each open session (and the entry view,
 * under HOME_SCOPE) keeps its own draft, `$session` references, folded links, and attachments, so
 * switching sessions never carries context from one conversation into another.
 */
export interface ComposerDraft {
  draft: string;
  refs: SessionReference[];
  attachments: Attachment[];
  /** Full hrefs behind the "🔗host/…" tokens in the draft. */
  links: LinkRef[];
}

export type ComposerScopes = Record<string, ComposerDraft>;

/** Scope used when no session is active: the entry view's composer. */
export const HOME_SCOPE = "home";

export const emptyDraft = (): ComposerDraft => ({ draft: "", refs: [], attachments: [], links: [] });

export type ComposerAction =
  | { type: "draft"; scope: string; text: string | ((d: string) => string) }
  | { type: "add-ref"; scope: string; ref: SessionReference }
  | { type: "remove-ref"; scope: string; token: string }
  | { type: "add-attachments"; scope: string; attachments: Attachment[] }
  | { type: "remove-attachment"; scope: string; path: string }
  | { type: "add-links"; scope: string; links: LinkRef[] }
  /** After a successful send: drop what went out, keep anything added meanwhile. */
  | {
      type: "consume";
      scope: string;
      refs: SessionReference[];
      attachments: Attachment[];
      links: LinkRef[];
    }
  /** Restore the draft after a failed send without clobbering text typed since. */
  | { type: "restore-draft"; scope: string; text: string }
  /** A pending placeholder became a live process: its draft follows the new key. */
  | { type: "move"; from: string; to: string }
  | { type: "clear"; scope: string };

export function composerReducer(s: ComposerScopes, a: ComposerAction): ComposerScopes {
  switch (a.type) {
    case "move": {
      if (a.from === a.to || !s[a.from]) return s;
      const { [a.from]: moved, ...rest } = s;
      return { ...rest, [a.to]: moved };
    }
    case "clear": {
      if (!s[a.scope]) return s;
      const { [a.scope]: _gone, ...rest } = s;
      return rest;
    }
    default:
      return { ...s, [a.scope]: reduceDraft(s[a.scope] ?? emptyDraft(), a) };
  }
}

function reduceDraft(d: ComposerDraft, a: ComposerAction): ComposerDraft {
  switch (a.type) {
    case "draft":
      return { ...d, draft: typeof a.text === "function" ? a.text(d.draft) : a.text };
    case "add-ref":
      return { ...d, refs: [...d.refs.filter((r) => r.token !== a.ref.token), a.ref] };
    case "remove-ref":
      return { ...d, refs: d.refs.filter((r) => r.token !== a.token) };
    case "add-attachments": {
      const have = new Set(d.attachments.map((x) => x.path));
      return { ...d, attachments: [...d.attachments, ...a.attachments.filter((x) => !have.has(x.path))] };
    }
    case "remove-attachment":
      return { ...d, attachments: d.attachments.filter((x) => x.path !== a.path) };
    case "add-links": {
      const have = new Set(d.links.map((l) => l.display));
      return { ...d, links: [...d.links, ...a.links.filter((l) => !have.has(l.display))] };
    }
    case "consume": {
      const refs = new Set(a.refs.map((r) => r.token));
      const paths = new Set(a.attachments.map((x) => x.path));
      const links = new Set(a.links.map((l) => l.display));
      return {
        ...d,
        refs: d.refs.filter((r) => !refs.has(r.token)),
        attachments: d.attachments.filter((x) => !paths.has(x.path)),
        links: d.links.filter((l) => !links.has(l.display)),
      };
    }
    case "restore-draft":
      return { ...d, draft: d.draft ? `${a.text}\n${d.draft}` : a.text };
    default:
      return d;
  }
}

/** Per-scope composer state with actions bound to the given scope. */
export function useComposer(scope: string) {
  const [scopes, dispatch] = useReducer(composerReducer, {} as ComposerScopes);
  const current = scopes[scope] ?? EMPTY;
  const setDraft = useCallback(
    (text: string | ((d: string) => string)) => dispatch({ type: "draft", scope, text }),
    [scope],
  );
  const api = useMemo(
    () => ({
      addRef: (ref: SessionReference) => dispatch({ type: "add-ref", scope, ref }),
      removeRef: (token: string) => dispatch({ type: "remove-ref", scope, token }),
      addAttachments: (attachments: Attachment[]) =>
        dispatch({ type: "add-attachments", scope, attachments }),
      removeAttachment: (path: string) => dispatch({ type: "remove-attachment", scope, path }),
      addLinks: (links: LinkRef[]) => dispatch({ type: "add-links", scope, links }),
      consume: (refs: SessionReference[], attachments: Attachment[], links: LinkRef[]) =>
        dispatch({ type: "consume", scope, refs, attachments, links }),
      restoreDraft: (text: string) => dispatch({ type: "restore-draft", scope, text }),
    }),
    [scope],
  );
  /** Scope-free lifecycle plumbing; stable so callbacks that capture them need not re-bind. */
  const move = useCallback((from: string, to: string) => dispatch({ type: "move", from, to }), []);
  const clear = useCallback((s: string) => dispatch({ type: "clear", scope: s }), []);
  return { ...current, setDraft, ...api, move, clear, scope };
}

const EMPTY = emptyDraft();

/**
 * The kinds of structured widget PID can read, and how to read each one.
 *
 * This table is the whole of PID's knowledge about extension presentation. The reducer walks it;
 * nothing else in PID names a kind of product, asks whether a particular extension is installed, or
 * branches on one being there. Supporting a new kind is an entry here plus something to draw it —
 * not a condition threaded through the window.
 *
 * A kind is a shape of data, never a product: `page` is "here is a list of things, with switches
 * and buttons", whoever wants one; `binding` is "this session belongs to that working tree".
 */

import { type ExtensionPage, parseExtensionPage } from "./extension-page";
import { parseWidgetKey } from "./extension-widgets";
import { parseWorktree, type WorktreeBinding } from "./worktree";

/** What each kind parses to. Adding a member here is what makes a kind exist. */
interface KindData {
  binding: WorktreeBinding;
  page: ExtensionPage;
}

export type Kind = keyof KindData;

type Parsers = { [K in Kind]: (lines: string[] | undefined) => KindData[K] | undefined };

const PARSE: Parsers = {
  binding: parseWorktree,
  page: parseExtensionPage,
};

export const KINDS = Object.keys(PARSE) as Kind[];

/**
 * Everything a session has published, by kind and then by publisher.
 *
 * Two extensions may both publish a kind — two pages — so the namespace from the
 * widget key is kept. PID reads the namespace as an opaque key and never matches on it.
 */
export type Published = { [K in Kind]?: Record<string, KindData[K]> };

/** The first publisher's value, for a kind where one is all the window can show. */
export function only<K extends Kind>(published: Published, kind: K): KindData[K] | undefined {
  const byNs = (published[kind] ?? {}) as Record<string, KindData[K]>;
  return Object.values(byNs)[0];
}

/** Every publisher's value for a kind, in the order the keys were added. */
export function each<K extends Kind>(published: Published, kind: K): [string, KindData[K]][] {
  return Object.entries((published[kind] ?? {}) as Record<string, KindData[K]>);
}

/**
 * Read a widget into the kind it claims, or undefined when it claims none PID knows.
 *
 * Version 1 only, deliberately: a `page/v2` PID has not been taught is not a `page/v1` with extra
 * fields, and guessing would be the start of a compatibility layer.
 */
export function readKind(
  key: string,
  lines: string[] | undefined,
): { kind: Kind; ns: string; data: unknown } | undefined {
  const parsed = parseWidgetKey(key);
  if (!parsed || parsed.version !== 1) return undefined;
  const kind = parsed.kind as Kind;
  const parse = PARSE[kind] as ((l: string[] | undefined) => unknown) | undefined;
  return parse ? { kind, ns: parsed.ns, data: parse(lines) } : undefined;
}

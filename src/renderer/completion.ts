import type { SessionSummary } from "@shared/sessions";
import { useCallback, useRef, useState } from "react";
import { bridge } from "./bridge";
import type { AutocompleteItem } from "./components/Autocomplete";
import { fuzzyFilter } from "./fuzzy";
import { refToken, type SessionReference } from "./session-reference";
import type { Sigil } from "./sigils";

const RANK: Record<string, number> = { skill: 0, prompt: 1, extension: 2 };
const firstLine = (t?: string) => (t ?? "").split(/\r?\n/)[0].trim();

export interface PiActions {
  compact: () => void;
  newSession: () => void;
  abort: () => void;
  clearQueue: () => void;
  exportHtml: () => void;
  reload: () => void;
  setThinking: (level: string) => void;
  fork: () => void;
}

/**
 * Data behind the four composer sigils. Everything here is discovery over things Pi already has:
 * files in the folder, commands Pi loaded, actions Pi's RPC exposes, sessions on disk.
 */
export function useCompletion(opts: {
  key?: string;
  folder?: string;
  sessions: SessionSummary[];
  actions: PiActions;
  onReference: (ref: SessionReference) => void;
}) {
  const { key, folder, sessions, actions, onReference } = opts;
  const files = useRef<{ folder: string; list: string[] } | undefined>(undefined);
  const [allSessions, setAllSessions] = useState<SessionSummary[]>([]);
  const commands = useRef<{ key: string; list: AutocompleteItem[] } | undefined>(undefined);
  const levels = useRef<{ key: string; list: string[] } | undefined>(undefined);

  const complete = useCallback(
    async (sigil: Sigil, query: string): Promise<AutocompleteItem[]> => {
      switch (sigil) {
        case "@": {
          if (!folder) return [];
          if (files.current?.folder !== folder)
            files.current = { folder, list: await bridge.files.list(folder) };
          const list = fuzzyFilter(files.current.list, query, (f) => f).slice(0, 50);
          return list.map((f) => ({ id: f, label: f.split("/").pop() ?? f, detail: f }));
        }
        case "/": {
          if (!key) return [];
          if (commands.current?.key !== key) {
            const { commands: cs } = await bridge.pi.command(key, { type: "get_commands" });
            commands.current = {
              key,
              // "/" means Skill: skills first, then prompt templates, then extension commands.
              list: [...cs]
                .sort((x, y) => RANK[x.source] - RANK[y.source] || x.name.localeCompare(y.name))
                .map((c) => ({
                  id: c.name,
                  // Pi names skill commands "skill:<name>"; show the skill's own name.
                  label: c.source === "skill" ? c.name.replace(/^skill:/, "") : c.name,
                  detail: firstLine(c.description),
                  hint: c.source === "skill" ? undefined : c.source,
                })),
            };
          }
          // match on the command name only; descriptions make every query match everything
          const matched = fuzzyFilter(commands.current.list, query, (c) => c.label);
          // skills stay ahead of extension commands whatever the fuzzy score says
          return matched.sort((x, y) => RANK[x.hint ?? "skill"] - RANK[y.hint ?? "skill"]);
        }
        case "#": {
          if (!key) return [];
          if (levels.current?.key !== key) {
            const { levels: ls } = await bridge.pi.command(key, { type: "get_available_thinking_levels" });
            levels.current = { key, list: ls };
          }
          const items: AutocompleteItem[] = [
            { id: "compact", label: "compact", detail: "Compact context now (Pi compaction)" },
            { id: "fork", label: "fork", detail: "Fork from a user message" },
            { id: "new", label: "new", detail: "New session in this folder" },
            { id: "abort", label: "abort", detail: "Abort the current run" },
            {
              id: "clear-queue",
              label: "clear-queue",
              detail: "Drop queued steers and follow-ups",
            },
            { id: "export", label: "export", detail: "Export session to HTML" },
            { id: "reload", label: "reload", detail: "Reload skills, extensions and MCP servers" },
            ...levels.current.list.map((l) => ({
              id: `thinking:${l}`,
              label: `thinking:${l}`,
              detail: "Set thinking level",
            })),
          ];
          return fuzzyFilter(items, query, (i) => i.label);
        }
        case "$": {
          if (allSessions.length === 0) setAllSessions(await bridge.sessions.listAll());
          const pool = dedupe([...sessions, ...allSessions]);
          const list = fuzzyFilter(pool, query, (s) => `${s.name ?? ""} ${s.firstMessage} ${s.cwd}`).slice(
            0,
            40,
          );
          return list.map((s) => ({
            id: s.path,
            label: s.name || s.firstMessage || "(empty)",
            detail: s.cwd.replace(/^\/Users\/[^/]+/, "~"),
            hint: `${s.messageCount} msgs`,
          }));
        }
        default:
          return [];
      }
    },
    [key, folder, sessions, allSessions],
  );

  const pick = useCallback(
    (sigil: Sigil, item: AutocompleteItem): string | undefined => {
      switch (sigil) {
        case "@":
          return `@${item.id}`;
        case "/":
          return `/${item.id}`;
        case "#": {
          const id = item.id;
          if (id === "compact") actions.compact();
          else if (id === "fork") actions.fork();
          else if (id === "new") actions.newSession();
          else if (id === "abort") actions.abort();
          else if (id === "clear-queue") actions.clearQueue();
          else if (id === "export") actions.exportHtml();
          else if (id === "reload") actions.reload();
          else if (id.startsWith("thinking:")) actions.setThinking(id.slice("thinking:".length));
          return undefined;
        }
        case "$": {
          const s = [...sessions, ...allSessions].find((x) => x.path === item.id);
          if (!s) return undefined;
          const token = refToken(s);
          void bridge.sessions.read(s.path).then((messages) => onReference({ token, session: s, messages }));
          return token;
        }
        default:
          return undefined;
      }
    },
    [sessions, allSessions, actions, onReference],
  );

  return { complete, pick };
}

function dedupe(list: SessionSummary[]): SessionSummary[] {
  const seen = new Set<string>();
  return list.filter((s) => {
    if (seen.has(s.path)) return false;
    seen.add(s.path);
    return true;
  });
}

# DESIGN

This document describes how PID works from the user's point of view. It does not describe implementation.

## Information Architecture

```text
Folders
  ↓
Sessions
  ↓
Conversation
  ↓
Composer
```

The conversation is always the center of the screen. Everything else is arranged around it.

First-level entries in the main navigation:

```text
Sessions      (Folders → Sessions → Conversation)
Skills
MCP
Extensions
Settings
```

Skills, MCP, and Extensions are pages of their own. They are part of how a user uses the Pi ecosystem, not settings.

## Folder Model

A Folder is a real directory on disk. PID shows "sessions under this folder".

There is no Project entity. Without project memory, a project is only a folder with a nicer name, and PID does not do project memory. Pi itself reads whatever the repository provides (AGENTS.md, README, source). PID adds nothing implicit on top.

The sidebar is one tree: Folder → Sessions. The active folder is expanded; the others are collapsed
with a session count. A collapsed folder that has a live session shows a pulsing dot. Long lists fold
behind "Show N more". Forks nest under their parent. A filter box at the top of the tree narrows it
(⌘K focuses it).

Each session row carries a status dot fed by the live Pi process:

```text
running    Pi is streaming or compacting
needs you  an extension dialog or approval is waiting
idle       a process is open, nothing running
error      the last turn ended in a provider error
closed     only the session file on disk
```

Several sessions can be open at once, each with its own Pi process; switching rows never stops a run.

Row actions live on the row: hover shows Fork and a menu with Fork from…, Reference in composer,
Rename, Export HTML, Reveal session file, Close process. Folder rows offer New session, New worktree…,
Remove this worktree, Forget folder.

The header carries only identity on the left and, over the conversation column, the session title,
folder, and branch. It has no controls.

## Worktree Model

Worktrees belong to sessions, not to the sidebar. Pi's `pi-worktree` extension binds a session to a
worktree (`/worktree`, `worktree_create`), keeps the session's folder at the origin, re-roots the
session's tool calls into the worktree, and lands or abandons it later (`/land`, `worktree_abandon`).

PID does not list worktrees as folders and does not create or remove them. It shows the binding
where it matters: on the session's title bar, from the extension's own status line —

```text
Sidebar tree redesign · ~/dev/pi/pid   ⑂ wt-sidebar-tree → main · ↑3 · 2 dirty
```

Git remains the source of truth for branches; the extension remains the source of truth for the
binding. A folder's own branch shows on its row and on the title bar when no worktree is bound.

## Conversation Timeline

The timeline shows the session as Pi understands it, with a clear hierarchy:

- **User messages** are visually distinct and right-aligned or otherwise clearly attributed.
- **Assistant messages** render as Markdown with code blocks.
- **Thinking** appears as a collapsible block with lower visual weight. Collapsed by default.
- **Tool calls** render as Tool Cards: one line of summary (tool name, key argument, status) with expandable input and output. Long outputs collapse. Edits render as diffs. File reads show the path and range. Bash shows command and output.
- **Errors** use one consistent visual language regardless of whether they came from a model, a tool, an extension, or an MCP server.
- **Compaction** appears as an inline marker showing where context was compacted and how much.
- **Queue state** appears between the active response and the composer: the active response, then queued steers, then queued follow-ups, in order.
- **Fork lineage** appears as a small indicator on the session header: parent session, sibling forks, and children, each one click away.

Default density is clean. Details are one expand, hover, or click away.

## Composer

The composer is the primary interaction point. It is never disabled, including while Pi is running.

Its footer holds what describes the next message: the model, the thinking level, and a context
gauge reading used / limit for the selected model (for example `380k / 1M · 38%`). To the right sits
one Send button. While Pi runs, a running indicator with a small stop glyph replaces the hint text.

Four sigils open four pickers:

```text
/   Skill
@   File
#   Pi Action
$   Session Reference
```

### `/` Skill

Lists the skills actually loaded in the current Pi environment. Typing filters fuzzily. Selecting inserts the skill invocation using Pi's own skill semantics. PID adds discoverability only.

### `@` File

Lists files in the current Folder with fuzzy search, recent files first, path preview, and file type. Selecting inserts a visible file mention such as `@src/agent.ts`. Pi reads the file with its own tools. There is no hidden index or embedding.

### `#` Pi Action

Lists actions Pi already has: change model, change thinking level, compact, fork, branch, abort, and so on. These are not natural-language prompts. `#compact` invokes Pi's real compaction. `#fork` invokes Pi's real fork. If Pi has no such action, it does not appear here.

### `$` Session Reference

Searches sessions across the current folder, sibling worktrees, and all history. Selecting inserts a Session Reference token such as `[$ redis-cache-debug]`.

## Session Reference

`$session` means: bring content from another session into this one, explicitly.

It is not navigation. It is not memory.

When a message containing `$session` is sent:

- the user sees which session is referenced
- the user sees how much of it is included and can inspect the exact content before sending
- the referenced content enters the conversation as explicit prompt content, visible in the timeline

Old sessions can be very long. The reference picker offers a scope: the session summary if Pi produced one, the last N messages, a specific range, or a search hit and its neighbors. The chosen scope is shown, and the token cost is shown. If a summary is used, it is labeled as a summary.

Nothing is injected silently. Two sessions in the same folder do not know about each other unless the user references one from the other.

## Fork

Fork creates a new session lineage from an existing session at a chosen point.

Fork is different from `$session`:

- `$session` keeps two histories separate and copies content from one into the other.
- Fork makes a new history that shares a prefix with the old one.

Fork lives on the session row in the sidebar (hover icon, context menu, or ⌘⇧F for the active
session). Picking a user message creates the new session before that message and puts its text in the
composer for editing, exactly like the terminal's `/fork`.

The GUI supports:

- fork from the current end of the session
- fork from an earlier message, where Pi's session model allows it
- forks nested under their parent in the session tree
- one-click switch to the parent or a sibling from the same tree

Lineage comes from Pi's own session data. PID keeps no separate fork database.

## Active Run

While Pi is responding, the composer stays open and has one button. Enter sends the text as a
**follow-up**: it waits for the current work to finish.

The queue panel above the composer lists what Pi holds, in Pi's order:

```text
Active response
    ↓
Queued steer          delivered after the current tool call, before the next model call
    ↓
Queued follow-up      delivered when the run ends
```

A queued follow-up can be promoted from its row:

- **Steer after tool**: Pi's native steer. Delivered before the next model call.
- **Steer now**: abort the current turn, then send it immediately. Pi has no mid-generation injection,
  so this is the earliest possible delivery.
- **×**: drop it.

Queue semantics are Pi's; PID rebuilds the queue through Pi's own clear and re-add commands.

## Tool Presentation

Every tool call, whether from Pi's built-in tools, an extension, or an MCP server, uses the same Tool Card. Same header, same expand behavior, same error styling. An MCP tool is a Tool; nothing about it is special in the timeline.

## Session Search

Search is retrieval infrastructure. It is not memory.

The filter box at the top of the session tree narrows every folder by title and first message as you
type; folders with matches expand. Content search across all session files powers the `$` picker and
uses a derived index over the Pi session files that can be deleted and rebuilt at any time.

## First-class Ecosystem Pages

### Skills

Lists every skill available in the current Pi environment: name, description, source, path, and whether it is currently on. Search filters the list. A skill can be opened in its source location. Each skill has a switch that writes the same setting `pi config` writes, globally or for one project; a scope bar picks which, and which project directory the project layer means. This page shows Pi's skills; PID has no skills of its own.

### MCP

Lists configured MCP servers: name, connection status, tool count, tools, recent errors, and metadata. Each server has a switch that writes pi-mcp-adapter's `disabled` flag, globally in `~/.pi/agent/mcp.json` or as a project override in `.pi/mcp.json`, the same thing `/mcp disable` does. Refresh and reconnect are offered where Pi allows them. There is no marketplace, no permission engine, no workflow builder.

### Extensions

Lists Pi extensions: name, source, path, metadata, a switch that writes the same enable/disable pattern `pi config` writes (global or per project), and a compatibility label:

```text
Compatible
Partially Compatible
TUI-only / Unsupported
```

Extensions that rely on terminal widgets or terminal layout are labeled Unsupported in PID. PID does not build an adapter framework to change that.

## Settings

Settings hold PID's own preferences and light control over Pi runtime preferences that Pi already exposes.

- **Appearance**: theme, font size, conversation density, code font, default collapse state for tool cards and thinking, sidebar behavior, panel layout.
- **Conversation**: Enter and Shift+Enter behavior, default send mode, steer and follow-up shortcuts, auto-scroll, tool output expansion, session reference preview behavior.
- **Sessions**: default sorting, recent folder behavior, search scope, preview length, fork tree display, visibility of closed sessions.
- **Files & Worktrees**: ignore patterns for `@` search, hidden file visibility, worktree display, default worktree parent directory, confirmation for destructive worktree actions.
- **Notifications**: run completed, approval or input required, error, long task completion.
- **Advanced**: only genuinely advanced PID settings.

Skills, MCP, Extensions, provider configuration, and model registry configuration are not in Settings.

## Models

PID reads Pi's local model configuration and shows it: grouped by provider, searchable, with the metadata needed to choose. The user selects a model for the current session.

PID does not add providers, edit API keys, edit endpoints, register models, or edit model JSON. Those stay in Pi.

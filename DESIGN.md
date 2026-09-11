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

The sidebar lists recent folders. Selecting a folder lists its sessions. Selecting a session opens its conversation.

## Worktree Model

A Git worktree is a Folder. Nothing more.

PID understands that several folders belong to one repository and which branch each one is on, but that relationship is used only for navigation and for choosing where a session runs. The worktree panel lets a user:

- see the worktrees of the current repository and their branches
- jump to a sibling worktree
- create a worktree, optionally with a new branch
- start a session in a worktree
- see sessions that already exist under a worktree
- remove a worktree when Git reports it is safe

Git is the source of truth. PID never stores its own worktree registry.

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

The GUI supports:

- fork from the current end of the session
- fork from an earlier message, where Pi's session model allows it
- clear parent and child indication on the session header
- one-click return to the parent
- a list of sibling forks

Lineage comes from Pi's own session data. PID keeps no separate fork database.

## Active Run

While Pi is responding, the composer stays open. Sending offers two explicit choices:

- **Steer**: interrupts the current work and redirects it.
- **Follow-up**: waits for the current work to finish, then runs.

The queue panel shows:

```text
Active response
    ↓
Queued steer
    ↓
Queued follow-up
    ↓
Queued follow-up
```

Queue semantics are Pi's. PID visualizes them and adds keyboard shortcuts. Reordering and cancellation appear only where Pi supports them.

## Tool Presentation

Every tool call, whether from Pi's built-in tools, an extension, or an MCP server, uses the same Tool Card. Same header, same expand behavior, same error styling. An MCP tool is a Tool; nothing about it is special in the timeline.

## Session Search

Search is retrieval infrastructure. It is not memory.

Scope: current folder, or all folders. Fields: session title, message content, folder, time, Git branch, worktree. Results are fast, fuzzy, incremental, keyboard-friendly, and show a content preview. Selecting a result opens it or, from the composer, references it.

The search index is derived from Pi session files and can be deleted and rebuilt at any time.

## First-class Ecosystem Pages

### Skills

Lists every skill available in the current Pi environment: name, description, source, path, and whether it is currently usable. Search filters the list. A skill can be opened in its source location. This page shows Pi's skills; PID has no skills of its own.

### MCP

Lists configured MCP servers: name, connection status, tool count, tools, recent errors, and metadata. Refresh and reconnect are offered where Pi allows them. There is no marketplace, no permission engine, no workflow builder.

### Extensions

Lists Pi extensions: name, source, path, metadata, enabled state where Pi supports it, and a compatibility label:

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

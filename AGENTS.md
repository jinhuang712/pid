# AGENTS

Development guide for coding agents and humans working on PID.

## Project Identity

PID is a graphical desktop frontend for Pi.

It is not a new agent runtime. It is not an agent built on Pi. Pi owns agent behavior and agent state; PID owns presentation.

## Pi First

Before implementing any capability:

1. Check upstream Pi (the monorepo and the installed `@earendil-works/pi-coding-agent` package).
2. Read the current API, examples, and source. Do not rely on memory of older versions.
3. Confirm whether Pi already has the capability.
4. If it does, expose it.
5. Only if it does not, consider a PID-specific implementation, and keep it thin.

API names and paths are whatever the current upstream code says. Verify before use.

## No Shadow Agent System

Never create, even accidentally:

- a second session model
- a second provider system
- a second auth system
- a second skill runtime
- a second extension ecosystem
- a second tool runtime
- a second message queue
- project memory
- hidden agent state

If a PID-side copy of Pi data is needed for display performance, it must be derived, rebuildable, and non-authoritative.

## Folder / Session Model

PID manages sessions under folders. There is no Project entity. A Git worktree is a Folder.

## Cross-session Reference

`$session` is an explicit context reference chosen by the user. It is not automatic memory. Referenced content enters the conversation as visible prompt content, never silently.

## Fork

Use Pi's native session tree and fork semantics. PID keeps no fork database of its own.

## Extension Boundary

Not every terminal extension will work in PID. Extensions that depend on terminal widgets or terminal layout are labeled unsupported. Do not build an adapter framework to change that.

## MCP Boundary

MCP tools end up as Pi Tools and flow through Pi's agent loop. No MCP agent mode, no MCP platform.

## Model Boundary

PID does not configure providers or models. It reads Pi's local model configuration and lets the user pick one for the session.

## Pi Coexistence

- Never modify Pi's global configuration silently.
- Sessions PID writes must remain readable and resumable by the Pi terminal UI.
- Do not maintain a second set of provider credentials.
- Avoid concurrent-writer corruption of a session file; reuse Pi's protections where they exist, and keep any PID-side guard trivial.

## Implementation Style

- simple
- explicit
- thin abstractions
- no speculative framework
- no premature future-proofing
- composition over framework

If 100 lines solve it, do not write an 800-line framework.

Do not introduce `AgentHost`, `RuntimeManager`, `WorkspaceManager`, `ProjectManager`, `MemoryManager`, `PluginPlatform`, `SessionRepository`, `EventFramework`, or similar until a real need proves them necessary.

Target shape:

```text
GUI
  ↓
thin PID bridge
  ↓
Pi Coding Agent SDK
```

## How PID Talks to Pi

- **Live agent**: one `pi --mode rpc` child process per open session (`src/main/pi/rpc-process.ts`).
  Commands and events are Pi's RPC protocol types, imported from the pinned
  `@earendil-works/pi-coding-agent` package. PID adds only a process key. This means PID runs the
  user's installed `pi`, with their extensions, MCP adapter, models, and auth, unchanged.
- **Read-only discovery**: session lists (`SessionManager.list/listAll`), skills
  (`loadSkillsFromDir`), and file parsing of `~/.pi/agent` for extensions and MCP config.
  Nothing under `~/.pi/agent` is ever written by PID.
- **Renderer state**: the streaming assistant message is rebuilt from `message_update` deltas;
  `message_end` is authoritative. Everything else is a projection of Pi events.
- **Extension UI**: the RPC `extension_ui_request` sub-protocol is answered with real dialogs;
  fire-and-forget methods become toasts and a status strip. TUI-only APIs are not adapted.
- **Concurrency**: Pi has no session-file lock. PID owns one process per session file it opens and
  never appends to a file another process is writing.

Keep the pinned Pi dependency equal to the globally installed `pi` version.

## Repository Layout

```text
src/main/           Electron main: window, menu, IPC, settings, git, ecosystem discovery
src/main/pi/        Pi bridge: rpc-process, registry, sessions, search, session-read, ecosystem
src/preload/        typed bridge exposed to the renderer (bridge-types.d.ts is the contract)
src/renderer/       React UI: components/, pages/, state/, settings, completion, sigils
src/shared/         types shared by all three processes
test/               vitest unit tests (real-environment tests are opt-in via env vars)
docs at the repository root: PROPOSAL, GOALS, DESIGN, FEATURES, GITFLOW, AGENTS, README
```

Dev hooks for headless verification: `PID_OPEN_FOLDER`, `PID_OPEN_SESSION`, `PID_PROMPT`,
`PID_FOLLOWUP`, `PID_DRAFT`, `PID_SEARCH`, `PID_PAGE`, `PID_SCREENSHOT`, `PID_SCREENSHOT_DELAY`.

## Verification

Before every commit that touches code:

```text
pnpm typecheck
pnpm lint
pnpm test        (when tests exist)
pnpm build
runtime smoke test where the change is user-visible
```

Also verify, when relevant:

- a session created or modified by PID still opens in the Pi CLI
- PID did not mutate Pi global state it should not touch
- `$session` injection is explicit and inspectable
- fork lineage matches Pi's own session tree
- worktree data comes from Git, not a PID model
- the search index can be deleted and rebuilt
- steer and follow-up behave exactly as in upstream Pi
- model selection only reads and selects existing Pi model config

## Incremental Development

```text
implement
  → verify
  → inspect
  → commit
  → next
```

Small commits. See GITFLOW.md.

## Document Responsibilities

- `PROPOSAL.md` — why PID exists and what it believes
- `GOALS.md` — goals, non-goals, constraints, conflict priority
- `DESIGN.md` — how PID works from the user's point of view
- `FEATURES.md` — tagged feature inventory by priority
- `GITFLOW.md` — commit and branch discipline
- `AGENTS.md` — this file: how to develop PID

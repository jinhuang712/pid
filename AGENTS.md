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

A Pi extension's behaviour — tools, commands, hooks, providers — runs the same in both hosts. Its
interface does not: PID serves the `ctx.ui` members whose payload is data, and cannot serve the ones
whose signature carries a terminal (`custom`, `setFooter`, `setHeader`, `setEditorComponent`,
`onTerminalInput`, and the pi-tui renderer registrations).

`src/shared/extension-ui.ts` is the single answer to which is which. The worker implements it, the
Extensions page reports it, and `test/extension-ui.test.ts` fails when they disagree. Classify a new
member there rather than adding a special case anywhere else, and do not build an adapter framework
to fake a terminal.

`ctx.hasUI` is not a terminal check: PID has a UI, so it is true here. Only `ctx.mode === "tui"`
stands an extension's terminal parts down.

"Cannot serve" is a choice, not a wall. A pi-tui `Component` is `render(width): string[]` and
`Terminal` is an interface with more than one implementation upstream — Pi's own test suite drives
the whole TUI against an xterm-backed double. PID could therefore host those members by becoming a
terminal emulator in a window, and does not, because a character grid is not a desktop interface.
Anyone reopening this should reopen it as "how does an extension get native desktop presentation",
which is DESIGN §23–25, not as "how does PID fake a terminal".

## Ecosystem Boundary

An extension's tools end up as Pi Tools and flow through Pi's agent loop. PID runs no second tool
system, and carries no code for any particular ecosystem: a page for one arrives as a description
its extension published, or does not exist.

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

- **Live agent**: one Electron utility process per open session, hosting Pi's own
  `AgentSessionRuntime` — the layer the Pi terminal runs on (`src/main/pi/session-worker.ts`,
  spawned by `src/main/pi/session-process.ts`). It reads the user's `~/.pi/agent`, so their
  extensions, skills, models and auth apply unchanged. One session per process keeps
  Pi's process-global state per session and contains a crashing extension.
- **Protocol** (`src/shared/protocol.ts`): PID's own commands, events, dialogs and session state,
  shaped from `AgentSession` and `AgentSessionEvent` so a field cannot drift from what the agent
  returns. Pi's `modes/rpc` types are deliberately not used: that surface is second-class and
  upstream has a replacement in development. `session-worker.ts` is the only file that touches
  Pi's agent API; `test/protocol-boundary.test.ts` fails if anything else does.
- **Discovery**: session lists (`SessionManager.list/listAll`), skills (`loadSkillsFromDir`),
  and skill/extension enablement resolved by Pi's `DefaultPackageManager` so it matches `pi config`.
  An extension's own configuration is the extension's to read and write, never PID's.
- **PID ships no extension.** A session loads exactly what Pi resolves for its directory, which is
  what the terminal loads too. PID must never bundle, vendor or fall back to one — that would make
  it a Pi distribution, which GOALS lists as a non-goal.
- **On/off switches** (`src/main/pi/toggles.ts`): the only writes PID makes under `~/.pi/agent` or
  `<cwd>/.pi`, and they are Pi's own formats through Pi's own code paths. Skills and extensions go
  through `SettingsManager` as the same `+pattern` / `-pattern` entries `pi config` writes (global
  or `--local`, including the project-layer inherit state). An extension's own configuration files
  are the extension's to write; PID touches no other key and no other file.
  `~/.pi/agent/APPEND_SYSTEM.md` in place, Pi's own global append-system-prompt file, so the same
  rules apply in the terminal. An empty box removes the file. PID keeps no copy and never writes
  `SYSTEM.md` or a project's `.pi/APPEND_SYSTEM.md`.
- **Renderer state**: the streaming assistant message is rebuilt from `message_update` deltas;
  `message_end` is authoritative. Everything else is a projection of Pi events.
- **Extension UI**: the worker implements Pi's `ExtensionUIContext` and forwards each served call as
  a dialog request; the window answers and the extension's await resolves. Members PID does not
  serve are stubs, not events nothing reads. `src/shared/extension-ui.ts` holds the classification.
- **Extension presentation**: `setStatus` and `setWidget` from any extension reach the strip above
  the composer — no allowlist, the same as the terminal. Pi defines a widget key as an identity for
  replace-and-clear and nothing more, so PID reads no meaning into it.
- **Structured widgets are an interim** (`@shared/extension-widgets`, `@shared/extension-kinds`,
  `@shared/extension-page`): an extension wanting more than a line names its widget
  `<ns>:<kind>/v<n>`, sends JSON, and PID renders the kinds it knows. The ceiling is the field list
  in `extension-page.ts` — an extension can say only what PID thought of first, which is the wrong
  way round. DESIGN §23–25 is where this goes: the extension ships its desktop presentation as code
  and composes PID's primitives, the way a Pi extension already composes pi-tui's. Do not widen the
  kind table to get around the ceiling; that is the mistake, not the fix.
- **Primitives** (`src/renderer/ui/`): `Row` `IconButton` `Toggle` `Segmented` `Trigger` `Badge`
  `Dot` `Num` `Eyebrow` `Modal` `Popover` `ContextMenu` `Floating` `Panel` `Divider` `Scroll`, plus
  the five-tone table every one of them colours from. PID draws its own window with these, which is
  the only thing that makes them fit to hand out later. Nothing in here knows what a session or a
  tool call is; that belongs in `components/`.
- **PID names no extension, and no ecosystem of one.** Whatever a row means stays with whoever
  published it. A hardcoded widget key, a check for one extension being installed, and a built-in
  page for one ecosystem were three versions of the same mistake;
  `test/protocol-boundary.test.ts` fails on any of them. It scans `src/`, not prose, so the docs
  are on their own — an extension named in a document is a name that will end up in code.
- **Quota is not PID's**: PID fetches no usage. Whoever already computes it for the terminal
  publishes the same numbers, and PID draws them. PID owns the thresholds and the shape of the row,
  nothing else.
- **Fork**: Pi stamps a forked session with its parent. PID leaves that alone — the lineage is
  Pi's, and the file does not even exist until the next turn appends to it.
- **Concurrency**: Pi has no session-file lock. PID owns one worker per session file it opens and
  never appends to a file another process is writing.

PID runs the Pi version it pins, so a `pi` on the user's PATH is not required. Keep the pinned
version equal to the installed one anyway when there is one: both read the same `~/.pi/agent`, and
the Settings page reports the drift.

## Repository Layout

```text
src/main/           Electron main: window, menu, IPC, settings, git, ecosystem discovery
src/main/pi/        Pi bridge: session-worker (the only file that drives Pi), session-process,
                    registry, sessions, search, session-read, ecosystem
src/preload/        typed bridge exposed to the renderer (bridge-types.d.ts is the contract)
src/renderer/       React UI: components/, pages/, state/, settings, completion, sigils
src/renderer/ui/    presentation primitives; no session, no IPC, no domain type
src/shared/         types shared by all three processes
test/               vitest unit tests (real-environment tests are opt-in via env vars)
docs at the repository root: PROPOSAL, GOALS, DESIGN, FEATURES, GITFLOW, AGENTS, README
```

Dev hooks for headless verification: `PID_OPEN_FOLDER`, `PID_OPEN_SESSION`, `PID_PROMPT`,
`PID_FOLLOWUP`, `PID_DRAFT`, `PID_ATTACH` (colon-separated absolute paths), `PID_SEARCH`, `PID_PAGE`,
`PID_SCREENSHOT`, `PID_SCREENSHOT_DELAY`.

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

- `PROPOSAL.md` — why PID exists
- `PHILOSOPHY.md` — principles that decide the calls where several implementations are reasonable
- `GOALS.md` — goals and non-goals
- `FEATURES.md` — tagged capability inventory
- `DESIGN.md` — architectural boundary with Pi, state ownership, runtime lifecycle, interaction model
- `GITFLOW.md` — commit and branch discipline
- `AGENTS.md` — this file: how to develop PID

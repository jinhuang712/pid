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

- **Live agent**: one Electron utility process per open session, hosting Pi's own
  `AgentSessionRuntime` — the layer the Pi terminal runs on (`src/main/pi/session-worker.ts`,
  spawned by `src/main/pi/session-process.ts`). It reads the user's `~/.pi/agent`, so their
  extensions, MCP servers, skills, models and auth apply unchanged. One session per process keeps
  Pi's process-global state per session and contains a crashing extension.
- **Protocol** (`src/shared/protocol.ts`): PID's own commands, events, dialogs and session state,
  shaped from `AgentSession` and `AgentSessionEvent` so a field cannot drift from what the agent
  returns. Pi's `modes/rpc` types are deliberately not used: that surface is second-class and
  upstream has a replacement in development. `session-worker.ts` is the only file that touches
  Pi's agent API; `test/protocol-boundary.test.ts` fails if anything else does.
- **Discovery**: session lists (`SessionManager.list/listAll`), skills (`loadSkillsFromDir`),
  and skill/extension enablement resolved by Pi's `DefaultPackageManager` so it matches `pi config`.
  MCP config is parsed from the `mcp.json` layers pid-mcp and pi-mcp-adapter both read.
- **On/off switches** (`src/main/pi/toggles.ts`): the only writes PID makes under `~/.pi/agent` or
  `<cwd>/.pi`, and they are Pi's own formats through Pi's own code paths. Skills and extensions go
  through `SettingsManager` as the same `+pattern` / `-pattern` entries `pi config` writes (global
  or `--local`, including the project-layer inherit state). MCP servers get the MCP extension's
  `disabled` flag: edited in place globally, or as a `{ disabled }`-only override in
  `<cwd>/.pi/mcp.json` like `/mcp disable`. No other key in those files is touched.
- **Appended system prompt** (`src/main/pi/system-prompt.ts`): the Settings page edits
  `~/.pi/agent/APPEND_SYSTEM.md` in place, Pi's own global append-system-prompt file, so the same
  rules apply in the terminal. An empty box removes the file. PID keeps no copy and never writes
  `SYSTEM.md` or a project's `.pi/APPEND_SYSTEM.md`.
- **Renderer state**: the streaming assistant message is rebuilt from `message_update` deltas;
  `message_end` is authoritative. Everything else is a projection of Pi events.
- **Extension UI**: the worker implements Pi's `ExtensionUIContext` and forwards each call as a
  dialog request; the window answers and the extension's await resolves. Fire-and-forget methods
  become toasts and a status strip. TUI-only APIs are not adapted.
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

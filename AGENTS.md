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

## Repository Layout

```text
src/main/       Electron main process: window, IPC, Pi SDK bridge
src/preload/    typed IPC surface exposed to the renderer
src/renderer/   React UI
docs are at the repository root (PROPOSAL, DESIGN, FEATURES, GOALS, GITFLOW)
```

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

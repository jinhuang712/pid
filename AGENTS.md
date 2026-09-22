# AGENTS

How to work in this repository. Architecture lives in `DESIGN.md`; the calls that look
debatable are argued in `PHILOSOPHY.md`. This file is the short version: what PID is, the rules
that decide a change, and how to land one.

## What PID Is

A graphical desktop frontend for Pi. Pi owns agent behavior and agent state; PID owns presentation.
It is not a second agent runtime, not an agent built on Pi, and not a Pi distribution.

## Reading Before Writing

| You are about to… | Read |
| --- | --- |
| touch anything that drives Pi | `DESIGN.md` §2–8, then `src/main/pi/session-worker.ts` |
| add or change a UI surface | `DESIGN.md` §9–29, then `src/renderer/ui/` |
| touch extensions, skills, models, auth | `DESIGN.md` §22–26, §32, then `src/main/pi/ecosystem.ts` |
| ask "why is it like this" | `PHILOSOPHY.md`, and the test that fails if you change it |
| ask "should PID do this at all" | `GOALS.md` non-goals |

## Rules

Each of these has cost someone a rewrite. The reasoning is in the linked section; the rule is here.

**Pi owns the agent.** Before implementing a capability, check upstream Pi — the monorepo and the
installed `@earendil-works/pi-coding-agent`. Read the current API and source, not a memory of an
older version. If Pi has it, expose it. Only if it does not, write something thin. (`DESIGN.md` §2)

**No shadow agent system.** Never create, even accidentally: a second session model, provider
system, auth system, skill runtime, extension ecosystem, tool runtime or message queue; project
memory; hidden agent state. If a PID-side copy exists for display performance it must be derived,
rebuildable and non-authoritative. (`DESIGN.md` §1, §34)

**One file drives Pi.** `src/main/pi/session-worker.ts` is the only file that touches Pi's agent
API. Everything else speaks `src/shared/protocol.ts`. `test/protocol-boundary.test.ts` fails when
that erodes. (`DESIGN.md` §2, §36)

**One writer per session file.** Pi has no session-file lock. PID owns one worker per session file
it opens and never appends to a file another process is writing. Sessions PID writes must stay
readable and resumable by the Pi terminal. (`DESIGN.md` §7, §8)

**PID configures no models or providers**, and keeps no second set of credentials. It reads Pi's
local model configuration and lets the user pick. (`DESIGN.md` §32)

**PID ships no extension and names none.** A session loads exactly what Pi resolves for its
directory. No bundled or vendored extension, no fallback, and no code that checks for a particular
extension being installed — `test/protocol-boundary.test.ts` fails on any of them. A page for one
ecosystem is drawn by that extension's own desktop half. (`DESIGN.md` §22–26)

**Writes under `~/.pi` are Pi's own formats through Pi's own code paths.** `src/main/pi/toggles.ts`
is the whole list. Never modify Pi's global configuration silently. An extension's own
configuration is the extension's to read and write. (`DESIGN.md` §33)

**One origin.** The window is served from `pid://app` and a plugin from a path under it, because a
`file:` document has an opaque origin and Chromium refuses a cross-origin module import. Do not
simplify this back to `loadFile`. (`DESIGN.md` §23–25)

**A plugin composes primitives, not classes.** The stylesheet is built from PID's own sources, so a
class no PID file uses does not exist by the time a plugin loads. When a plugin needs a shape the
library lacks, add the primitive. A safelist would be the same mistake as a description language.
(`DESIGN.md` §23, §27)

**Quota is not PID's.** PID neither fetches plan quota nor shows it. Context stays visible as the
gauge in the composer toolbar, read off Pi's own messages. (`GOALS.md`)

## Repository Layout

```text
src/main/             Electron main: window, menu, IPC, settings, git, ecosystem discovery
src/main/pi/          Pi bridge: session-worker, session-process, registry, sessions, search,
                      session-read, ecosystem, compat/ (upstream-gap shims; the only place Pi
                      private layout is touched)
src/preload/          typed bridge exposed to the renderer (bridge-types.d.ts is the contract)
src/renderer/         React UI: components/, pages/, state/, settings, completion, sigils
src/renderer/ui/      presentation primitives; no session, no IPC, no domain type
src/renderer/plugins/ loading an extension's desktop half and mounting what it registers
src/shared/           types shared by all three processes
scripts/              sandbox.sh — a PID that never draws, for testing
test/                 vitest unit tests
docs at the root: PROPOSAL, PHILOSOPHY, GOALS, DESIGN, FEATURES, GITFLOW, AGENTS, README
```

## Implementation Style

simple · explicit · thin abstractions · composition over framework · no speculative framework ·
no premature future-proofing.

If 100 lines solve it, do not write an 800-line framework. Do not introduce `AgentHost`,
`RuntimeManager`, `WorkspaceManager`, `ProjectManager`, `MemoryManager`, `PluginPlatform`,
`SessionRepository`, `EventFramework` or similar until a real need proves them necessary.

```text
GUI  →  thin PID bridge  →  Pi Coding Agent SDK
```

## Testing

`pnpm test` is the unit suite, and it is cheap — run it constantly. Some tests need a real
environment and are opt-in through env vars.

For anything a person can see, do not ask them to look; run it yourself:

```bash
scripts/sandbox.sh --detach --open /abs/path --prompt "say hi"
sleep 30
cat /tmp/pid-sandbox/dump/window.txt     # what the window rendered
cat /tmp/pid-sandbox/dump/window.json    # renderer probe: active folder, sessions, the @ list
cat /tmp/pid-sandbox/dump/menu.txt       # accelerators Electron really installed
scripts/sandbox.sh --clean               # stop, and remove the sandbox and its sessions
```

The sandbox has no window and no Dock icon, its own userData, its own bundle id and its own cwd, so
it cannot disturb whoever is at the machine. Never launch a GUI any other way from an agent
session — `pnpm dev` and a packaged `PID.app` both take focus, and a packaged build shares its
bundle id with an installed one, so launching it can bring up the user's real window instead.
`scripts/sandbox.sh --help` lists the rest of the hooks it drives. Add fields to the renderer probe
rather than guessing at `window.txt`; the probe is the effect in `src/renderer/App.tsx`.

## Verification

Before every commit that touches code:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Then prove it in the running app where the change is user-visible, and check the invariants that
apply to what you touched:

- a session PID created or modified still opens in the Pi CLI
- PID did not mutate Pi global state it should not touch
- `$session` injection is explicit and inspectable
- fork lineage matches Pi's own session tree
- worktree data comes from Git, not a PID model
- the search index can be deleted and rebuilt
- steer and follow-up behave exactly as upstream Pi
- model selection only reads and selects existing Pi model config

## Incremental Development

```text
implement → verify → inspect → commit → next
```

Small commits, one concern each. `GITFLOW.md` has the branch and message discipline.

**A worktree shares the main checkout's pnpm workspace.** `pnpm-workspace.yaml` sits at the repo
root, so in a worktree under `.claude/worktrees/` pnpm resolves the workspace to the main checkout:
`pnpm install` fills the main `node_modules`, and `pnpm add` would edit the shared lockfile. Run
`pnpm exec …` freely in a worktree, but add a dependency by editing `package.json` and regenerate
the lockfile in the main checkout after landing. electron-builder in a worktree cannot read the
Electron version; pass `-c.electronVersion=<version>`.

## Documents

| File | Answers |
| --- | --- |
| `PROPOSAL.md` | why PID exists |
| `PHILOSOPHY.md` | principles that decide the calls where several implementations are reasonable |
| `GOALS.md` | goals and non-goals |
| `FEATURES.md` | tagged capability inventory |
| `DESIGN.md` | architectural boundary with Pi, state ownership, runtime lifecycle, interaction model |
| `GITFLOW.md` | commit and branch discipline |
| `AGENTS.md` | this file: how to develop PID |

# PID

A desktop graphical frontend for [Pi](https://github.com/earendil-works/pi).

PID is not another coding agent. It hosts Pi's own runtime, reads the same `~/.pi/agent`, and uses
the same sessions, models, providers, skills, extensions and tools — then adds what a terminal
cannot give a long coding session: hierarchy, navigation, search, and explicit cross-session
reference.

PID leaves Pi's session files exactly as Pi writes them. Quit PID and open the same session in the
Pi terminal; it resumes where you left it. (PID's session processes stop when PID quits; if a turn
is still running you are asked whether to wait for it.)

## What it does

- Folders → Sessions → Conversation → Composer. No projects, no hidden memory.
- Streams Pi's events: markdown, collapsed thinking, tool cards with diffs, errors, compaction.
- Steer and follow-up while Pi runs, with Pi's queue visualized.
- Fork with Pi's native fork; lineage from Pi's own session files.
- Composer sigils: `/` skill · `@` file · `#` Pi action · `$` session reference.
- `$reference` attaches a chosen session's content as visible prompt text, with size shown up front.
- Search every session by title, content, folder. Indexes user and assistant text on the active
  branch (not thinking, tool calls, or tool output). The index is derived and rebuildable.
- Git worktrees as Folders: list, open, create, remove safely.
- Skills and Extensions pages, plus any page an installed extension contributes. Each extension is
  labelled with how much of it this host can run, per `ctx.ui` member.
- Settings that belong to a GUI, and nothing else. Provider and model config stays in Pi.

## What it does not do

PID ships no extension and bundles none. A session loads exactly what Pi resolves for its
directory, which is what the terminal loads too. If MCP is not installed in your Pi, PID has no MCP
page and no line of code that knows what MCP is.

## Requirements

- macOS (the window shell is macOS-first; other platforms untested)
- Node ≥ 22.19 and pnpm

PID runs the Pi version it pins (`@earendil-works/pi-coding-agent` in `package.json`), so a `pi` on
your PATH is not required. Keep the two equal anyway when you have both: they read the same
`~/.pi/agent`, and Settings › Advanced reports the drift.

## Run

```bash
./install.sh         # check prerequisites, install deps, launch the dev build
./install.sh --app   # build PID.app, copy to /Applications, open it
```

Or by hand:

```bash
pnpm install
pnpm dev        # hot-reloading development build
pnpm build      # production bundle in out/
pnpm dist       # macOS app + dmg in release/
```

Verification:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Headless smoke test hooks (used in development):

```bash
PID_OPEN_FOLDER=/path/to/repo PID_PROMPT="say hi" PID_SCREENSHOT=/tmp/pid.png pnpm exec electron .
```

`PID_PAGE` opens a page directly; `PID_SCREENSHOT_DELAY` waits before capturing.

## How it talks to Pi

One Electron utility process per open session, hosting Pi's own `AgentSessionRuntime` — the layer
the Pi terminal itself runs on. One session per process keeps Pi's process-global state per session
and contains a crashing extension.

Between the window and that process is PID's own protocol (`src/shared/protocol.ts`), shaped from
`AgentSession` and `AgentSessionEvent` so a field cannot drift from what the agent returns. One file
drives Pi's API; a test fails if any other file touches it.

Discovery is Pi's: session lists, skills, and skill/extension enablement all come from Pi's own
resolver, so what PID lists is what `pi config` lists. The only writes PID makes under `~/.pi/agent`
are the switches on the Skills and Extensions pages, in Pi's own `+pattern` / `-pattern` format, and
the append-system-prompt file — the same entries the terminal would write. PID keeps no provider,
model, auth or session configuration of its own.

Extensions reach the window through Pi's `ExtensionUIContext`: dialogs become desktop dialogs,
`setStatus` and `setWidget` become the strip above the composer. `src/shared/extension-ui.ts` is the
one table saying which members PID serves, which it accepts and ignores, and which need a terminal;
the Extensions page reports it per member, and a test fails when the table and the implementation
disagree.

## Documents

- `PROPOSAL.md` — why PID exists
- `PHILOSOPHY.md` — principles that decide close calls
- `GOALS.md` — goals and non-goals
- `FEATURES.md` — tagged capability inventory
- `DESIGN.md` — architectural boundary with Pi, state ownership, interaction model
- `GITFLOW.md` — commit discipline
- `AGENTS.md` — development guide for humans and coding agents

## License

MIT

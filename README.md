# PID

A desktop graphical frontend for [Pi](https://github.com/earendil-works/pi).

PID is not another coding agent. It drives the `pi` you already have installed, uses the same
sessions, models, providers, skills, extensions, and tools, and adds the things a terminal
cannot give a long coding session: hierarchy, navigation, search, and explicit cross-session
reference.

PID leaves Pi's session files exactly as Pi writes them. Quit PID and open the same session in
the Pi terminal; it resumes where you left it. (PID's own `pi` child processes stop when PID
quits; if a turn is still running you are asked whether to wait for it.)

## What it does

- Folders → Sessions → Conversation → Composer. No projects, no hidden memory.
- Streams Pi's events: markdown, collapsed thinking, tool cards with diffs, errors, compaction.
- Steer and follow-up while Pi runs, with Pi's queue visualized.
- Fork with Pi's native fork; lineage from Pi's own session files.
- Composer sigils: `/` skill · `@` file · `#` Pi action · `$` session reference.
- `$reference` attaches a chosen session's content as visible prompt text, with size shown up front.
- Search every session by title, content, folder. Indexes user and assistant text on the active
  branch (not thinking, tool calls, or tool output). Index is derived and rebuildable.
- Git worktrees as Folders: list, open, create, remove safely.
- First-class Skills, MCP, and Extensions pages. Extensions are labelled by compatibility.
- Settings that belong to a GUI, and nothing else. Provider and model config stays in Pi.

## Requirements

- macOS (the window shell is macOS-first; other platforms untested)
- Node ≥ 22.19 and pnpm
- `pi` ≥ 0.85 on your login shell PATH (`npm i -g @earendil-works/pi-coding-agent`)

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
pnpm typecheck && pnpm lint && pnpm test
```

Headless smoke test hooks (used in development):

```bash
PID_OPEN_FOLDER=/path/to/repo PID_PROMPT="say hi" PID_SCREENSHOT=/tmp/pid.png pnpm exec electron .
```

## How it talks to Pi

One `pi --mode rpc` child process per open session, JSON lines over stdio. The renderer rebuilds
the streaming assistant message from Pi's deltas. Read-only discovery (session lists, skills)
uses the Pi SDK from the same pinned version. PID keeps no provider, model, auth, or session
configuration of its own. The only writes to Pi's configuration are the ones you make explicitly
in the Skills, Extensions, and MCP pages; those toggles edit the same `settings.json` and
`mcp.json` entries that `/skill`, `/reload`, and `/mcp` would.

## Documents

- `PROPOSAL.md` — why PID exists and what it believes
- `GOALS.md` — goals, non-goals, constraints
- `DESIGN.md` — how PID works from the user's point of view
- `FEATURES.md` — tagged feature inventory
- `GITFLOW.md` — commit discipline
- `AGENTS.md` — development guide for humans and coding agents

## License

MIT

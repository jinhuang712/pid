# DESIGN

This document describes the target design of PID.

It covers the architectural boundary with Pi, state ownership, runtime lifecycle, extensibility, and the major interaction model.

It does not explain why PID exists; see `PROPOSAL.md`.

It does not define decision principles; see `PHILOSOPHY.md`.

---

# 1. System Model

PID is another interface to Pi.

The target architecture is:

```text
                    User's Pi Environment
                           │
              @earendil-works/pi-coding-agent
                           │
                    Pi Host Process
                           │
                  AgentSessionRuntime
                           │
          ┌────────────────┼────────────────┐
          │                │                │
     SessionManager   ResourceLoader    Pi Extensions
          │                │                │
          └────────────────┼────────────────┘
                           │
                     typed PID IPC
                           │
                    Electron Main
                           │
                    PID Renderer
                           │
              PID Presentation Extensions
```

PID does not implement an agent runtime.

It hosts Pi's official coding-agent runtime and provides a graphical interface over it.

---

# 2. Runtime Boundary

PID should use the official `@earendil-works/pi-coding-agent` runtime layer rather than reconstructing behavior from `pi-agent-core`.

The relevant boundary is the same level that owns Pi session behavior:

```text
AgentSessionRuntime
    │
    ├── AgentSession
    ├── SessionManager
    ├── models
    ├── extensions
    ├── skills
    ├── tools
    ├── compaction
    ├── fork
    ├── queue
    └── runtime replacement
```

PID consumes that runtime.

It does not build equivalent session or agent lifecycle logic.

---

# 3. Pi Host Isolation

Pi should not execute directly inside the Electron renderer.

It should also not be tightly coupled to Electron Main.

PID runs Pi inside an isolated Pi Host process.

A live session conceptually has:

```text
PID UI
  │
Electron Main
  │
Pi Host
  │
AgentSessionRuntime
```

Process isolation protects the desktop application from:

* extension crashes
* accidental `process.exit`
* leaked global state
* runaway memory
* native dependencies
* extension-level failures

It also preserves a clean boundary between graphical application lifecycle and agent runtime lifecycle.

---

# 4. Runtime Version

PID runs the Pi version it pins (`@earendil-works/pi-coding-agent` in `package.json`).

The relationship is:

```text
PID release
    │
    └── pinned compatible Pi runtime

Pi terminal
    │
    └── its installed runtime
```

PID does not dynamically load an arbitrary globally-installed Pi package to chase exact version equality with the terminal; that would trade a visible, testable pairing for an unpredictable one. A `pi` binary on PATH is not required.

If PID ever moves into the Pi monorepo, the pinned dependency naturally becomes the shared workspace runtime.

Runtime divergence must stay visible: Settings and Diagnostics show the PID runtime version, the terminal's version where one is installed, and whether they match. Divergence is allowed; silent divergence is not.

---

# 5. Session Storage

Pi owns persistent sessions.

PID uses Pi's normal `SessionManager` and normal session directory.

Conceptually:

```text
                 ~/.pi/agent/sessions/
                           │
                    Pi session JSONL
                           │
                 ┌─────────┴─────────┐
                 │                   │
              Pi TUI                PID
```

PID does not serialize a second conversation format.

PID does not convert Pi messages into a PID session database and later reconstruct Pi state from it.

The Pi session file is authoritative.

---

# 6. PID Session Index

PID may maintain a session index to support fast graphical navigation and search.

The index is derived:

```text
Pi session files
      │
      ▼
PID index
      │
      ├── search
      ├── previews
      ├── folder grouping
      └── ranking
```

The index may contain:

* session ID
* path
* folder
* title
* timestamps
* searchable user text
* searchable assistant text
* derived Git metadata

The index must be rebuildable.

Deleting it must not delete or alter Pi sessions.

---

# 7. Live Session Lifecycle

A session can exist in two PID states:

```text
Closed
  session exists on disk
  no Pi Host required

Live
  Pi Host running
  AgentSessionRuntime loaded
```

Opening a historical session starts a Pi Host only when runtime interaction is required.

Several sessions may be live simultaneously.

Each live session should remain isolated enough that extension-level process-global state cannot accidentally bleed between unrelated runtimes.

---

# 8. One Active Writer

Pi TUI and PID can both open the same session over time.

They should not independently mutate the same session at the same time.

PID therefore treats a session as having one active writer.

Typical handoff:

```text
PID
 │
 │ wait for idle / abort
 │
 │ dispose runtime
 ▼
session file
 │
 ▼
Pi TUI
```

PID should provide an **Open in Pi TUI** action.

Before handoff:

* active generation is resolved
* the Pi Host releases the session
* persistent state has been written

If the session file changes externally while a PID runtime is active, PID should detect the change and require reload or handoff before accepting another prompt.

PID does not attempt transparent multi-writer merging.

---

# 9. Information Architecture

The main product structure is:

```text
Sessions
Skills
Extensions
Settings
+ extension-contributed surfaces
```

Sessions use:

```text
Folders
  ↓
Sessions
  ↓
Conversation
  ↓
Composer
```

The conversation remains the primary workspace.

Skills and Extensions are ecosystem surfaces rather than settings categories. Anything else in the navigation — MCP or otherwise — arrives as a page an installed Pi extension contributes; PID core knows no product by name and keeps no entry for one that is not installed.

---

# 10. Folder Model

A Folder is a real filesystem directory.

PID groups Pi sessions by their working directory.

There is no PID Project entity.

Typical sidebar:

```text
~/dev/pi
  ├─ Refactor session
  ├─ MCP investigation
  └─ UI cleanup

~/dev/gotato
  ├─ Runtime design
  └─ Benchmarking
```

Folder-level state is mostly presentation:

* expanded / collapsed
* recent
* filtering
* activity
* Git metadata

No hidden context is attached merely because sessions share a folder.

---

# 11. Conversation Timeline

The timeline renders Pi session state with graphical hierarchy.

## User Messages

Clearly attributed and visually distinct.

## Assistant Messages

Rendered as Markdown with code blocks and rich links.

## Thinking

Lower visual weight and collapsible.

## Tool Calls

Rendered using Tool Cards.

## Tool Results

Displayed inline or through specialized viewers.

## Compaction

Shown as an explicit timeline boundary.

## Errors

Use consistent error presentation regardless of whether they originate from:

* model
* tool
* extension
* MCP
* runtime

## Finished Turns

Detailed working steps may collapse after completion behind a summary such as:

```text
Worked for 1m 53s
4 tool calls
2 files edited
66.6k tokens
```

Expanding restores the full sequence.

Historical turns may load collapsed by default.

---

# 12. Tool Rendering

The generic tool renderer understands:

```text
tool name
status
input
output
error
timing
```

Specialized renderers improve common cases:

```text
read       → file viewer
edit       → diff
write      → file summary
bash       → command + terminal output
grep       → search results
image      → image viewer
```

Specialized rendering is a presentation concern.

The underlying call remains a normal Pi tool call.

---

# 13. Extensible Tool Rendering

PID core must not contain permanent special cases for every tool in the Pi ecosystem.

Tool rendering therefore supports registration (`src/renderer/contributions/tools.tsx`):
first match wins, the generic Tool Card is the fallback, and a throwing
renderer degrades to the card rather than blanking the transcript. Today
only built-ins register — third-party presentation code has no loader yet —
but match order, fallback and failure isolation are decided and tested there.

Conceptually:

```text
Pi Tool Result
      │
      ▼
Renderer Registry
      │
 ┌────┴─────┐
 │          │
match     no match
 │          │
custom    generic
viewer    Tool Card
```

A third-party presentation extension should be able to recognize:

* tool name
* namespace
* structured output
* declared metadata

and provide an alternative renderer.

The generic Tool Card is always the fallback.

---

# 14. Composer

The composer is always available.

It describes the next Pi interaction.

Primary state includes:

* draft
* attachments
* selected model
* thinking level
* context usage
* send mode

While Pi is active, text can still be entered and queued.

The composer does not create a second prompt-processing system.

Final prompt semantics remain Pi's.

---

# 15. Composer Sigils

PID provides four contextual discovery surfaces:

```text
/   Skill
@   File
#   Pi Action
$   Session Reference
```

These are PID interaction conventions.

They map onto real underlying concepts.

---

# 16. `/` Skill

The picker displays skills available to the current Pi environment.

Selection invokes Pi's existing skill semantics.

PID provides:

* search
* metadata
* visual selection

Pi provides the skill.

---

# 17. `@` File

The file picker operates over the real current filesystem.

PID may maintain a derived filename index for speed.

Selecting a file creates a visible reference to the path.

The path remains real.

Pi decides whether and how to read it through its tools.

---

# 18. `#` Pi Action

`#` exposes Pi actions graphically.

Examples include:

* compact
* model selection
* thinking level
* fork
* tree navigation
* abort

A `#` action should invoke the real Pi behavior.

It must not secretly translate into a natural-language prompt when a real runtime action exists.

---

# 19. `$` Session Reference

`$session` explicitly introduces content from another Pi session into the current context.

It is not memory.

It is not navigation.

Flow:

```text
search session
    ↓
select scope
    ↓
inspect content
    ↓
see estimated size
    ↓
send
    ↓
content becomes explicit context
```

Possible scopes include:

* summary
* latest N messages
* selected range
* search hit and neighbors

The user must be able to inspect what will be included.

Nothing crosses session boundaries automatically.

---

# 20. Active Runs

Pi owns queue semantics.

PID visualizes them.

Typical state:

```text
Active response
      ↓
Queued steer
      ↓
Queued follow-up
```

PID may provide graphical operations for changing queue intent where Pi permits it.

The queue shown by PID should reflect Pi runtime state rather than a second PID queue.

---

# 21. Fork and Branching

Pi session trees are the source of truth.

PID adds graphical navigation.

Fork creates a separate Pi session from a selected point.

Tree navigation changes the active path within a session where Pi supports it.

PID may display:

* parent
* children
* siblings
* branch points
* current leaf

No separate PID lineage database is required.

---

# 22. Pi Extensions

Pi extensions execute inside the Pi Host through Pi's normal extension system.

PID does not reinterpret their agent behavior.

Architecture:

```text
Pi Extension
     │
     ├── tools
     ├── commands
     ├── hooks
     ├── session state
     └── UI requests
             │
             ▼
      PID UI Adapter
             │
             ▼
       Desktop UI
```

Where Pi exposes UI abstractions, PID maps them to desktop equivalents.

Examples:

```text
confirm       → dialog
select        → graphical selector
input         → input dialog
notification  → notification
status        → status presentation
```

Terminal-specific implementation details may be unavailable.

That does not change extension runtime semantics.

---

# 23. PID Presentation Extensions

PID also has an extensibility layer of its own.

Its purpose is presentation and interaction, not agent semantics.

**The contribution is code, not a description.** This is settled by how the upstream does it, twice:
a Pi extension hands pi-tui a factory that returns a `Component` it built out of pi-tui's own
widgets, and the browser frontend Pi used to ship took a renderer function returning that host's own
view type. Neither asks the extension to fill in a schema. A host that accepts only a description
caps every extension at what the host author thought of first, which is the wrong way round and the
reason the interim `<ns>:<kind>/v<n>` channel is an interim.

So: the host supplies the component library, the theme and the mount points; the extension supplies
the composition.

Mount points, each one a place PID already puts something of its own. A slot nothing occupies is a
slot nobody has looked at, so the list grows when an extension needs one, not before:

```text
page     a navigation entry and the page behind it   api.page({ label, note, search, render })
header   the session title bar's second line          api.header({ render })
strip    the line above the composer                  api.strip({ render })
tool     a tool call in the transcript, by name       api.tool({ names, render })
```

A page is drawn inside the frame PID's own pages use — the heading, the one-line note under it, the
search box, the scrolling region — rather than into a blank div. That split is the rule the whole
layer follows: the chrome is the host's, so an extension's page sits at the same rhythm as Skills
and Extensions without copying anything; what a query *matches* is the extension's, because only it
knows whether a word should reach a row's title, its children, or the error underneath. The box's
text arrives as `ctx.query`.

A plugin may also import `react`. Not as a convenience: a page that cannot hold state cannot
remember which of its rows are open, and every row it has must then be open at once — which is what
a hundred and fifty tools in one flat list looks like. It resolves to the window's own React for the
same reason the JSX runtime does; a bundled second copy throws on the first hook.

The first three hand a place over wholesale and are drawn from the plugin's own published state.
`tool` is a lookup instead: a tool call arrives in the middle of the transcript and nothing above it
knows which extension owns the name, so the timeline asks per call and falls through to PID's own
card when nobody claims it. Its renderer is handed PID's own row frame with the call already in it —
the chevron, the status, the output and any images the tool returned — so an extension says what is
different about its tool and inherits the rest, the way a Pi tool's `renderCall` composes pi-tui's
widgets rather than painting a row from scratch.

The end of the line takes a node rather than a string, which is where an extension's row comes to
read a little differently from `read` and `bash` without inventing a second visual language. PID's
own rows put text there — `edit` says `+3 −1`. A call that went somewhere marks it instead: a tinted
`Badge` for the web backend that answered, or for the vision model that described a picture. The
distinction is not decoration; it is that a built-in tool always goes to the same place, so it has
nothing to mark.

Not implemented, and not promised: a composer line, a modal, a toast, an unconstrained overlay.

The exact registration signature may evolve. The architectural boundary should not.

A presentation contribution receives:

* Pi state snapshots relevant to presentation
* whatever its own agent half published
* the ability to run a command in the session it belongs to
* PID navigation

It should not become an alternative owner of the AgentSession. It runs commands the way a user
types them; it does not write session files.

---

# 24. Pi Extensions With Rich PID Presentation

A project may provide both runtime behavior and richer desktop presentation.

Conceptually:

```text
package / extension family
        │
        ├── Pi Extension
        │     ├── tools
        │     ├── commands
        │     └── hooks
        │
        └── PID Presentation
              ├── renderer
              ├── inspector
              └── panel
```

The Pi extension must remain useful without PID.

The presentation contribution may depend on PID.

This allows PID to be highly extensible without creating a second agent ecosystem.

---

# 25. Presentation Extension Isolation

Presentation extensions must not compromise Pi session integrity.

They should not directly mutate Pi persistence or bypass Pi runtime semantics.

Isolation is not a sandbox, and pretending otherwise would be dishonest. Pi states its own boundary
plainly — extensions are modules that run with the user's full permissions, and installing one is
the trust decision. A presentation half is the same package as an agent half that already has the
filesystem, so a wall between the window and that code would protect nothing while costing the
extension the freedom that makes it worth writing.

What PID does owe:

* a failure in one contribution degrades that contribution, not the window
* a failure surfaces where the author will find it, next to the errors its agent half already raises
* a way to start with nothing loaded, so a broken contribution cannot lock the user out

PID core should always retain a generic fallback presentation.

---

# 26. Ecosystem Pages

## Skills

The Skills page reflects skills from the active Pi environment.

It may show:

* name
* description
* source
* path
* scope
* state

Changes to Pi skill configuration should use Pi-compatible configuration mechanisms.

## Pages an Extension Contributes

Skills and Extensions are PID's own, because they read Pi's configuration and exist whatever is
installed. Everything else in the navigation was put there by an extension, and is there only while
one is.

PID renders such a page and learns nothing about its subject. Whether the rows are MCP servers,
build targets or open pull requests is the publisher's business; PID knows it was handed rows.

Every affordance on the page is a command string PID runs the way a typed slash command runs, so the
same switch works in the terminal and needs no PID-specific code behind it.

No extension, no page, and no navigation entry. A PID with nothing installed has neither the page
nor any code that knows the page could exist.

## Extensions

The Extensions page reflects Pi extensions.

It may show:

* source
* scope
* state
* tools
* commands
* compatibility
* available graphical integrations

A terminal-dependent extension may be marked partially compatible without being rewritten into a PID-specific runtime.

---

# 27. Presentation Primitives

PID draws its own window out of a small set of primitives that know nothing about sessions, tools or
IPC: rows, icon buttons, toggles, segmented controls, badges, dots, tabular numerals, modals,
popovers, menus, panels, dividers, scroll regions, and one table mapping five tones to classes.

They live in `src/renderer/ui/`. Everything that knows what a session or a tool call is lives in
`src/renderer/components/`.

Two properties matter and only hold together:

* **PID uses them itself.** A primitive nothing draws with is a primitive nobody has checked. This is
  also how pi-tui works — its own interactive mode is built from the same `Text`, `VStack` and
  `SelectList` an extension imports.
* **They are the hand-out set.** When an extension contributes desktop presentation, these are what
  it composes. A host that offers a component library it does not use itself is offering a guess.

The export surface is deliberately smaller than the implementation, again following pi-tui, which
keeps its layout engine and abstract bases out of its public index.

Theme is not a parameter here. A terminal has no cascade, so pi-tui threads a `theme` object through
every factory; the window has CSS custom properties, so a primitive written against `text-ink-3`
follows the user's theme and type scale without being told.

---

# 28. Search

Search operates over derived indexes.

Two primary classes exist:

## Navigation Search

Fast filtering for:

* folders
* sessions
* files
* skills
* extensions
* commands

## Session Content Search

Indexes selected Pi session content for historical retrieval and `$session`.

Search output never becomes implicit context.

Retrieval and context injection are separate operations.

---

# 29. Files

Files remain filesystem paths.

PID may provide:

* fuzzy search
* previews
* attachment chips
* file metadata
* drag and drop
* reveal in Finder

Pi continues to perform actual agent filesystem operations through its tools.

---

# 30. Attachments

A user can:

* drop files
* paste images
* choose files
* choose folders

Existing paths remain paths.

Temporary pasted data without a path may be written to an operating-system temporary location.

PID should avoid building a permanent attachment store unless Pi itself requires one.

Attachments remain visible to the user.

---

# 31. Git and Worktrees

Git remains authoritative.

PID may inspect:

* branch
* dirty state
* worktree relationships
* divergence

A Git worktree is a real directory and may therefore be opened as another Folder.

If an extension binds a session to a different working tree, PID displays that binding from what the extension publishes, not from a model of its own.

PID does not create a parallel source-control database.

---

# 32. Models and Providers

The Pi runtime remains authoritative for:

* model discovery
* provider information
* authentication
* model selection semantics
* thinking support

PID provides model selection UI for the session.

PID does not require the user to configure the same provider twice.

A separate PID model registry is explicitly avoided.

---

# 33. Settings

Settings are divided by ownership.

## PID Settings

Examples:

* appearance
* font size
* density
* collapse behavior
* keyboard behavior
* notifications
* sidebar state
* layout
* search preferences

## Pi Settings Exposed Through PID

PID may expose Pi settings when doing so provides a useful graphical control.

Changing them must modify Pi's real configuration through Pi-compatible mechanisms.

PID should not silently maintain a local override that only affects PID unless the setting is genuinely presentation-specific.

---

# 34. PID-Owned Data

PID may own:

```text
layout
window state
recent folders
UI preferences
search index
preview cache
presentation-extension settings
diagnostic cache
```

PID should not own:

```text
conversation truth
Pi session structure
model registry
provider credentials
Pi extension state
skill semantics
agent compaction state
tool semantics
Git state
```

This boundary should remain visible in the codebase.

---

# 35. Desktop Process Model

Target process responsibilities:

```text
PID Renderer
    │
    ├── visual state
    ├── conversation rendering
    ├── navigation
    └── presentation extensions

Electron Main
    │
    ├── windows
    ├── OS integration
    ├── Pi Host lifecycle
    └── trusted IPC

Pi Host
    │
    ├── AgentSessionRuntime
    ├── SessionManager
    ├── Pi tools
    ├── skills
    ├── Pi extensions
    ├── model runtime
    └── agent execution
```

The renderer should not directly own Pi runtime state.

IPC should carry structured events and commands rather than duplicate agent semantics.

---

# 36. Backend Boundary

PID speaks to a live session behind a narrow backend boundary, not behind Pi's `pi --mode rpc` transport.

Conceptually:

```text
PiCommand       prompt() steer() followUp() abort()
                newSession() openSession() fork() navigateTree()
                setModel() setThinkingLevel()
PiEvent         subscribe()
PiSessionState  getState()
```

The contract lives in `src/shared/protocol.ts` — PID's own commands, events, dialogs and session state, shaped from `AgentSession` and `AgentSessionEvent` so a field cannot drift from what the agent returns. One Electron utility process per open session hosts Pi's own `AgentSessionRuntime` (`src/main/pi/session-worker.ts`, spawned by `src/main/pi/session-process.ts`); that file is the only place that drives Pi's agent API.

There is exactly one runtime path. No second backend exists, and none should be added as a compatibility or migration shim: PID product behavior depends on this boundary alone.

---

# 37. Round-Trip Invariant

The backend boundary holds when the same Pi session behaves equivalently across PID and the Pi TUI:

* prompt
* streaming
* tool execution
* skills
* extensions
* MCP
* model selection
* thinking level
* steer
* follow-up
* queue
* compaction
* fork
* tree navigation
* session persistence
* TUI round-trip

This is an ongoing invariant, not a migration gate: there is no legacy backend left to remove, so the list exists to catch regressions in the one path PID has.

---

# 38. Failure Behavior

PID should fail at the correct ownership boundary.

Examples:

### Pi runtime failure

Show Pi runtime failure.

Do not silently reconstruct state through PID.

### Presentation extension failure

Fall back to generic PID presentation.

Do not fail the Pi session.

### Search index corruption

Delete and rebuild the index.

### External session mutation

Stop writes and reload.

### Unsupported extension UI

Preserve runtime behavior where possible and clearly mark unavailable presentation.

The fallback should generally move toward Pi truth, not toward more PID-owned state.

---

# 39. Target Property

The architectural target is:

```text
        one Pi environment
                │
        one set of semantics
                │
        one session system
                │
        one extension runtime
                │
        ┌───────┴───────┐
        │               │
      Pi TUI           PID
                        │
               extensible presentation
```

PID becomes more capable by improving how Pi is exposed and by allowing the presentation layer to grow.

It does not become more capable by gradually taking ownership away from Pi.

That boundary is the design.

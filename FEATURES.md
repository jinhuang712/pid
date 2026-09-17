# FEATURES

This document defines PID's target product surface.

It is a capability inventory, not an architecture document and not a statement of implementation status.

Features use the following ownership tags:

```text
[Pi]             Pi owns the underlying behavior or state.
[Presentation]   PID renders or visualizes an existing concept.
[Desktop]        Desktop-native interaction or operating-system integration.
[PID]            Legitimately PID-owned UI state or derived infrastructure.
[Extension]      Extensible PID presentation surface.
```

If a feature appears to require a new category such as `[Agent Semantic]`, stop and reconsider the boundary.

---

# 1. Sessions

* create a persistent Pi session `[Pi]`
* open an existing Pi session `[Pi]`
* resume a Pi session `[Pi]`
* switch between sessions `[Pi]` `[Desktop]`
* open Pi TUI sessions in PID `[Pi]`
* continue PID sessions in Pi TUI `[Pi]`
* current session identity `[Pi]`
* session name `[Pi]`
* session folder `[Pi]`
* session history `[Pi]`
* session tree `[Pi]` `[Presentation]`
* closed-session browsing without starting a runtime `[PID]`
* multiple live sessions `[Desktop]`
* session activity indicators `[Presentation]`
* external session change detection `[Desktop]`
* Open in Pi TUI `[Desktop]`
* safe handoff between PID and terminal ownership `[Desktop]`

PID maintains no separate authoritative conversation database.

---

# 2. Folder Navigation

```text
Folders
└── Sessions
```

* recent folders `[PID]`
* open folder `[Desktop]`
* forget folder `[PID]`
* sessions grouped by working directory `[Pi]` `[Presentation]`
* folder-level session count `[Presentation]`
* activity indicators on folders `[Presentation]`
* folder filtering `[PID]`
* branch information where Git is available `[Presentation]`
* reveal folder in filesystem `[Desktop]`

There is no Project entity.

---

# 3. Conversation

* user messages `[Pi]` `[Presentation]`
* assistant messages `[Pi]` `[Presentation]`
* streaming text `[Pi]` `[Presentation]`
* streaming thinking `[Pi]` `[Presentation]`
* tool calls `[Pi]` `[Presentation]`
* tool results `[Pi]` `[Presentation]`
* extension messages `[Pi]` `[Presentation]`
* errors `[Pi]` `[Presentation]`
* compaction markers `[Pi]` `[Presentation]`
* branch summaries `[Pi]` `[Presentation]`
* context usage `[Pi]` `[Presentation]`
* message metadata `[Pi]` `[Presentation]`
* long-output collapse `[Presentation]`
* finished-turn collapse `[Presentation]`
* rich Markdown `[Presentation]`
* code rendering `[Presentation]`
* copy actions `[Desktop]`
* selectable and inspectable message content `[Desktop]`

The conversation is viewer-first.

PID is not a code editor.

---

# 4. Tool Presentation

All Pi tools share a common Tool Card model.

This includes:

* built-in Pi tools
* Pi extension tools
* tools an extension registered

Common capabilities:

* name `[Pi]`
* execution state `[Pi]`
* input `[Pi]`
* output `[Pi]`
* error state `[Pi]`
* duration `[Presentation]`
* expandable details `[Presentation]`
* large output handling `[Presentation]`

Specialized built-in renderers may include:

* file read `[Presentation]`
* file write `[Presentation]`
* edit / diff `[Presentation]`
* shell command `[Presentation]`
* grep / search `[Presentation]`
* image `[Presentation]`
* structured JSON `[Presentation]`
* resource / artifact `[Presentation]`

Tool presentation is extensible.

Third-party renderers can replace the generic card for recognized tool output. `[Extension]`

---

# 5. Composer

The composer remains available while Pi is running.

It supports:

* text input `[Desktop]`
* multiline editing `[Desktop]`
* configurable Enter behavior `[PID]`
* image paste `[Desktop]`
* file drop `[Desktop]`
* file picker `[Desktop]`
* visible attachments `[Presentation]`
* attachment previews `[Presentation]`
* model selector `[Pi]` `[Presentation]`
* thinking-level selector `[Pi]` `[Presentation]`
* context gauge `[Pi]` `[Presentation]`
* abort `[Pi]`
* steer `[Pi]`
* follow-up `[Pi]`

Four primary sigils provide contextual discovery:

```text
/   Skill
@   File
#   Pi Action
$   Session Reference
```

---

# 6. `/` Skills

* list currently available skills `[Pi]`
* fuzzy search `[Desktop]`
* metadata `[Pi]`
* source `[Pi]`
* invocation `[Pi]`
* insert skill invocation `[Desktop]`

PID improves discovery.

Skill semantics remain Pi's.

---

# 7. `@` Files

* fuzzy file search `[PID]`
* recent files `[PID]`
* path preview `[Presentation]`
* file type `[Presentation]`
* hidden-file handling `[PID]`
* ignore patterns `[PID]`
* insert visible file mention `[Desktop]`

An `@` mention refers to a real file path.

PID does not create hidden file context merely because a file is mentioned.

---

# 8. `#` Pi Actions

Expose actions that already exist in Pi, such as:

* change model `[Pi]`
* change thinking level `[Pi]`
* compact `[Pi]`
* fork `[Pi]`
* navigate branch `[Pi]`
* abort `[Pi]`
* extension commands where appropriate `[Pi]`

`#` is graphical discoverability for Pi actions.

It is not a second command language.

---

# 9. `$` Session References

A session may explicitly reference content from another Pi session.

Capabilities:

* global session search `[PID]`
* folder-scoped search `[PID]`
* session preview `[Presentation]`
* selected scope `[Desktop]`
* exact included content preview `[Presentation]`
* token estimate `[Presentation]`
* visible reference token `[Presentation]`
* visible referenced content after send `[Presentation]`

Possible scopes include:

* session summary when one exists `[Pi]`
* latest messages `[Pi]`
* selected message range `[Pi]`
* search hit with neighboring messages `[PID]`

Nothing is injected silently.

---

# 10. Active Run and Queue

* streaming run state `[Pi]`
* abort `[Pi]`
* steer `[Pi]`
* follow-up `[Pi]`
* pending steer messages `[Pi]`
* pending follow-ups `[Pi]`
* queue visualization `[Presentation]`
* remove queued item where Pi allows `[Pi]`
* promote follow-up to steer `[Desktop]`
* run-complete notification `[Desktop]`

PID exposes Pi's queue semantics rather than creating another scheduler.

---

# 11. Branching and Fork

* session tree `[Pi]`
* navigate existing branch `[Pi]`
* fork from current state `[Pi]`
* fork from an earlier point `[Pi]`
* clone where supported by Pi `[Pi]`
* parent lineage `[Pi]` `[Presentation]`
* sibling sessions `[Pi]` `[Presentation]`
* children `[Pi]` `[Presentation]`
* graphical tree navigation `[Presentation]`

Fork lineage comes from Pi session data.

---

# 12. Session Search

Search is retrieval infrastructure, not memory.

Capabilities:

* search session names `[PID]`
* search first messages `[PID]`
* search user messages `[PID]`
* search assistant messages `[PID]`
* folder filter `[PID]`
* fuzzy ranking `[PID]`
* result preview `[Presentation]`
* branch metadata `[Presentation]`
* Git/worktree metadata `[Presentation]`

The index is derived from Pi session files and can be rebuilt.

---

# 13. Models

* show Pi-available models `[Pi]`
* group by provider `[Presentation]`
* search `[Desktop]`
* model metadata `[Pi]`
* select model for session `[Pi]`
* thinking-level support `[Pi]`
* scoped model information where Pi exposes it `[Pi]`

PID does not maintain its own model registry.

Provider credentials and model registration remain Pi concerns.

---

# 14. Skills Page

Skills are a first-class ecosystem surface.

* list `[Pi]`
* search `[Desktop]`
* description `[Pi]`
* source `[Pi]`
* path `[Pi]`
* scope `[Pi]`
* usability state `[Pi]`
* reveal source `[Desktop]`
* enable / disable where Pi supports configuration `[Pi]`

PID has no separate skill ecosystem.

---

# 15. Pages an Extension Brings

An ecosystem surface belongs to whatever provides it. A capability that reaches Pi through an
extension brings its page from that extension too: a PID without it installed has no such page, no
navigation entry, and no code for one.

PID renders the page and learns nothing about its subject `[Extension]` `[Presentation]`. Whether
the rows are servers, build targets or open pull requests stays with whoever published them.

Every switch and button is a command PID runs the way a typed slash command runs, so the same
affordance works in the Pi terminal and needs no PID-specific code.

The page crosses as a description today — rows with a title, a subtitle and badges; a switch as two
commands; buttons; one level of nesting; key/value detail behind an expander. That caps an extension
at the fields PID declared in advance, which is the wrong way round. §18 is where it goes: the
extension composes PID's own primitives instead of filling in PID's form.

---

# 16. Pi Extensions Page

Pi Extensions are a first-class ecosystem surface.

* list loaded and discoverable extensions `[Pi]`
* search `[Desktop]`
* source `[Pi]`
* metadata `[Pi]`
* path `[Pi]`
* scope `[Pi]`
* enabled state `[Pi]`
* enable / disable where Pi supports it `[Pi]`
* contributed tools `[Pi]`
* contributed commands `[Pi]`
* per-interface-call support, this host against the terminal `[Presentation]`

Behavior runs in both hosts. The interface is where they differ, so the page reports that per
`ctx.ui` member rather than as one verdict:

```text
Full                         everything it asks for, PID does
Reduced                      PID runs it; some calls have no effect here
Terminal parts, stood down   it checks ctx.mode and skips them here
Terminal parts, attempted    it does not check, so those calls do nothing
```

PID does not fork Pi extension behavior.

---

# 17. Extension UI Mapping

Where Pi exposes interface-level extension primitives, PID maps them to desktop equivalents.

Examples:

* confirm → dialog `[Presentation]`
* select → graphical selector `[Presentation]`
* input → desktop input dialog `[Presentation]`
* notification → native/in-app notification `[Presentation]`
* status → the extension strip above the composer `[Presentation]`
* widget → the same strip, any key, no allowlist `[Presentation]`

A confirmation's message is rendered as markdown, so an extension with a card to show — a tree, a
table of files — writes it as a fenced block and the dialog hands it over as one. Prose is
unaffected: a plain message keeps its own line breaks. `[Presentation]`

A widget key is an identity, the way Pi defines it: PID replaces and clears by key, and reads no
meaning into the key or the lines.

An extension that wants graphical presentation rather than a line of text currently names its widget
`<ns>:<kind>/v<n>` and sends JSON, and PID renders the kinds it knows —
 a worktree binding in the session header, a described page as a navigation entry.
Unclaimed kinds show as their payload, so an author can see what arrived. `[Extension]`

This is an interim with a ceiling: an extension can say only what PID's field list already allows,
and widening that list is how the ceiling gets rebuilt rather than removed. §18 is the replacement —
the extension ships its desktop presentation as code and composes PID's primitives, which is how a
Pi extension already works against pi-tui's.

No extension, no entry, either way. `[Extension]`

Terminal implementation details without a meaningful graphical mapping degrade to nothing, and the
Extensions page names which ones for each extension.

---

# 18. PID Presentation Extensibility

PID itself should be highly extensible.

Presentation extensions may contribute:

### Tool Renderers

Custom visualization for a Pi tool or class of tool results. `[Extension]`

### Artifact Viewers

Render structured output such as:

* HTML
* diagrams
* images
* structured data
* custom artifacts

`[Extension]`

### Panels

Additional graphical inspection surfaces. `[Extension]`

### Inspectors

Contextual inspection for session, tool, file, extension, or artifact state. `[Extension]`

### Commands

Desktop actions discoverable through the command palette. `[Extension]`

### Status Contributions

Small status indicators attached to appropriate PID surfaces. `[Extension]`

### Navigation Contributions

Additional ways to navigate Pi or extension-defined state. `[Extension]`

### Composer Contributions

Graphical affordances around input where they do not redefine Pi prompt semantics. `[Extension]`

The extension surface should prefer general primitives over extension-specific logic in PID core.

---

# 19. Pi Extension + PID Presentation Integration

A Pi extension may optionally have richer PID presentation without making PID necessary for its core behavior.

Target model:

```text
Pi extension
├── runtime behavior
│   ├── tools
│   ├── commands
│   └── hooks
│
└── optional PID presentation
    ├── renderer
    ├── panel
    └── inspector
```

The runtime half remains usable without PID.

The presentation half may be desktop-specific.

---

# 20. Git and Worktrees

* show current Git branch `[Presentation]`
* show dirty state `[Presentation]`
* show relevant divergence metadata `[Presentation]`
* recognize real worktree directories `[Presentation]`
* allow a worktree directory to be opened as a normal Folder `[Desktop]`
* display Pi extension-defined worktree bindings `[Pi]` `[Presentation]`

Git remains authoritative.

PID does not maintain a parallel worktree database.

---

# 21. Settings

PID settings contain PID-owned presentation preferences and explicit controls for Pi settings that Pi already exposes.

PID-owned categories may include:

* Appearance `[PID]`
* Conversation `[PID]`
* Sessions `[PID]`
* Search `[PID]`
* Files `[PID]`
* Notifications `[PID]`
* Extensions UI `[PID]`
* Advanced `[PID]`

Skills and Pi Extensions remain first-class pages rather than being buried inside Settings, as does any page an extension brings.

PID does not build an alternate provider or model configuration system.

---

# 22. Desktop Integration

* keyboard shortcuts `[Desktop]`
* command palette `[Desktop]`
* drag and drop `[Desktop]`
* clipboard integration `[Desktop]`
* native notifications `[Desktop]`
* Finder integration `[Desktop]`
* Open in Terminal / Pi `[Desktop]`
* window state `[PID]`
* layout persistence `[PID]`
* theme `[PID]`
* packaging `[Desktop]`
* update mechanism `[Desktop]`
* diagnostics `[Desktop]`

---

# 23. Diagnostics

PID should make the Pi boundary inspectable.

Diagnostics may show:

* active Pi runtime version `[Pi]`
* runtime source `[Pi]`
* session path `[Pi]`
* session ID `[Pi]`
* working directory `[Pi]`
* loaded extensions `[Pi]`
* model `[Pi]`
* active tools `[Pi]`
* PID presentation extensions `[Extension]`
* derived index state `[PID]`
* runtime errors `[Presentation]`

Diagnostics exist to make integration understandable, not to introduce another configuration layer.

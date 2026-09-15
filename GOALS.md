# GOALS

This document defines what PID is trying to achieve and what it deliberately does not try to become.

It does not define product philosophy, feature-level behavior, or implementation architecture.

## Goals

### 1. Be a First-Class Graphical Interface for Pi

PID should make Pi genuinely comfortable to use as a desktop application.

It should not feel like a terminal wrapped in Electron.

The graphical interface should take advantage of:

* hierarchy
* navigation
* search
* rich rendering
* spatial organization
* graphical inspection
* native desktop interaction

while preserving Pi semantics underneath.

### 2. Coexist With the Pi TUI

PID does not replace the Pi terminal interface.

Both interfaces should remain useful and interchangeable.

A user should be able to move naturally between:

```text
PID
 ↓
Pi TUI
 ↓
PID
```

without changing agents, environments, or session formats.

### 3. Preserve Bidirectional Session Compatibility

A session created in PID must remain an ordinary Pi session.

A session created in the Pi TUI must be usable in PID.

Continuing work across interfaces must not require:

* import
* export
* conversion
* synchronization between separate databases
* migration into a PID-specific format

The same work remains Pi work regardless of interface.

### 4. Inherit Pi Instead of Reimplementing It

PID should reuse Pi's existing concepts and semantics wherever possible, including:

* sessions
* models
* providers
* authentication
* tools
* skills
* extensions
* context management
* compaction
* branching
* fork
* steer
* follow-up
* configuration

Following upstream Pi should remain cheaper than maintaining equivalent PID-owned behavior.

### 5. Make Long Sessions Better

PID should substantially improve the experience of sessions that last for hours, days, or longer.

The interface should make it easy to understand and navigate:

* conversation history
* reasoning
* tool activity
* large outputs
* diffs
* file changes
* context state
* compaction
* queue state
* branch history
* related sessions

The more valuable a session becomes, the interface should not become proportionally harder to use.

### 6. Make Sessions Easy to Find Again

Historical sessions should become useful assets rather than forgotten logs.

PID should provide fast retrieval across:

* folders
* session names
* user messages
* assistant messages
* relevant metadata

Search infrastructure must remain derived from Pi sessions rather than becoming a second session store.

### 7. Make Cross-Session Context Explicit

PID should make it convenient to bring information from another session into the current one.

That transfer must remain:

* explicit
* inspectable
* scoped
* understandable by the user

PID should not introduce hidden cross-session or project memory.

### 8. Make Pi's Interactive Semantics Better on Desktop

Pi concepts such as:

* steer
* follow-up
* queueing
* fork
* branching
* compaction
* model selection
* thinking level
* extension interaction

should receive desktop-native interaction models where graphical presentation improves them.

The underlying semantics remain Pi's.

### 9. Provide High-Quality Coding Presentation

PID should provide first-class rendering for coding-agent activity:

* Markdown
* code
* diffs
* edits
* file reads
* shell execution
* search results
* errors
* context usage
* tool results

The goal is better inspection, not to become an IDE.

### 10. Be Highly Extensible

PID should not require every useful graphical capability to be built into PID core.

The interface should expose stable extension surfaces for capabilities such as:

* tool renderers
* artifact viewers
* inspectors
* panels
* status contributions
* navigation contributions
* command-palette actions
* visualizations
* desktop integrations

The target is:

> **Small core. Large extension surface.**

PID should be able to gain substantial functionality without permanently increasing the complexity of its core.

### 11. Preserve Pi Extension Compatibility

Pi extensions should continue to run as Pi extensions.

PID should provide graphical mappings for extension interaction where practical without requiring extensions to become PID-specific.

Agent behavior remains in Pi.

PID may extend how that behavior is presented.

### 12. Make the Pi Ecosystem Discoverable

Skills, MCP, and Extensions should be visible, inspectable first-class parts of the desktop experience.

Users should be able to understand:

* what exists
* where it came from
* whether it is active
* what capabilities it contributes
* whether it can be represented by PID

These are ecosystem surfaces, not miscellaneous settings.

### 13. Keep MCP Inside Pi's Tool Model

MCP should not require PID to become an MCP runtime or agent platform.

MCP tools should flow through Pi's normal tool system.

PID may provide better discovery, inspection, authentication UI, status, and presentation.

### 14. Respect Real Filesystem and Git Concepts

PID should make folders, files, branches, and worktrees easier to navigate without replacing their underlying models.

A folder remains a directory.

A file remains a path.

Git remains the source of truth for Git state.

### 15. Keep PID-Owned State Lightweight

PID will inevitably own desktop-specific state such as:

* layout
* appearance
* window state
* recent folders
* search indexes
* previews
* caches

This state should remain small, derived where possible, and non-authoritative.

Deleting PID application state should not destroy Pi work.

### 16. Keep Upstream Adoption Cheap

Pi will evolve.

PID should be structured so that adopting upstream changes is routine rather than a recurring rewrite.

The amount of PID code that duplicates Pi behavior should therefore remain as small as possible.

### 17. Deliver a Native Desktop Experience

Compatibility with Pi must not mean reproducing terminal UI.

PID should feel intentionally designed for a graphical desktop environment.

Desktop-native interaction is a goal when it changes presentation rather than semantics.

---

## Non-Goals

PID is not trying to build:

* another coding agent
* another agent runtime
* a fork of Pi
* a Pi distribution
* a second session format
* a second authoritative session database
* a second model registry
* a second provider system
* a second authentication system
* a second agent-extension runtime
* project memory
* a project knowledge base
* automatic cross-session memory
* hidden persistent context
* an MCP platform
* an agent orchestration platform
* a workflow engine
* an IDE
* a source-control system
* a package marketplace
* feature-count parity with Cursor, Claude Code, Codex, or other agent products

PID also does not attempt to reproduce every terminal-specific visual primitive.

A Pi extension that fundamentally depends on terminal layout may have reduced graphical compatibility.

That should not force PID to become a terminal emulator.

---

## Success Criteria

PID is moving in the right direction when:

1. A user can move the same Pi session between PID and Pi TUI without conversion.
2. PID-specific application data can be deleted without destroying Pi work.
3. Pi upgrades require little or no reimplementation of agent semantics.
4. Ordinary Pi extensions can run without PID-specific forks.
5. New graphical capabilities can increasingly be added through extension points rather than changes to PID core.
6. Long sessions become easier to navigate as they grow.
7. Historical sessions become easy to retrieve and reuse explicitly.
8. PID provides substantial desktop value without making Pi dependent on PID.

The strongest sign of success is simple:

> Users think of PID and the TUI as two ways of using Pi, not as two different agents.

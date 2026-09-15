# PHILOSOPHY

These principles govern product and architectural decisions in PID.

They are intended for situations where several implementations are reasonable and the correct choice is not obvious.

When principles conflict, the earlier and more fundamental principle should generally win.

---

## 1. One Pi

There is one Pi.

PID must not create a second authoritative implementation of concepts already owned by Pi.

This includes:

* agent runtime
* sessions
* session semantics
* models
* providers
* authentication
* tools
* skills
* extensions
* compaction
* branching
* steering
* follow-ups
* agent configuration

PID is another interface to these concepts, not another owner of them.

If PID and Pi disagree about the meaning of Pi state, PID is wrong.

---

## 2. Pi Owns Semantics. PID Owns Presentation.

The primary boundary is:

```text
Pi
├── behavior
├── runtime
├── agent state
└── semantics

PID
├── rendering
├── layout
├── navigation
├── search
├── inspection
└── desktop interaction
```

PID may present the same behavior differently from the TUI.

A terminal confirmation may become a dialog.

A textual status may become a badge.

A tool result may become a specialized renderer.

A branch may become a graphical navigator.

The presentation does not need to match.

The semantics do.

> Compatibility means semantic parity, not pixel parity.

---

## 3. Express Pi, Do Not Replace Pi

Before implementing a Pi concept inside PID, first determine how Pi already represents that concept.

Prefer:

```text
Pi abstraction
    ↓
PID presentation
```

over:

```text
Pi behavior
    ↓
PID reconstruction
    ↓
PID-specific abstraction
```

Duplicating Pi behavior increases divergence, maintenance cost, and the probability that a future upstream change makes PID subtly incorrect.

If the correct abstraction belongs in Pi, prefer exposing or improving it upstream instead of permanently rebuilding it inside PID.

---

## 4. No Shadow Authority

PID may maintain derived state.

PID must not maintain competing truth.

Acceptable derived state includes:

* search indexes
* previews
* UI caches
* recently opened folders
* layout state
* thumbnails
* derived metadata
* navigation indexes

Derived state must be disposable and rebuildable.

A useful test is:

> If all PID-owned state disappeared, could this information be reconstructed from Pi, the filesystem, Git, or another real source of truth?

If not, PID may be taking ownership of something it should not own.

---

## 5. A Pi Session Is Always a Pi Session

PID does not have its own session format.

Sessions created through PID must remain ordinary Pi sessions.

Sessions created through the Pi TUI must be openable through PID.

Moving between the two interfaces must not require:

* export
* import
* conversion
* synchronization between two databases
* PID-specific migration

The same underlying Pi session is used by both interfaces.

Any PID session index is derived state.

### One Active Writer

Opening the same session from different interfaces is expected.

Actively mutating the same session from multiple independent runtimes at the same time is not.

PID should treat a Pi session as having one active writer.

External changes should be detected and handled explicitly rather than silently merging divergent in-memory runtime state.

---

## 6. Sessions, Not Projects

PID organizes work as:

```text
Folders
└── Sessions
```

A Folder is a real filesystem directory.

A Session is a real Pi session.

PID should not invent a Project entity unless a genuinely new persistent semantic concept requires one.

A container that merely groups sessions by directory is already a folder.

Do not rename real things into product abstractions without gaining something meaningful.

---

## 7. Explicit Over Magical

PID should prefer visible, understandable operations over invisible automation.

This applies especially to context.

PID should not silently create:

* project memory
* cross-session memory
* background knowledge bases
* implicit session summaries injected into new conversations
* invisible context inherited from other sessions

If information crosses a session boundary, the user should be able to see that it happened.

If configuration changes, the user should be able to understand what changed.

If Pi state is mutated, the operation should be explicit.

Agent systems already contain substantial implicit behavior.

PID should not add another hidden layer without a strong reason.

---

## 8. Extensions Belong to Pi

Agent capability is extended through Pi.

A Pi extension loaded while using PID remains a Pi extension.

Its:

* tools
* commands
* hooks
* agent behavior
* session state
* runtime lifecycle

should continue to use Pi mechanisms.

PID must not create a parallel agent-extension runtime merely to support desktop integration.

The desired direction is:

```text
Pi Extension
     │
     ▼
Pi Extension API
     │
     ▼
PID presentation
```

not:

```text
Pi Extension
     │
     ▼
PID agent-extension runtime
     │
     ▼
PID-specific semantics
```

An extension should ideally require no knowledge that PID exists.

---

## 9. PID Should Be Highly Extensible

Pi is highly extensible.

PID should be as well.

The PID core should not need to predict every graphical capability users may want in the future.

PID should expose stable extension surfaces for presentation and interaction.

Possible extension points include:

* tool-call renderers
* result viewers
* artifact viewers
* inspectors
* panels
* sidebar contributions
* status indicators
* command-palette actions
* navigation contributions
* file previews
* visualizations
* desktop integrations

The goal is:

> **Small core. Large extension surface.**

A successful PID should be able to grow its ecosystem without permanently growing its core at the same rate.

---

## 10. Extensibility Follows Ownership

Pi and PID extensibility serve different layers.

A useful default model is:

```text
Pi extension
├── runtime contribution
│   ├── tools
│   ├── commands
│   └── hooks
│
└── optional presentation contribution
    └── PID
```

Pi extends agent behavior.

PID extends presentation and interaction.

A PID-specific extension is acceptable when its purpose is inherently graphical or desktop-specific.

For example:

* visualization
* custom inspector
* graphical artifact viewer
* native desktop integration

Such an extension may depend on PID.

The underlying Pi session must not.

---

## 11. The Core Should Not Know Every Extension

PID core should expose general primitives rather than accumulate special cases for individual extensions.

Repeated logic such as:

```text
if extension == A
if extension == B
if extension == C
```

is evidence that an extension boundary is missing.

Prefer reusable concepts such as:

* renderer registration
* panel contribution
* status contribution
* action registration
* structured presentation metadata

PID should understand categories of presentation.

It should not need to know every product built on top of them.

---

## 12. Files Are Files. Folders Are Folders. Git Is Git.

PID should preserve real-world abstractions when they already exist.

A file is a filesystem path.

A folder is a filesystem directory.

A branch is a Git branch.

A worktree is a Git worktree.

PID may search, index, preview, render, or navigate these things.

It should not create parallel authoritative models for them.

The filesystem remains authoritative for files.

Git remains authoritative for source-control state.

---

## 13. Desktop Capabilities Are Additive

PID is allowed to do things that the Pi TUI does not do.

Otherwise there would be little reason for PID to exist.

Examples include:

* graphical navigation
* richer session search
* specialized diff rendering
* multiple panes
* native notifications
* drag-and-drop
* visual inspection
* worktree navigation
* richer extension presentation
* desktop-only visualizations

The requirement is not:

> Everything PID does must exist in the TUI.

The requirement is:

> PID must not make underlying Pi state dependent on PID.

A desktop-only interaction is acceptable.

Desktop-only ownership of Pi semantics is not.

---

## 14. Derived State Should Be Disposable

PID should be comfortable deleting and rebuilding its own caches and indexes.

This property should be intentionally preserved.

Disposable state makes upgrades easier.

It reduces lock-in.

It keeps ownership boundaries clear.

It prevents convenience infrastructure from quietly becoming critical infrastructure.

If PID-owned state becomes precious, review whether PID has taken responsibility for something that belongs elsewhere.

---

## 15. Prefer Upstream

Before adding a workaround, inspect Pi upstream.

If Pi already exposes the required behavior, use it.

If Pi nearly exposes it, prefer improving the upstream abstraction when practical.

Permanent compatibility layers should be a last resort, not the default development strategy.

Every duplicated semantic path increases the cost of following Pi.

PID should aim for upstream upgrades to feel routine.

---

## 16. Less Is More

More screen space does not justify more permanent complexity.

A graphical interface is better when it creates hierarchy.

Important information should be immediately visible.

Secondary information should be available.

Rare information should stay out of the way.

For example:

* long output can collapse
* thinking can collapse
* diagnostics can live behind inspection
* advanced controls can remain contextual
* uncommon settings do not need permanent surface area

The interface should reveal complexity progressively rather than display all of it simultaneously.

---

## 17. Progressive Disclosure Over Permanent Surface Area

Capabilities may exist without occupying permanent UI.

Prefer contextual discovery over permanent controls where appropriate.

This applies to:

* tools
* extensions
* diagnostics
* settings
* advanced session operations
* metadata
* detailed runtime state

Complexity underneath the interface is sometimes necessary.

Permanent user-facing complexity is not.

---

## 18. Escape Must Be Cheap

The user should never feel trapped in PID.

Moving from PID to Pi TUI should be normal.

Moving back should be normal.

Uninstalling PID should leave Pi intact.

A feature that creates meaningful switching cost between PID and Pi should be examined carefully.

The interface choice should remain reversible.

---

## 19. Feature Count Is Not the Goal

PID does not compete by accumulating every feature available in other coding-agent products.

Another product may reasonably own:

* a project database
* a memory system
* an MCP runtime
* its own extension ecosystem
* orchestration
* agent modes
* a custom session model

PID has a different architecture.

A feature that requires PID to become less Pi-native carries a larger cost than its visible usefulness suggests.

Fewer features with clean ownership are preferable to a larger system built on duplicated semantics.

---

## 20. Keep the Boundary Boring

The healthiest integration boundary is one the user rarely has to think about.

The same model should mean the same model.

The same session should remain the same session.

The same extension should remain the same extension.

The same Pi configuration should affect both interfaces.

PID should avoid introducing concepts whose primary purpose is explaining why PID behaves differently from Pi.

The closer PID stays to Pi semantics, the less boundary-specific behavior needs to exist.

---

## Decision Order

When principles conflict, prefer:

1. Pi semantic compatibility
2. Session integrity
3. Explicit user control
4. Single source of truth
5. Extensibility
6. Architectural simplicity
7. Native desktop experience
8. Feature completeness

This ordering is intentional.

Desktop UX matters.

Extensibility matters.

Features matter.

None of them matter enough to create another Pi.

---

## The Two Questions

When considering a new capability, ask:

> **Does this express Pi, or does this replace Pi?**

If it replaces a Pi-owned concept with a PID-owned implementation, reconsider the boundary.

Then ask:

> **Does this need to live in PID core?**

If a stable primitive can allow extensions to provide the capability instead, prefer the primitive.

These two questions should eliminate a large class of bad architectural decisions before they become code.

---

## Summary

**One Pi. Two interfaces.**

Pi owns semantics.

PID owns presentation.

Pi sessions remain Pi sessions.

Pi extensions remain Pi extensions.

PID is highly extensible at the presentation and interaction layer.

Files remain files.

Folders remain folders.

Git remains Git.

Derived state remains disposable.

Context remains explicit.

Desktop capabilities remain additive.

The best PID should be powerful precisely because it owns so little — and extensible enough that owning little does not mean doing little.

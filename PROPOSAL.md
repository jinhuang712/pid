# PROPOSAL

## Pi Is Already Good

PID begins with a simple observation:

**Pi is already a good coding agent.**

It has an unusually small and understandable core. It has sessions, tools, skills, extensions, model support, context management, branching, compaction, steering, follow-ups, and an ecosystem that can grow without requiring the core to absorb every possible use case.

More importantly, Pi has a clear character.

It does not try to become an IDE.

It does not try to own the entire developer workflow.

It gives the agent what it needs and stays out of the way.

That simplicity is a feature.

PID does not exist because Pi needs a better agent.

The agent is not the problem.

## The Terminal Has a Natural Limit

Pi's terminal interface fits Pi extremely well.

It is fast.

It is direct.

It works everywhere.

It keeps the distance between the user and the agent small.

For many sessions, there is no need for anything else.

But a coding session can grow.

A conversation that begins with:

> fix this bug

can become several hours of:

* reasoning
* tool calls
* long command outputs
* diffs
* file changes
* queued instructions
* compaction
* forks
* alternative approaches
* related sessions
* different worktrees
* extension state
* MCP tools
* historical decisions that suddenly matter again

At that point the limitation is not Pi.

It is the medium.

A terminal is fundamentally a stream.

The stream can be searched and scrolled, but it still gives very different kinds of information roughly the same spatial model.

A small status update and a thousand lines of build output both occupy vertical history.

A diff is text in the same flow as a conversation.

A branch exists, but not spatially.

A historical session exists, but usually somewhere behind another selector.

As the amount of useful information grows, the amount of navigation required to recover that information grows with it.

The session becomes more valuable at the same time that it becomes harder to see.

## This Is an Interface Problem

The natural response would be to build a more capable coding product around Pi.

Add a workspace model.

Add project state.

Add a database.

Add another tool system.

Add an MCP host.

Add memory.

Add a plugin platform.

Add agent modes.

Add orchestration.

Eventually the desktop application becomes the real product and Pi becomes one of the libraries underneath it.

That is a valid architecture.

It is not what PID is trying to build.

PID starts from a different question:

> What if nothing is wrong with Pi at all?

What if the missing piece is simply another way to interact with it?

A way that is better suited for:

* long-running sessions
* graphical information
* navigation
* search
* comparison
* inspection
* multiple sessions
* desktop interaction

without replacing the system underneath.

That is PID.

## One Pi. Two Interfaces.

PID is a desktop interface for Pi.

Not a desktop agent powered by Pi.

Not a new runtime built from Pi components.

Not a separate product that happens to understand Pi sessions.

A second interface.

The relationship should be as ordinary as:

```text
Git
├── CLI
└── graphical client
```

or:

```text
database
├── shell
└── graphical explorer
```

For Pi:

```text
                     Pi
                      │
                agent runtime
                      │
             ┌────────┴────────┐
             │                 │
          Pi TUI              PID
```

The terminal remains Pi.

PID is also Pi.

The interface changes.

The system does not.

## The Same Work Everywhere

A user should be able to begin working in PID because the task benefits from a graphical interface.

Later, they may open a terminal.

Perhaps they are SSHed into the machine.

Perhaps they simply prefer the terminal for the next step.

They open the same Pi session.

They continue working.

Later they return to PID.

The conversation is there.

The branch is there.

The compaction history is there.

The model state is there.

The extension state that belongs to the session is there.

There was no export.

No import.

No migration.

No "PID session."

It was always a Pi session.

The user should eventually stop thinking in terms of:

> I created this in PID.

They should think:

> This is my Pi session.

PID was merely the interface they happened to use.

## The Desktop Should Add Perspective

A desktop interface is useful because it can represent the same system differently.

A tool call can become a card.

A diff can become a real diff viewer.

Thinking can collapse without disappearing.

A fork can become visually navigable.

Queued steer and follow-up messages can become visible objects.

Historical sessions can be searched rather than remembered.

A worktree can appear next to its sibling.

Extension status can become inspectable.

Long output can stay available without dominating the conversation.

None of these require a different agent.

They require a richer presentation of the same agent.

PID should use the screen for what the screen is good at:

**hierarchy, navigation, comparison, visibility, and direct manipulation.**

## The Desktop Should Not Become the Owner

There is a dangerous point in almost every frontend.

A convenience is easier to implement locally than to derive from the underlying system.

So the frontend stores its own copy.

Then another.

Then it adds behavior around those copies.

Eventually the frontend has its own semantics.

The original system becomes merely an execution backend.

PID explicitly wants to resist that path.

Pi should remain meaningful without PID.

If PID is closed, Pi should still work.

If PID is uninstalled, the user's Pi sessions should still exist.

If the user opens the terminal, their environment should still make sense.

The desktop interface should make Pi easier to use.

It should not make Pi dependent on the desktop interface.

## A Different Kind of Extensibility

Pi is compelling partly because it does not have to contain every future idea.

It is extensible.

PID should inherit that spirit.

A successful desktop interface will encounter endless requests for:

* new tool renderers
* inspectors
* panels
* artifact viewers
* visualizations
* status surfaces
* navigation tools
* desktop integrations
* specialized interactions

Putting all of them into PID core would eventually destroy the simplicity that made the project attractive.

PID therefore should not merely *support Pi extensions*.

PID itself should be **highly extensible**.

Pi extensions extend what the agent can do.

PID extensions and presentation contributions should extend how those capabilities can be seen and interacted with.

The two should meet naturally without turning into two competing ecosystems.

The goal is not a large core.

The goal is:

> **a small core with a large space for extension.**

## Why Not Build Another Agent Product?

Because there are already many.

And because PID has a more specific opportunity.

Pi already provides the thing we would otherwise spend most of the project recreating:

the agent.

The interesting problem is not how to make another agent platform.

It is whether a graphical interface can remain genuinely subordinate to an existing, extensible agent runtime without gradually absorbing it.

If PID succeeds, its strength will come partly from what it refuses to own.

It does not need its own session universe.

It does not need its own provider ecosystem.

It does not need hidden project memory.

It does not need a parallel extension runtime.

It does not need to reinterpret Pi into another product.

It can concentrate on the part Pi's terminal intentionally does not optimize for:

the graphical experience.

## What Success Looks Like

Success is not that PID replaces the Pi TUI.

The TUI should remain useful.

PID should remain useful.

Some work will be better in one.

Some work will be better in the other.

The important property is that switching between them feels unremarkable.

The user should be able to move:

```text
PID
 ↓
Pi TUI
 ↓
PID
 ↓
Pi TUI
```

without crossing a product boundary.

The same Pi installation.

The same sessions.

The same models.

The same providers.

The same skills.

The same extensions.

The same tools.

The same semantics.

Different interface.

## The Bet

PID makes a narrow bet.

That a coding agent does not need to become a giant application in order to benefit from a great graphical interface.

That a GUI can be powerful without becoming authoritative.

That compatibility can be a product advantage rather than a constraint to work around.

That extensibility can keep the core small.

And that Pi is strong enough that the right thing to build around it is sometimes not another agent at all.

Just another way to see it.

## One Pi. Two Interfaces.

Pi is the agent.

Pi owns the runtime.

The terminal is one interface.

PID is another.

The work remains Pi.

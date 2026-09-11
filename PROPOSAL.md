# PROPOSAL

This document answers two questions: why PID exists, and what PID believes.
It does not describe features or implementation.

## Problem

Pi's terminal UI is simple, fast, and direct. For short sessions that is exactly right.

Long agent sessions are different. Over hours and days a single conversation accumulates:

- messages
- thinking
- tool calls and their outputs
- file modifications and diffs
- forks and branches
- queued steers and follow-ups
- context and compaction state
- a growing archive of historical sessions

A terminal renders all of this as one linear stream. The stream is honest, but it gradually stops being usable:

- **Information hierarchy** collapses. A one-line status and a 400-line tool output get the same visual weight.
- **Navigation** degrades. Scrolling back through a day of work is the only way to find anything.
- **Discoverability** suffers. Skills, actions, models, and sessions exist, but nothing surfaces them.
- **Session retrieval** is weak. "The session where we debugged the cache" is hard to locate and harder to bring back into context.
- **Visual comparison** is nearly impossible. Diffs, forks, and sibling worktrees have no side-by-side representation.
- **Long-session usability** decays. The more valuable a session becomes, the harder it is to work in.

None of these are agent problems. The agent is fine. They are presentation problems.

## Thesis

The fix is not a more complex agent.

The fix is a better view of an agent that is already good enough.

PID is that view: a desktop graphical frontend for Pi.

## Philosophy

**PID is not another coding agent. PID is another first-class frontend for Pi.**

Pi owns agent behavior.
Pi owns agent state.
PID owns presentation.

Everything PID does follows from a small set of beliefs.

### Less is more

A GUI's advantage is not showing more at once. It is expressing hierarchy more clearly. Default views stay clean; detail is one click away.

### No lock-in

Sessions created in PID are ordinary Pi sessions. Close PID and Pi still works. Open a PID session in the Pi terminal and it resumes. PID never traps users in its own data format.

### No hidden project memory

PID does not accumulate knowledge about a codebase behind the user's back. Two sessions in the same folder know nothing about each other unless the user explicitly says so.

### Sessions over projects

There is no Project entity. A project is an invented abstraction that only earns its keep when there is memory attached to it. Without memory, it is just a folder.

### Folders are real

A folder is a real filesystem directory. Sessions live under folders. That is the whole organizational model.

### Files are real

A file mention points at a real path. Pi reads it with its own tools. There is no shadow index pretending to be the file.

### Git is real

Branches and worktrees come from Git. A worktree is just another folder that happens to share a repository. PID reads Git; it does not maintain a parallel model of it.

### Pi remains usable without PID

This is a hard constraint, not an aspiration. PID adds a surface. It never becomes a dependency.

## What PID is not

- a Codex, Claude Code, or Cursor clone
- an IDE
- an agent platform
- a workflow engine
- a second agent runtime built on top of Pi

## Summary

Pi is the agent. PID is the window.

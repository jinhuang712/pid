# GOALS

## Goals

1. Be a high-quality graphical frontend for Pi.
2. Replace the UI half of the Pi terminal experience in daily work.
3. Inherit as much of upstream Pi as possible: semantics, sessions, models, providers, auth, skills, tools, extensions.
4. Coexist peacefully with the Pi terminal UI on the same machine and the same data.
5. Keep ordinary sessions bidirectionally compatible: PID sessions resume in Pi, Pi sessions open in PID.
6. Organize everything as Folders containing Sessions.
7. Make historical sessions easy to search.
8. Let a session explicitly reference another session's content via `$session`.
9. Make fork a natural, first-class interaction.
10. Give steer and follow-up a better GUI than the terminal can.
11. Let MCP tools flow through Pi's normal tool path.
12. Treat Skills, MCP, and Extensions as first-level pages.
13. Keep Settings fine-grained but restrained.
14. Read model configuration from Pi's local files only; never build a PID model registry.
15. Make worktrees a first-class Folder workflow.
16. Keep the desktop layer thin.
17. Keep the cost of following upstream Pi updates low.

## Non-Goals

- Reimplementing Pi.
- Building another agent runtime.
- Project Memory.
- Project Knowledge Base.
- A second authoritative session database.
- A second provider or auth system.
- A provider configuration UI.
- A model registry or model config editor.
- A second skill ecosystem.
- A second extension protocol.
- Guaranteed compatibility for every terminal-only extension.
- An IDE.
- A workflow engine.
- An agent platform.
- Feature-count parity with Codex, Claude Code, or Cursor.
- Automatic cross-session memory.
- Introducing Projects because of worktrees.
- Introducing a second agent runtime because of MCP.

## Constraints

### Pi First
Look at upstream before implementing anything. If Pi has it, expose it.

### Pi Coexistence
PID never breaks Pi. No silent changes to Pi's global configuration.

### Sessions Under Folders
There is no Project entity.

### No Memory
PID creates no implicit persistent context.

### Explicit Session Reference
Content from another session enters the current one only through an explicit user action such as `$session`.

### No Shadow State
Any PID-side copy of Pi data is derived, rebuildable, and non-authoritative.

### Thin Frontend
Desktop-specific code solves desktop problems only.

### Worktree Is Folder
Git is the source of truth for branches and worktrees.

### MCP Is Tooling
MCP changes nothing about the agent architecture. MCP tools are Tools.

### Extension Compatibility Is Best Effort
The core is never polluted to raise the compatibility rate.

### Model Source Is Pi
PID only reads Pi's local model data.

### Small Commits
One independent change, verified, inspected, committed. Then the next.

## Priority when constraints conflict

1. Pi compatibility
2. Session integrity
3. Explicit user control
4. Simplicity
5. Product philosophy
6. Desktop UX
7. Feature completeness

Fewer features beat a more complex architecture.

# FEATURES

Complete feature inventory, grouped by priority. Every feature carries a tag:

```text
[Pi]            capability that already exists in Pi; PID exposes it
[Presentation]  visualization of a Pi concept
[Desktop]       desktop-native affordance
[PID]           genuinely PID-owned state or behavior (UI preferences, caches)
```

If a feature would need the tag `[New Agent Semantic]`, stop and re-evaluate. It is almost certainly out of scope.

## P0 — Basic Pi Desktop

- create Pi session `[Pi]`
- open existing Pi session `[Pi]`
- resume session `[Pi]`
- user message `[Pi]`
- assistant message `[Presentation]`
- streaming `[Presentation]`
- thinking `[Presentation]`
- tool calls `[Presentation]`
- tool results `[Presentation]`
- errors `[Presentation]`
- composer `[Desktop]`
- abort `[Pi]`
- current working folder `[Pi]`
- read local Pi model list `[Pi]`
- select existing Pi model `[Pi]`
- thinking level `[Pi]`

## P1 — Pi Interaction

- steer `[Pi]`
- follow-up `[Pi]`
- queued messages `[Pi]`
- queue visualization `[Presentation]`
- compaction `[Pi]`
- branch `[Pi]`
- fork `[Pi]`
- fork lineage `[Presentation]`
- context state `[Presentation]`
- Pi-native lifecycle events `[Pi]`

## P2 — Smart Composer

```text
/   Skills
@   Files
#   Pi Actions
$   Session References
```

- sigil autocomplete `[Desktop]`
- fuzzy search `[Desktop]`
- keyboard navigation `[Desktop]`
- mouse selection `[Desktop]`
- visual tokens for mentions and references `[Presentation]`
- session reference preview `[Presentation]`

## P3 — Folder & Session UX

- recent folders `[PID]`
- open folder `[Desktop]`
- sessions under folder `[Pi]`
- resume `[Pi]`
- fast switching `[Desktop]`
- history `[Pi]`
- session tree `[Presentation]`
- fork tree `[Presentation]`
- global session list `[Pi]`
- current-folder session list `[Pi]`

## P4 — Session Search & Reference

- global search `[PID]` (derived, rebuildable index)
- folder-scoped search `[PID]`
- message content search `[PID]`
- fuzzy search `[PID]`
- branch and worktree metadata in results `[Presentation]`
- result preview `[Presentation]`
- explicit `$session` reference `[Pi]` via explicit prompt content
- inspect referenced content `[Presentation]`
- context-budget-aware reference handling `[Presentation]`
- no silent cross-session injection (constraint, not feature)

## P5 — Coding Presentation

- file tool visualization `[Presentation]`
- edits `[Presentation]`
- diff `[Presentation]`
- changed files `[Presentation]`
- bash output `[Presentation]`
- search output `[Presentation]`
- long output collapse `[Presentation]`
- markdown rendering `[Presentation]`
- code rendering `[Presentation]`
- context usage visualization `[Presentation]`
- compaction indication `[Presentation]`

Viewer-first. Not an IDE.

## P6 — Worktree

- detect worktrees `[Desktop]` (via Git)
- list worktrees `[Desktop]`
- branch association `[Desktop]`
- open worktree as Folder `[Desktop]`
- create worktree `[Desktop]`
- create branch + worktree `[Desktop]`
- sessions under worktree `[Pi]`
- safe removal `[Desktop]`
- sibling navigation `[Desktop]`

## P7 — MCP

- first-class MCP page `[Presentation]`
- list servers `[Pi]`
- status `[Pi]`
- tools per server `[Pi]`
- errors `[Pi]`
- reconnect / refresh where Pi allows `[Pi]`
- MCP tools flow through Pi `[Pi]`
- unified Tool Card rendering `[Presentation]`

Not an MCP platform.

## P8 — Skills

- first-class Skills page `[Presentation]`
- list / search `[Pi]`
- metadata `[Pi]`
- source `[Pi]`
- usability status `[Pi]`
- integration with `/` `[Desktop]`

## P9 — Extensions

- first-class Extensions page `[Presentation]`
- list / search `[Pi]`
- metadata `[Pi]`
- source `[Pi]`
- compatibility state `[Presentation]`
- best-effort support `[Pi]`
- explicit TUI-only unsupported state `[Presentation]`

No PID Extension Framework.

## P10 — Settings

- Appearance `[PID]`
- Conversation `[PID]`
- Sessions `[PID]`
- Files & Worktrees `[PID]`
- Notifications `[PID]`
- Advanced `[PID]`

Excludes Skills, MCP, Extensions, provider config, model registry config.

## P11 — Desktop Polish

- shortcuts `[Desktop]`
- drag and drop `[Desktop]`
- notifications `[Desktop]`
- theme `[PID]`
- layout persistence `[PID]`
- performance
- packaging `[Desktop]`
- updater `[Desktop]`

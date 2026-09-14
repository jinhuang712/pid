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
- visual tokens for mentions, links, and references, in the draft and in the timeline `[Presentation]`
- session reference preview `[Presentation]`
- attachments by absolute path: images, PDFs, files, folders via drop, paste, or picker `[Desktop]`
- attachment previews and chips, in the composer tray and on sent messages `[Presentation]`

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
- steps fold behind a "Worked for …" line once a turn finishes `[Presentation]`
- markdown rendering `[Presentation]`
- code rendering `[Presentation]`
- context usage visualization `[Presentation]`
- compaction indication `[Presentation]`

Viewer-first. Not an IDE.

## P6 — Worktree

- show the session's pi-worktree binding on the title bar `[Pi]` `[Presentation]`
- folder branch on folder rows and the title bar `[Presentation]` (via Git)
- sessions under a worktree-bound session stay under their origin folder `[Pi]`

Worktree creation, landing, and removal are Pi's (`pi-worktree`). PID adds no worktree UI of its own.

## P7 — MCP

- first-class MCP page `[Presentation]`
- list servers `[Pi]`
- status `[Pi]`
- tools per server `[Pi]`
- errors `[Pi]`
- reconnect / refresh where Pi allows `[Pi]`
- on/off switch per server, global or per project, via the adapter's `disabled` flag `[Pi]`
- MCP tools flow through Pi `[Pi]`
- unified Tool Card rendering `[Presentation]`

Not an MCP platform.

## P8 — Skills

- first-class Skills page `[Presentation]`
- list / search `[Pi]`
- metadata `[Pi]`
- source `[Pi]`
- usability status `[Pi]`
- on/off switch, global or per project, written as `pi config` would `[Pi]`
- integration with `/` `[Desktop]`

## P9 — Extensions

- first-class Extensions page `[Presentation]`
- list / search `[Pi]`
- metadata `[Pi]`
- source `[Pi]`
- compatibility state `[Presentation]`
- on/off switch, global or per project, written as `pi config` would `[Pi]`
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

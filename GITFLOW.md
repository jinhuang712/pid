# GITFLOW

PID is a personal, coding-agent-heavy repository. The Git history is the development record. Keep it honest and readable; do not make it ceremonial.

## Branches

- `main` is the only long-lived branch.
- Short-lived branches are fine for risky experiments. Merge fast-forward or rebase; no merge commits.

## Commits

- One commit solves one clearly stated problem.
- Dependency changes get their own commit when practical.
- Refactors and behavior changes are separate commits.
- Documentation may be committed on its own.
- Inspect the diff before every commit.
- Typecheck, lint, test, and build before committing code.
- Do not squash real development steps into one commit for aesthetics.
- Do not fabricate commits to make the history look tidy.
- Do not rewrite published history.

## Commit message format

```text
<type>: <imperative subject>
```

Types:

```text
docs:      documentation only
chore:     tooling, dependencies, config
feat:      user-visible capability
fix:       bug fix
refactor:  no behavior change
test:      tests only
```

Subject is lowercase, imperative, no trailing period. Add a body when the *why* is not obvious from the diff.

Examples:

```text
docs: establish PID product philosophy
chore: initialize desktop application
feat: open a folder and start a Pi session
feat: stream Pi conversation events
fix: keep composer enabled during an active run
```

## Cadence

```text
one independent change
  → verify
  → inspect diff
  → commit
  → continue
```

## Attribution

Commits are authored by the human maintainer only. No AI co-author trailers.

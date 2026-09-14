# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# ClassLens collaboration

Before starting a task:

1. Read `SHARED_CONTRACTS.md`.
2. Check the current branch with `git branch --show-current`.
3. On `frontend`, read `FRONTEND_RULES.md`; on `backend`, read `BACKEND_RULES.md`.
4. On `main` or another branch, use the rule file matching the requested work;
   read both for cross-team setup. Confirm role only if the task is ambiguous.
5. Report intended files and any shared-contract/configuration impact before edits.

Respect folder ownership and coordinate shared changes. Domain type definitions
inside `src/features/` are shared despite that folder's frontend ownership.
Do not request approval again for a change explicitly authorized in the current
session. Do not start future frontend/backend milestones merely because their
instructions appear in these documents.

Use separate clones or worktrees for concurrent work. Do not change branches while
another agent uses the same checkout. Merge work branches into main through PRs,
then synchronize each work branch from origin/main.

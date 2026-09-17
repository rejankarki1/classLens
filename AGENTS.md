# ClassLens project instructions

ClassLens is developed on the `integration` branch. Check the current branch and
working tree before editing; do not switch branches around uncommitted work.

Before starting a task:

1. Read `SHARED_CONTRACTS.md` for current operational contracts.
2. Read `docs/CLASSLENS_IMPLEMENTATION_PLAN.md`, the authoritative product and
   milestone plan. Implement only the requested scope; plan items do not authorize
   starting later milestones.
3. Read `FRONTEND_RULES.md` and/or `BACKEND_RULES.md` for the files involved.
4. Read the exact Expo SDK 57 documentation at
   https://docs.expo.dev/versions/v57.0.0/ before writing Expo code.
5. Report intended files and any shared-contract, configuration, dependency, or
   database impact before editing.

Build incrementally for 10–20 users. Preserve working features and avoid
deployment-scale infrastructure that this product does not need. Screens call
services and never query Supabase directly. Database changes use reviewed,
additive migrations with RLS. Do not remove mock or demo behavior until its real
replacement works.

Use `expo-background-task` for background work. Do not introduce the deprecated
`expo-background-fetch` package or API.

For every feature, run `npx tsc --noEmit`, `git diff --check`, and relevant device
tests. Report what was tested and what still needs manual verification.

Do not commit, push, deploy, install packages, apply migrations, or change the
remote Supabase project unless explicitly requested. Preserve unrelated
uncommitted work.

Respect the ownership and shared-file boundaries in `SHARED_CONTRACTS.md`. Domain
type definitions inside `src/features/` are shared even though that folder is
otherwise frontend-owned. Use separate clones or worktrees for concurrent work;
never change branches while another agent uses the same checkout.

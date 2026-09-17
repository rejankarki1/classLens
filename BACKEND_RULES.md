# ClassLens backend rules

Read `AGENTS.md`, `SHARED_CONTRACTS.md`, and the relevant section of
`docs/CLASSLENS_IMPLEMENTATION_PLAN.md` before changes. The implementation plan is
the authoritative product and milestone plan; `SHARED_CONTRACTS.md` is the
operational contract source.

## Ownership and boundaries

Backend owns `src/services/`, `src/lib/`, and `supabase/`. Read frontend consumers
and shared types before changing service behavior. Domain types in
`src/features/**/types.ts`, exports under `src/types/`, configuration, and package
files are shared and require coordination described in `SHARED_CONTRACTS.md`.

Use the existing Supabase PostgreSQL, Storage, Auth, RLS, and Edge Function
architecture. Screens must call services and never query Supabase directly. Keep
snake_case database fields inside the data layer and return the established
camelCase application contracts.

Make database changes through reviewed, additive migrations. Enable RLS and define
least-privilege policies before client access. Preserve existing tables, seeded
data, and mock/demo behavior until a real replacement is implemented and verified.
Keep secrets out of Expo and source control.

Implement the authoritative plan incrementally for 10–20 users. Avoid separate
servers, complex infrastructure, or deployment-scale systems that the product does
not need. Use `expo-background-task` for background work, never deprecated
`expo-background-fetch`.

Before handoff, run `npx tsc --noEmit`, `git diff --check`, relevant service checks,
and relevant device tests for the feature. Report changed files, migration and RLS
impact, setup requirements, failures, and remaining manual verification. Do not
commit, push, deploy, install packages, apply migrations, or change the remote
Supabase project unless explicitly requested.

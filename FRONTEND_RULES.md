# ClassLens frontend rules

Read `AGENTS.md`, `SHARED_CONTRACTS.md`, and the relevant section of
`docs/CLASSLENS_IMPLEMENTATION_PLAN.md` before changes. The implementation plan is
the authoritative product and milestone plan; `SHARED_CONTRACTS.md` is the
operational contract source.

## Ownership and boundaries

Frontend owns `src/app/`, `src/components/`, `src/features/`, `src/hooks/`,
`src/constants/`, and `src/global.css`. Domain `types.ts` files in
`src/features/` are shared contracts. Read services, libraries, and public types
to understand their APIs; edit backend-owned files only when the requested feature
explicitly crosses that boundary.

Use React Native, Expo SDK 57, TypeScript, Expo Router, and the established theme
and component patterns. Keep components focused, preserve accessibility and
keyboard behavior, and avoid unrelated redesigns or refactors.

Screens must use service functions rather than call Supabase directly or duplicate
backend state. Preserve working screens and mock/demo flows until their real
replacement is implemented and verified. Implement plan milestones incrementally
for 10–20 users without deployment-scale overengineering.

Use `expo-background-task` for background work, never deprecated
`expo-background-fetch`.

Before handoff, run `npx tsc --noEmit`, `git diff --check`, and relevant device
tests for the feature. Report changed files, behavior, failures, and remaining
manual verification. Do not commit, push, deploy, install packages, or change the
remote Supabase project unless explicitly requested.

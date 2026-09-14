# ClassLens Frontend Rules

Read `AGENTS.md` and `SHARED_CONTRACTS.md` before changes. Verify the current
branch is `frontend`; do not switch with uncommitted work. Follow the versioned
Expo documentation requirement in AGENTS.md before writing code.

## Ownership

Own `src/app/`, `src/components/`, `src/features/`, `src/hooks/`,
`src/constants/`, and `src/global.css`. Domain `types.ts` files are shared contracts,
not freely editable frontend files. Read services/lib/types to understand the API.
Do not edit `src/services/`, `src/lib/`, or `supabase/` unless explicitly authorized.

Before each task, report intended files, behavior, and whether shared files are
affected. For shared changes, explain impact and obtain approval unless already
authorized. The complete shared-file list is in SHARED_CONTRACTS.md.

## Stack and boundaries

React Native, Expo SDK 57, TypeScript, Expo Router. Current styling is StyleSheet
and shared light/dark theme helpers. NativeWind is deferred until approved and
installed. Do not add dependencies, expo-image-picker, or expo-camera without
approval. Keep Expo configuration and configured assets intact.

Screens must call services, for example `await getLectures(courseId)`.
Never place Supabase queries in screens or duplicate mock stores in the UI.
Use existing mock services until backend replaces their implementations.

## First milestone

Inspect the existing screens and propose a short implementation order and exact
files. Stop for approval before starting a new frontend milestone unless that
implementation is already explicitly authorized.

Polish these complete mock flows:

- Home → CS 3358 → Binary Search Trees → lecture details.
- Home → Capture → Try demo processing → sample lecture.

Own dashboard/cards, course detail, capture/preview UI, processing feedback,
lecture detail, future Ask Lecture/quiz UI, loading, empty/error states, and mobile
polish. Capture buttons may remain placeholders. Processing must clearly identify
mock activity, cancel timers on exit, and eventually support real backend state.

Lecture UI should accommodate title, course, professor, date, summary, concepts,
important points, assignments, exam mentions, materials, and question/quiz actions.
Use empty states. Materials have no read service yet; coordinate that interface
before integrating real material data. Do not add fields to Lecture silently.

## Quality and handoff

Keep components small, reusable UI in components, screen-specific logic in screens,
TypeScript strict, and no any or duplicate types. Avoid unrelated refactors.
After each feature run `npx tsc --noEmit`, report changes and manual tests, and keep
changes commit-sized. Start Expo if generated route types need regeneration.
Run existing lint tooling only if available; do not install it implicitly.

Work through frontend PRs into main, then synchronize from origin/main. Example
commit: `feat: polish course detail screen`. Do not implement database, storage,
Gemini, or Edge Functions during frontend work.

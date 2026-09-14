# ClassLens

A hackathon mobile app that turns class material into organized lecture notes.
This repository currently contains a standalone Expo SDK 57 / React Native /
TypeScript app with mock data and Expo Router navigation.

## Run

```sh
npx expo start
```

Press `i` to open an installed iOS simulator, or `w` for web. Dependencies are
already described in package.json; on a fresh checkout run `npm ci` first.

```sh
npx tsc --noEmit
```

## Ownership

| Area | Owner / responsibility |
| --- | --- |
| `src/app/` | Frontend: routes, screens, loading and error states |
| `src/components/` | Frontend: reusable UI |
| `src/features/` | Frontend: sample fixtures and domain types |
| `src/hooks/`, `src/constants/`, `src/global.css` | Frontend: shared theme helpers |
| `src/services/` | Backend: async contracts, currently mocks or explicit placeholders |
| `src/lib/` | Backend: future Supabase client and integration configuration |
| `src/types/` | Shared type exports; definitions live in feature type files |
| `supabase/` (later) | Backend: migrations and Edge Functions |

Screens import services, never fixtures. Replace service implementations with
Supabase calls later while preserving these contracts. Keep this as one repository;
there is no Node/Express server.

## Demo flow

- Home → Course → Lecture
- Home → Capture → Try demo processing → Lecture
- Processing runs four one-second UI stages, then opens the seeded Binary Search
  Trees lecture. Leaving Processing cancels its timer.
- Take Photo / Choose Photo and lecture question/quiz actions show coming-soon
  feedback. They perform no uploads or AI calls.

Read services return copied mock records. Missing single records return `null`;
empty lists return `[]`. `createLecture` validates the course and stores a lecture
in memory for the current app session only. Course lists refresh on focus.
`uploadMaterial`, `analyzeMaterial`, `askLecture`, and `generateQuiz` reject with
clear Not implemented errors and are not invoked by the demo.

All lecture content is sample data. Professor Avery is fictional.

## Deferred work

NativeWind is not installed. This scaffold uses React Native StyleSheet and the
existing light/dark theme helpers to honor the no-new-dependencies constraint.
Camera/image picker, persistence, Supabase, Gemini, lecture questions, and quizzes
are not implemented. Initialize the Supabase CLI structure when backend work starts;
empty migrations/function directories are intentionally omitted. See
[src/lib/README.md](src/lib/README.md) for integration ownership.

The original Expo configuration and assets remain. The destructive starter reset
script was removed. No dependency versions were changed.

## Manual acceptance checks

- Open on iOS and navigate both demo flows, including back navigation.
- Cancel Processing and wait longer than four seconds; it must not redirect.
- Open missing course/lecture IDs and verify the Go home action.
- Open Graph Traversal and verify its empty exam section; open Mathematical
  Induction and verify empty assignment/exam sections.
- Exercise capture and lecture placeholder buttons; no backend calls should occur.
- Check light/dark appearance and scroll the complete lecture.

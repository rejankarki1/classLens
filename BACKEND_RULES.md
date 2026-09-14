# ClassLens Backend Rules

Read `AGENTS.md` and `SHARED_CONTRACTS.md` before changes. Verify the current
branch is `backend`; do not switch with uncommitted work. Follow the versioned
Expo documentation requirement in AGENTS.md before writing code.

## Ownership

Own `src/services/`, `src/lib/`, and `supabase/` when initialized.
Read frontend files and shared types to understand the consumers. Do not redesign
or edit frontend-owned files without explicit authorization. Domain type files in
`src/features/` are shared, including types re-exported by `src/types/`.

Before each task report exact files, affected service contracts, database changes,
required environment variables, and shared-file impact. Explain and obtain approval
for shared changes unless already authorized. No dependency installation without
approval. The full shared-file list is in SHARED_CONTRACTS.md.

## Stack

Use Supabase PostgreSQL, Storage, Edge Functions, and later Gemini multimodal API.
Do not create Express, Prisma, a separate Node backend, or a Docker database.
No backend SDK or credentials are configured yet. This rule file does not authorize
installing packages, provisioning resources, or implementing future milestones.

## First task and milestones

First inspect services/lib/types and propose the smallest Supabase read setup:
schema, dependencies, environment variables, exact files, and access policy.
Stop for approval before implementation unless explicitly authorized.

Implement incrementally after approval:

1. Supabase setup, schema/migrations, and client.
2. getCourses, getCourse, getLectures, getLecture with unchanged return shapes.
3. Coordinate the upload/lecture lifecycle described in SHARED_CONTRACTS.md.
4. Storage and uploadMaterial.
5. analyze-material Edge Function and structured LectureAnalysis.
6. Persist createLecture and complete the confirmed photo-to-lecture flow.
7. Ask This Lecture, then quiz generation.

Keep the mock frontend usable throughout. Do not change service names, null/error
behavior, input types, or return shapes without coordination. Map snake_case database
columns to existing camelCase domain fields inside services.

## Proposed database and storage scope

Start small; schema is a proposal until approved:

- courses: id, code, name, professor, created_at.
- lectures: id, course_id, lecture_date, title, summary, key_concepts,
  important_points, assignments, exam_mentions, created_at.
- materials: id, lecture_id, type, file_path, extracted_text, created_at.

Lecture has no lectureDate field today; do not add one silently to the public type.
Use a lecture-materials bucket for photos; audio/PDF support comes later. Store raw
files in Storage, and paths/references in PostgreSQL. Decide storage/database access
policies before enabling client access; never rely on leaving production data open.
Use RLS for exposed tables and appropriate Storage policies, with user-scoped rules
when auth is introduced. Keep schema expansion minimal.

## AI and secrets

Expo → Supabase Edge Function → Gemini → typed LectureAnalysis JSON.
Never expose Gemini or Supabase service-role secrets to Expo. Use Edge Function
secrets; Expo may use public/publishable Supabase credentials with access policies.
Document variable names in .env.example only after coordinated approval; never
commit real secrets.

Analysis must use only supplied material, avoid inventing course facts, identify
topic, summarize, detect assignment/exam mentions, and validate structured output.
Handle failures through service rejections the frontend can display.

After analysis works, answer questions from stored lecture content; say when the
answer was not mentioned. Avoid complex RAG. Quiz generation should return 3–5
structured questions in the current Quiz wrapper. No quiz storage initially.

No video processing, vectors, embeddings, semantic search, notifications, calendars,
complex auth, or sharing until the core photo pipeline works.

## Quality and handoff

Run `npx tsc --noEmit` and relevant available service checks after changes. Report
manual checks and setup requirements. Do not install lint tooling implicitly.
Use small working changes, e.g. `feat: add course queries`, and backend PRs into main.
Synchronize from origin/main; do not merge frontend directly into backend.

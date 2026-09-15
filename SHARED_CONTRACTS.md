# ClassLens Shared Contracts

Read this file before frontend or backend work. These are the current contracts,
not a request to implement future features. Discuss contract changes before editing.

## Architecture and ownership

Screen → async service → mock data now / Supabase and AI later.
Frontend must not query Supabase directly. Backend must not redesign screens.

- Frontend: `src/app/`, `src/components/`, `src/features/`, `src/hooks/`,
  `src/constants/`, `src/global.css`.
- Backend: `src/services/`, `src/lib/`, `supabase/` when initialized.
- Shared: `src/types/`, domain definitions in `src/features/**/types.ts`,
  `package.json`, `package-lock.json`, `app.json`, `tsconfig.json`, `.env.example`,
  `README.md`, `AGENTS.md`, `CLAUDE.md`, and these three collaboration rule files.

The domain type files are shared even though they live in frontend-owned folders.
Import types through `@/types`; do not duplicate definitions.

Before changing shared files, explain what changes, why, and which teammate is
affected. Obtain explicit approval unless that exact change is already authorized.
Only one teammate edits dependencies at a time. Do not install dependencies without
approval. Merge dependency changes through main before the other teammate continues.

## Core types

```ts
export type Course = {
  id: string;
  code: string;
  name: string;
  professor: string;
};

export type Lecture = {
  id: string;
  courseId: string;
  title: string;
  summary: string;
  keyConcepts: string[];
  importantPoints: string[];
  assignments: string[];
  examMentions: string[];
  createdAt: string;
};

export type LectureAnalysis = {
  suggestedCourse: string | null;
  title: string;
  topic: string;
  summary: string;
  keyConcepts: string[];
  importantPoints: string[];
  assignments: string[];
  examMentions: string[];
};

export type Material = {
  id: string;
  lectureId: string | null;
  type: 'photo' | 'audio' | 'pdf' | 'video';
  filePath: string;
  extractedText?: string;
};

export type CreateLectureInput = Omit<Lecture, 'id' | 'createdAt'>;

export type CreateCourseInput = Omit<Course, 'id'>;

export type MaterialUploadInput = {
  uri: string;
  type: Material['type'];
  fileName: string;
  mimeType: string;
};

export type AskLectureResult = { answer: string };

export type QuizQuestion = {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
};
export type GenerateQuizResult = { title: string; questions: QuizQuestion[] };

```

Quiz generation returns GenerateQuizResult, with five questions and four options
per question. correctAnswer matches exactly one option. The earlier unused Quiz
interface remains declared for compatibility but is not this service's return type.
Dates are serialized strings; existing service records use ISO timestamps.

## Service contracts

```ts
signUp(email, password): Promise<void>
signIn(email, password): Promise<void>
signOut(): Promise<void>
getCurrentUserId(): Promise<string | null>
onAuthChange(listener): Promise<() => void>
getMyProfile(): Promise<Profile | null>
saveMyProfile(input: ProfileInput): Promise<Profile>
searchProfiles(query: string): Promise<Profile[]>
getFriends(): Promise<Profile[]>
getIncomingRequests(): Promise<FriendRequest[]>
getFriendshipStates(): Promise<Map<string, 'pending' | 'accepted'>>
sendFriendRequest(addresseeId: string): Promise<void>
acceptFriendRequest(friendshipId: string): Promise<void>
getLecturesByOwners(ownerIds: string[]): Promise<Lecture[]>
copyLectureToMyNotes(lectureId: string): Promise<Lecture>
getCourses(): Promise<Course[]>
getCourse(id: string): Promise<Course | null>
createCourse(input: CreateCourseInput): Promise<Course>
getLectures(courseId: string): Promise<Lecture[]>
getLecture(id: string): Promise<Lecture | null>
createLecture(input: CreateLectureInput): Promise<Lecture>
uploadMaterial(file: MaterialUploadInput): Promise<Material>
attachMaterialToLecture(materialId: string, lectureId: string): Promise<Material>
getMaterials(lectureId: string): Promise<Material[]>
getMaterialUrl(material: Material, expiresInSeconds?: number): Promise<string | null>
analyzeMaterial(material: Material): Promise<LectureAnalysis>
askLecture(lectureId: string, question: string): Promise<AskLectureResult>
generateQuiz(lectureId: string): Promise<GenerateQuizResult>
```

Course reads live in `services/courses.ts`; lecture reads/creation in
`services/lectures.ts`; upload/attachment in `services/materials.ts`; AI in `services/ai.ts`.
Missing individual records return null; empty collections return []. Failures
reject and must be handled by the UI. createLecture validates the course and persists in Supabase mode; mock mode stores data in memory only. Quiz generation invokes generate-quiz; Ask Lecture invokes ask-lecture. Photo analysis invokes the deployed analyze-material Edge Function. Photo uploads
require Supabase mode and the photo Storage migration. Screens must not import mock fixtures directly.

### Accounts, profiles and friends

Authentication is Supabase Auth with email and password. Passwords and emails
live in auth.users and are never copied into an application table, so friend
search is by profile name only and auth.users is never exposed to a client.
Auth lives in services/auth.ts and friendships in services/friends.ts.

public.profiles holds id (references auth.users), name, year and major. Year is
one of Freshman, Sophomore, Junior, Senior, Graduate. Any authenticated user can
read profiles, which is what makes classmates findable, but may insert and update
only their own row.

public.friendships holds requester_id, addressee_id, status (pending or accepted)
and created_at. A unique index over the ordered pair prevents duplicates in either
direction, and a check constraint prevents adding yourself. A row is visible only
to the two people in it. Only the requester may create one, status is not
grantable so new rows are always pending, and only the addressee may move a
pending row to accepted. No DELETE is granted.

Every earlier policy targeted anon only. Signing in switches the client to the
authenticated role, so the authenticated-access migration mirrors the existing
anon rules for courses, materials and Storage. It is additive: no anon policy was
dropped, so existing demo data keeps working.

lectures.owner_id is a nullable reference to auth.users. Existing rows keep null
and stay readable by everyone as shared demo content; new lectures are owned by
their creator. Authenticated users read demo lectures, their own, and those of
accepted friends, enforced in the database rather than the UI. Catch Up lists
accepted friends' lectures and copies one into your own notebook as a new
lecture owned by you. The original is never modified. Copies retain the source
course and all saved AI fields; actual photo objects are copied into new staged
materials and attached to the copied lecture using the existing schema. Stable
copy IDs let retries resume after partial failure. Success is reported only after
all photos are attached; the UI opens the returned copied lecture ID. An optional
courseId argument is accepted only when it matches the source course.

The verified Prashant demo is lecture demo-prashant-lecture in cs-2325 (CS 2325,
Computer Organization), with photo a3bdac54-d050-40e7-a934-0a3dc5bb7172. Its data
repair restores the existing seed analysis and grants authenticated reads of this
specific demo before a friendship is accepted; no new source lecture is created.

### Reading original materials

getMaterials returns the originals attached to a lecture, oldest first, using the
existing anon SELECT policy on materials. Mock mode returns [] because it has no
uploads. Staged materials (lecture_id null) are never returned.

getMaterialUrl issues a short-lived signed URL for one private object through the
existing lecture-materials SELECT policy. The bucket stays private, URLs expire
(one hour by default), and no URL is ever stored in the database or in a type.
It returns null instead of throwing, so one unreadable object degrades to a
placeholder rather than failing the screen that renders it.

Originals are the source of truth. Analysis organizes study information around
them and never replaces or rewrites them; deleting a material is not permitted.

### Course creation

createCourse derives the ID by slugifying the code (`"CHEM 1301"` becomes
`"chem-1301"`), so callers never supply one. Code and name are required and
trimmed; professor may be empty because LectureAnalysis carries no professor
field. The operation is idempotent: an existing course with the same derived ID
is returned unchanged rather than raising a duplicate-key error, so retries are
safe. Empty codes fall back to a generated UUID.

The Step 20 migration grants anon INSERT of id/code/name/professor and requires
nonempty code and name. UPDATE and DELETE remain unavailable, so demo data must
be removed with the service role. Existing courses are never modified.

Course creation is confirmed by the student in the capture flow. Analysis never
creates a course: `suggestedCourse` is a free-text label used only to prefill the
form, and an unmatched or ambiguous label prompts rather than inserting. This
preserves the rule that Gemini must not silently create courses, while letting a
clean database be usable. An empty course list is a normal first run, not an error.

## Staged material lifecycle

Approved flow: select photo → upload object → insert staged material → analyze →
student confirms → create persisted lecture → attach material → view lecture.
No fake draft lecture is required. Photo upload is implemented for Supabase mode;
attachment is implemented as a conditional staged-only update.

- `Material.lectureId` is null while staged, and a string once attached.
- `MaterialUploadInput` takes local URI, type, file name, and MIME type; no lecture ID.
- `uploadMaterial` must return a persisted Material with lectureId null only after
  both the object upload and metadata insertion succeed. Initially support photos
  only; reject other types until their implementations exist.
- `filePath` maps from database `storage_path`: a bucket-relative object path in the
  `lecture-materials` bucket, never a local URI or signed/public URL.
- Use stable paths such as `materials/<material-id>/photo.jpg`. Linking changes only
  lecture_id, never the object path. No bucket is created by the materials migration.
- Map null `extracted_text` to omitted `extractedText`. Keep created_at database-only.

`attachMaterialToLecture` conditionally updates lecture_id only when it is null.
It returns the updated Material. Missing materials and already-attached materials
reject clearly, including retries to the same lecture (Step 17 requirement).
The database foreign key rejects nonexistent lectures; no reassignment is allowed.

If analysis fails, retain the staged material for retry. If attachment fails after
lecture creation, retain both IDs and retry attachment without creating another
lecture. Storage upload and metadata insert are not one transaction. If insertion fails,
check for a committed row using the generated ID/path to recover from a lost
response. If recovery finds a row, return it; otherwise attempt object deletion and
report the original failure plus cleanup outcome. Empty deletion results do not
confirm removal. Failed/uncertain cleanup may need admin review.

Approved cleanup exception: anon may delete photo objects in lecture-materials only
when no material row references their path. This replaces the earlier blanket
prohibition on public object deletion. Registered objects are protected at policy
evaluation time; there is no per-user isolation for unregistered uploads. Concurrent
requests can still race because Storage and metadata writes are not atomic.

createLecture uses a generated UUID string in the existing text ID column in
Supabase mode and returns the saved row. created_at uses its database default;
lecture_date remains null because the public input has no lecture date field.
The Step 17 migration grants only INSERT of supplied lecture fields to anon in
existing courses. UPDATE and DELETE remain unavailable. No automatic course matching.
Creation and attachment are separate operations: retain the created lecture ID if
attachment fails and inspect current material association before retrying. Do not
create a second lecture for an attachment retry. Creation has no idempotency key;
a failed response may require inspecting the attempted ID before creating again.

### Materials access model

Use only non-sensitive content in this shared hackathon demo. There is no per-user
ownership without authentication or another ownership mechanism. Any anon client
can read material metadata and attach any staged material to an existing lecture.

Keep RLS enabled. Allow anon SELECT, column-limited INSERT of id/type/storage_path
with lecture_id and extracted_text null and type photo, and UPDATE of lecture_id
only from staged to attached. Do not grant DELETE, other metadata updates, or
authenticated access. The FK rejects nonexistent lectures. The photo Storage
migration adds bucket/path-scoped anon INSERT, SELECT, and orphan-only DELETE;
there is no UPDATE policy and uploads use upsert false. The private bucket's SELECT
policy allows shared demo reading/listing of matching objects, not per-user privacy.

### Photo upload foundation

In Supabase mode, uploadMaterial accepts only photo type and file:// local URIs.
Supported MIME types: image/jpeg, image/png, image/webp, image/heic, image/heif.
Maximum size: 10 MiB, checked before reading and again before upload, and limited
on the bucket. MIME restrictions use the declared content type; no content analysis
or transcoding is performed. Select supported photo bytes with the correct MIME.

Read bytes with Expo FileSystem and generate UUIDs with Expo Crypto. Paths are
materials/<uuid>/photo.<MIME-derived-extension>; the original fileName is not used
as a Storage path. Upload first, then insert only id/type/storage_path; nullable
lecture_id and extracted_text default to null under existing column grants.
Mock mode rejects uploads explicitly and makes no network calls. Read services
continue supporting both data modes unchanged. No fallback to fake upload success.

Frontend coordination: callers must omit lectureId from upload input, handle a null
Material.lectureId until attachment, and use the new attachment service later.
Import these types through @/types; do not duplicate or change UI in this step.

### Photo analysis foundation

analyzeMaterial(material) requires Supabase mode and photo type. It invokes
analyze-material with { materialId: material.id }; the function returns the existing
eight-field LectureAnalysis directly, without persisting anything. Both server and
service validate field types, trim strings, remove blank array entries, and normalize
blank suggestedCourse to null. Course suggestions are labels, not database IDs.
Malformed, blocked, or incomplete provider output rejects; no mock fallback exists.
Quiz generation is implemented on demand; lecture creation and attachment are separate service calls.

The function uses gemini-3.1-flash-lite with GEMINI_API_KEY held only in Supabase Edge
Function secrets. CLASSLENS_DEMO_PUBLISHABLE_KEY must match the mobile publishable
key. verify_jwt is false and the handler validates the apikey header itself. This is
shared public-key demo access, not user authentication or protection against quota
consumption by other key holders. Set provider quotas before deploying. Database
and private Storage reads use existing anon RLS; no admin key or schema changes.

See supabase/functions/analyze-material/README.md for manual secret setup, deployment,
request/error details, and testing. No Gemini credential belongs in Expo configuration.

### Ask This Lecture

askLecture(lectureId, question) now returns { answer: string }, replacing the unused
Promise<string> placeholder. Frontend callers must read result.answer. No existing
screen calls this service yet. Public type AskLectureResult lives under src/types/.

Supabase mode invokes ask-lecture with trimmed lectureId and question (nonempty,
maximum 2,000 characters). Mock mode rejects explicitly. The function reads saved
lecture fields and up to three associated original photos (10 MiB total), uses the
same server-side Gemini secrets and demo key check as analyze-material, and returns
a validated nonempty answer. It must state when information is absent from the
lecture, without filling gaps from general knowledge. No records are written.
See supabase/functions/ask-lecture/README.md for deployment and testing.

### Generate Quiz

generateQuiz(lectureId) invokes generate-quiz in Supabase mode and returns the new
GenerateQuizResult contract from src/types/quiz.ts. Mock mode rejects without network
calls. Shared lecture-context loading includes saved fields and original photos
with the same limits and failure behavior as Q&A. Exactly five distinct questions,
four distinct options, valid exact answers, and nonempty explanations are validated
on server and mobile. Insufficient source content fails explicitly. No quizzes are
persisted. See supabase/functions/generate-quiz/README.md for deployment and checks.

## Collaboration workflow

Use separate clones (or separate worktrees) for simultaneous agents. A branch
switch changes the files for everyone sharing the same working directory.

Work on frontend or backend, then open a PR into main. Do not merge the two work
branches directly into each other. Prefer small working commits and merge at
milestones; aim to synchronize within 60–90 minutes.

After a main merge, with a clean working tree:

```sh
git fetch origin
git switch frontend  # or backend
git merge origin/main
```

Do not discard uncommitted work, force-push, or resolve another person's changes
by overwriting them. Commit when authorized; report checks and manual test steps.

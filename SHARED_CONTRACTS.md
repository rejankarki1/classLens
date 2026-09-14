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
  lectureId: string;
  type: 'photo' | 'audio' | 'pdf' | 'video';
  filePath: string;
  extractedText?: string;
};

export type CreateLectureInput = Omit<Lecture, 'id' | 'createdAt'>;

export type MaterialUploadInput = {
  lectureId: string;
  uri: string;
  type: Material['type'];
  fileName: string;
  mimeType: string;
};

export type Quiz = {
  lectureId: string;
  questions: {
    prompt: string;
    choices: string[];
    correctAnswerIndex: number;
    explanation: string;
  }[];
};
```

`correctAnswerIndex` is zero-based. Dates are serialized strings; existing service
records use ISO timestamps. `generateQuiz` returns the existing `Quiz` wrapper,
not a standalone question array.

## Service contracts

```ts
getCourses(): Promise<Course[]>
getCourse(id: string): Promise<Course | null>
getLectures(courseId: string): Promise<Lecture[]>
getLecture(id: string): Promise<Lecture | null>
createLecture(input: CreateLectureInput): Promise<Lecture>
uploadMaterial(file: MaterialUploadInput): Promise<Material>
analyzeMaterial(material: Material): Promise<LectureAnalysis>
askLecture(lectureId: string, question: string): Promise<string>
generateQuiz(lectureId: string): Promise<Quiz>
```

Course reads live in `services/courses.ts`; lecture reads/creation in
`services/lectures.ts`; upload in `services/materials.ts`; AI in `services/ai.ts`.
Missing individual records return null; empty collections return []. Failures
reject and must be handled by the UI. Current createLecture validates the course
and stores data in memory only. Upload and AI calls currently reject with explicit
Not implemented errors. Screens must not import mock fixtures directly.

## Planned photo pipeline — coordinate before implementation

Target experience: capture → upload → analyze → confirm → create lecture → view.
Current upload input and Material both require a lectureId, so this target cannot
be implemented unchanged before a lecture exists. Before implementing upload,
coordinate either a draft-lecture lifecycle or a revised staged-upload contract.
Do not invent a lecture ID or silently make it optional. Keep the mock demo working
while this is resolved. LectureAnalysis also has topic/suggestedCourse fields that
must be mapped deliberately when constructing CreateLectureInput.

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

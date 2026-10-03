# Generate Quiz

POST { "lectureId": "..." } returns GenerateQuizResult:

```ts
type QuizQuestion = {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  citedPages: number[];
};
type GenerateQuizResult = { title: string; questions: QuizQuestion[] };
```

Exactly five distinct questions, four distinct options per question, one exact
correctAnswer match, and nonempty title/question/explanation are required. Server
and mobile runtime validation trim strings, preserve option order, strip extra
fields, and reject malformed results. citedPages is secondary metadata: a
missing or malformed value degrades to `[]` rather than failing an otherwise
valid question. The legacy Quiz type remains unused for compatibility;
generateQuiz now returns GenerateQuizResult.

## Session K: grounded in saved notebook text, with per-question citations

Context now loads through `_shared/lectureContext.ts`'s `loadNotebookContext` (the same
helper Session J added for `ask-lecture`): saved lecture fields plus the notebook's saved
text per page (faithful extraction, overridden by any `notebook_corrections`) -- no
original photos. This is what keeps quiz generation correct after the 7-day
original-photo cleanup sweep. A lecture with no `capture_analysis_id` is quizzed from its
saved lecture-level fields only, with zero notebook pages.

Because `capture_analyses` and `notebook_corrections` have owner-only RLS with no anon
policy, the caller's real `Authorization` bearer token is now required and forwarded to
PostgREST, exactly as in `ask-lecture`. A request with a missing or malformed
`Authorization` header is rejected with 401 before any database read.

Each question must list, in `citedPages`, the notebook page numbers that support it (an
empty array when the question draws only from the lecture summary fields). The handler
filters each question's `citedPages` down to page numbers actually present in the
supplied notebook pages before returning, so a hallucinated page number can never reach
the client -- this is what makes "reviewable later with source reference intact"
(Session K's exit condition) meaningful: the citation was verified against real pages
before being persisted.

The prompt requires lecture-only questions and plausible unambiguous distractors, with
mixed difficulty where supported. Insufficient material returns HTTP 422
INSUFFICIENT_CONTEXT rather than an invented/partial quiz. Grounding and having one
semantically correct option still require reviewing actual model output.

The existing `_shared/ai.ts` supplies `requireCallerAuthorization` and the Gemini REST
call. Model: gemini-3.1-flash-lite. Deadline: 60 seconds; output cap: 4096 tokens.
No retries. Quiz *attempts* and missed-question persistence (new this session) live in
`src/services/quizAttempts.ts` and the `quiz_attempts` / `quiz_missed_questions` tables --
this function persists only quota usage through the server-only `quiz_usage` table.

Apply `20260930040000_quiz_usage.sql` before deploying this function. Keep
`REVENUECAT_SECRET_KEY` in Supabase Edge Function secrets. The function also uses
Supabase-provided `SUPABASE_SERVICE_ROLE_KEY` for the three quota RPCs. Never place
either server key in Expo. The iOS debug client uses only
`EXPO_PUBLIC_REVENUECAT_IOS_KEY`, with a RevenueCat Test Store product in the current
offering mapped to entitlement `pro`.

The handler validates the caller token against Supabase Auth and uses that user ID
for both the RevenueCat subscriber lookup and quota reservation. An absent or failing
RevenueCat secret/check treats the caller as free. Three successful generations are
allowed in the rolling last seven days; two-minute in-flight reservations also count
until completed or released. Reserve and finish take the same per-user database
lock. Finishing an expired reservation rechecks the current quota; a full quota
returns `quota_reached` and no quiz. Completion and release retain their outcome
for idempotent retries after a lost RPC response. A fourth free request returns 429 `QUIZ_LIMIT_REACHED`
before Gemini. POST `{ "action": "status" }` returns `{ "isPro": boolean,
"remaining": number | null }`, with null remaining for Pro.

Deploy only this function from the repository root:

```sh
npx --yes supabase@2.75.0 functions deploy generate-quiz --project-ref yeneypkyvdfpdtspswha --no-verify-jwt --use-api
```

The quota migration and updated function must deploy together. Existing deployed
functions need not be redeployed. A debug iOS native rebuild is required for the
RevenueCat modules; the Test Store key must never be used for TestFlight or release.

Checks:

```sh
node supabase/functions/generate-quiz/check.cjs
node supabase/functions/analyze-material/check.cjs
node supabase/functions/ask-lecture/check.cjs
npx tsc --noEmit
git diff --check
```

Offline tests use the installed TypeScript compiler and Node, with no cloud calls.
If Deno is available, run deno check supabase/functions/generate-quiz/index.ts.

## Live acceptance (needs a lecture from the current capture pipeline)

The previous live-acceptance lecture (0ac7fc23-25d1-4ef9-be8d-6746a5bb3f03) has no
`capture_analysis_id` and can no longer exercise the citation path under this redesign.
Live acceptance now needs a lecture produced by the current multi-photo capture pipeline.
Once such a lecture exists: generate a quiz, print all questions and their citedPages,
check structure, and compare against the notebook's actual pages. This live pass, and the
full exit condition (generate a quiz, answer one incorrectly, confirm it is reviewable
later with its source reference intact via `/quiz-review`), could not be completed in
this session without live data in the linked project -- see `src/services/quizAttempts.check.cjs`
for the offline equivalent of the persist-and-review flow.

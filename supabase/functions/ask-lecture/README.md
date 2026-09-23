# Ask This Lecture

POST { "lectureId": "...", "question": "..." } returns { "answer": "...", "citedPages": [...] }.
The service askLecture returns AskLectureResult. Questions are trimmed, nonempty, and at
most 2,000 characters; request bodies are capped at 16 KiB. Lecture IDs are text,
including existing demo IDs.

## Session J: grounded in saved notebook text, not original photos

The function now reads the selected lecture's saved notebook text -- the faithful
extraction from `capture_analyses`, overridden per page by any `notebook_corrections` --
instead of original Storage photos. This is what keeps answers correct after the 7-day
original-photo cleanup sweep deletes the originals: Ask never depends on Storage at all.
A lecture with no `capture_analysis_id` (e.g. an older demo lecture, or one copied by
Catch Up before this session) is answered from its saved lecture-level fields only, with
zero notebook pages and an empty `citedPages`.

Because `capture_analyses` and `notebook_corrections` have owner-only RLS (no anon
policy, unlike `lectures`/`materials`), the caller's real `Authorization` bearer token is
now required and is forwarded verbatim to PostgREST so RLS resolves `auth.uid()` to the
actual signed-in user. `supabase.functions.invoke` already sends this automatically for a
signed-in client. A request with no (or malformed) `Authorization` header is rejected
with 401 before any database read.

Gemini receives the lecture's title, summary, concepts, important points, assignments,
and exam mentions, plus an array of notebook pages (`pageNumber`, `text`, `readability`,
`unclearSections`) -- no image bytes. The model must cite the `pageNumber`s it relied on
in `citedPages`; the handler filters that array down to page numbers actually present in
the supplied pages before returning it, so a hallucinated page number can never reach the
client. No writes, conversation history, embeddings, or general-knowledge fallback.

Gemini model: gemini-3.1-flash-lite. The prompt requires lecture-only answers, explicit
uncertainty ("That information was not found in this lecture.") for unsupported
questions, and preferring uncertainty over guessing from an unreadable or unclear page.
Question and source text cannot override those instructions. Output uses a JSON schema
and runtime validation. Grounding remains model behavior, not a mathematical guarantee;
live supported/unsupported question checks are required.

Security follows analyze-material: server-only GEMINI_API_KEY, SUPABASE_URL, and
CLASSLENS_DEMO_PUBLISHABLE_KEY. The apikey header must still match the app's publishable
key. verify_jwt=false lets the handler validate both the apikey and the real caller
Authorization itself, the same deploy shape as before. No image content, questions, or
secrets are logged by the code. A 60-second upstream deadline and 2,048 output-token cap
apply, without automatic retries. Errors use { error: { code, message } } with sanitized
messages and matching HTTP statuses. Mock mode rejects without network requests.

## Deployment

From the repository root, with a Supabase CLI login available:

```sh
npx --yes supabase@2.75.0 functions deploy ask-lecture --project-ref yeneypkyvdfpdtspswha --no-verify-jwt --use-api
```

This downloads CLI tooling without changing package.json. --use-api uses server-side
bundling without requiring Docker. Secrets are already configured project-wide.
No SQL migration is needed. Shared helper extraction preserves analyze-material
behavior; deploying ask-lecture does not redeploy the existing function.

## Verification

```sh
npx tsc --noEmit
node supabase/functions/ask-lecture/check.cjs
node supabase/functions/analyze-material/check.cjs
git diff --check
```

These checks use Node and the installed TypeScript compiler without network calls.
If Deno is available, also run deno check supabase/functions/ask-lecture/index.ts.
The offline checks do not claim to test the hosted runtime or semantic grounding.

## Live acceptance (needs a lecture from the current capture pipeline)

The previous live-acceptance lecture (0ac7fc23-25d1-4ef9-be8d-6746a5bb3f03) was built on
the old single-photo `materials` pipeline and has no `capture_analysis_id` -- under this
session's redesign it has zero notebook pages to cite, so it can no longer exercise the
citation path. Live acceptance now needs a lecture produced by the current multi-photo
capture pipeline (one with a saved `capture_analysis_id`), which requires live data in the
linked project. Once such a lecture exists:

- Ask about a passage genuinely covered by one of its pages.
  Expect a grounded answer with that page's number in `citedPages`.
- Ask about a fact absent from every page.
  Expect "That information was not found in this lecture." with an empty `citedPages`,
  never a fabricated answer.

This live pass, and the physical-iPhone exit condition (open from a real device), could
not be completed in this session -- they require a signed-in account with real captured
lectures and a physical iPhone, neither available here.

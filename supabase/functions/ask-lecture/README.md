# Ask This Lecture

POST { "lectureId": "...", "question": "..." } returns { "answer": "..." }.
The service askLecture returns AskLectureResult, replacing the former unused string
placeholder. Questions are trimmed, nonempty, and at most 2,000 characters; request
bodies are capped at 16 KiB. Lecture IDs are text, including existing demo IDs.

The function reads the selected lecture and associated photo materials through anon
RLS. Gemini receives title, summary, concepts, important points, assignments, exam
mentions, and original private Storage photo bytes. It supports up to three photos
and 10 MiB total; excess context and inaccessible/invalid photos fail explicitly.
With no photos, saved text is used. Non-photo formats are not processed. No writes,
conversation history, embeddings, citations, or general-knowledge fallback.

Gemini model: gemini-3.1-flash-lite. The prompt requires lecture-only answers and
"That information was not found in this lecture." for unsupported questions.
Question and source text cannot override those instructions. Output uses a JSON
schema and runtime validation. Grounding remains model behavior, not a mathematical
guarantee; live supported/unsupported question checks are required.

Security follows analyze-material: server-only GEMINI_API_KEY, SUPABASE_URL, and
CLASSLENS_DEMO_PUBLISHABLE_KEY. The last must match the app's publishable key.
verify_jwt=false permits the no-auth demo; the handler validates apikey itself.
Anyone holding that public key can consume quota. Existing anon RLS remains active;
no admin key is used. No image content, questions, or secrets are logged by the code.
A 60-second upstream deadline and 2,048 output-token cap apply, without automatic retries.
Errors use { error: { code, message } } with sanitized messages and matching HTTP
statuses, following analyze-material. Mock mode rejects without network requests.

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

Live acceptance uses lecture 0ac7fc23-25d1-4ef9-be8d-6746a5bb3f03:
- What are the three cases for deleting a node from a binary search tree?
  Expect leaf, one child, two children, grounded in the captured notes.
- Who invented the C programming language?
  Expect absence from this lecture, without supplying a name from general knowledge.

The associated classroom photo is e5a09744-2ed8-4f81-a297-05b4cc6f7fa4.
Successful requests for this lecture include that photo; a photo download failure
returns an error instead of silently answering from text only.

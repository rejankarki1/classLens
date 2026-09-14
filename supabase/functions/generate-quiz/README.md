# Generate Quiz

POST { "lectureId": "..." } returns GenerateQuizResult:

```ts
type QuizQuestion = {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
};
type GenerateQuizResult = { title: string; questions: QuizQuestion[] };
```

Exactly five distinct questions, four distinct options per question, one exact
correctAnswer match, and nonempty title/question/explanation are required. Server
and mobile runtime validation trim strings, preserve option order, strip extra
fields, and reject malformed results. The legacy Quiz type remains unused for
compatibility; generateQuiz now returns GenerateQuizResult.

Context is loaded through _shared/lectureContext.ts, also used by ask-lecture:
saved lecture fields plus up to three associated photos, 10 MiB total. Missing or
invalid photos fail explicitly. Text-only lectures work; other media are not read.
The prompt requires lecture-only questions and plausible unambiguous distractors,
with mixed difficulty where supported. Insufficient material returns HTTP 422
INSUFFICIENT_CONTEXT rather than an invented/partial quiz. Grounding and having
one semantically correct option still require reviewing actual model output.

The existing _shared/ai.ts supplies private image loading and Gemini REST calls.
Model: gemini-3.1-flash-lite. Deadline: 60 seconds; output cap: 4096 tokens.
No retries, persistence, quiz tables, history, scoring, or frontend changes.

Reuse existing Supabase secrets GEMINI_API_KEY and CLASSLENS_DEMO_PUBLISHABLE_KEY,
and supplied SUPABASE_URL. No secrets belong in Expo. The handler checks apikey;
verify_jwt=false supports the no-auth demo. Public key holders can consume quota.
Database and Storage use existing anon RLS, never a service-role key.

Deploy only this function from the repository root:

```sh
npx --yes supabase@2.75.0 functions deploy generate-quiz --project-ref yeneypkyvdfpdtspswha --no-verify-jwt --use-api
```

No migration is required. Existing deployed functions need not be redeployed for
this new endpoint. The local Q&A context extraction is behavior-preserving.

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
Live acceptance: generateQuiz('0ac7fc23-25d1-4ef9-be8d-6746a5bb3f03'), print all
questions, check structure, and compare with the original BST notes. Successful
context loading includes photo e5a09744-2ed8-4f81-a297-05b4cc6f7fa4.

# Photo analysis deployment

This function returns analysis only. It does not create or update lectures, materials,
or Storage objects. Deploy from the repository root so the bundler includes the
shared validator in src/lib/lectureAnalysis.ts and its type-only domain import.
No npm packages or Gemini SDK are required: the handler uses fetch and Web APIs.

## Manual Supabase setup

1. Create a Gemini API key in Google AI Studio. Ensure gemini-3.1-flash-lite is
   available to the associated project and configure suitable provider quotas.
2. Open the ClassLens project in Supabase Dashboard → Edge Functions → Secrets.
   Add GEMINI_API_KEY with the Gemini key. Add CLASSLENS_DEMO_PUBLISHABLE_KEY with
   the exact publishable key used by the Expo app. Do not copy Gemini credentials
   into Expo, EXPO_PUBLIC_* variables, source files, terminal arguments, or Git.
   SUPABASE_URL is supplied by the hosted Edge runtime; no service-role key is used.
3. With Supabase CLI available on your machine, run from the repository root:

   ```sh
   supabase login
   supabase functions deploy analyze-material --project-ref <project-ref> --no-verify-jwt
   ```

   Replace <project-ref> with the ClassLens project reference from the dashboard.
   No database migration, database push, Storage policy change, or local PostgreSQL
   installation is needed. The deploy command is manual; repository setup does not
   deploy anything. The config file also records verify_jwt = false.
4. Test the deployed function in the dashboard with POST, Content-Type:
   application/json, and an apikey header containing the app's publishable key.
   Supply an existing material UUID:

   ```json
   { "materialId": "4edd2432-5908-4ca4-ac6f-ad1f35caafcc" }
   ```

   This existing fixture is a favicon, useful only for non-classroom handling.
   Repeat with a stored classroom photo to assess note quality. Confirm a 200
   response with all eight LectureAnalysis fields. Also test a malformed ID (400)
   and a missing/wrong application key (401). Verify no records changed.
5. In the app, keep EXPO_PUBLIC_DATA_MODE=supabase. Existing callers can use
   analyzeMaterial(material); this change adds no UI. Never pass a Gemini key.

## Request and response

POST accepts { materialId: string } with a UUID and a maximum 4 KiB body.
The server obtains the path from public.materials, requires photo type and a path
matching materials/<material-id>/photo.<extension>, then downloads privately using
its configured publishable key under existing anonymous RLS. Caller Authorization
and arbitrary URLs are never forwarded. Staged and already-attached photos may be
analyzed; no attachment is changed.

Photos must be nonempty and at most 10 MiB, with matching path extension and stored
Content-Type: JPEG, PNG, WebP, HEIC, or HEIF. This checks declared MIME, not content
sniffing or transcoding. Invalid image contents are rejected by the provider.

The response is the LectureAnalysis object directly:

```ts
{
  suggestedCourse: string | null; // inferred label, not a database ID
  title: string;
  topic: string;
  summary: string;
  keyConcepts: string[];
  importantPoints: string[];
  assignments: string[];
  examMentions: string[];
}
```

Gemini receives the image inline, grounded classroom instructions, and a required
JSON schema. Runtime validation on both server and mobile checks all field types,
requires nonempty title/topic/summary, trims strings, removes blank array entries,
and normalizes a blank course label to null. Missing or invalid fields are rejected;
extra fields are stripped. Blocked, truncated, and malformed results fail explicitly.
There is a 60-second upstream deadline, 4096 output-token limit, and no retry/model
fallback. Mock mode rejects analysis without invoking the function.

Errors have { error: { code, message } } with sanitized messages: 400 bad request,
401 invalid application key, 404 missing material, 405 wrong method, 413 size limit,
415 request content type, 422 unsupported photo/path, 429 provider quota, 502
upstream/invalid analysis, 503 missing configuration, or 504 timeout. Provider bodies,
credentials, prompts, image bytes, and generated notes are not logged by this code.

## Demo access limits

verify_jwt is disabled because the app currently uses a publishable key without a
user session. The handler checks that key itself. This is shared demo access, not
user authentication: anyone possessing the public app key can analyze readable demo
photos and consume Gemini quota. CORS is not an access control. No per-user rate
limiter is claimed. Configure provider quotas before deployment; add authentication
and ownership policies in a later milestone before private student use.

## Local validation

From the repository root:

```sh
npx tsc --noEmit
node supabase/functions/analyze-material/check.cjs
git diff --check
```

The offline check uses the installed TypeScript compiler and Node Web APIs. It checks
portable handler types and exercises handler/service success and failure paths with
simulated fetch responses; it performs no network requests and needs no credentials.

When Deno is available, also run:

```sh
deno check supabase/functions/analyze-material/index.ts
```

Expo TypeScript excludes the Deno function tree; the offline check validates handler
code separately. It does not replace Deno entrypoint validation, deployment testing,
or live Gemini image-quality assessment.

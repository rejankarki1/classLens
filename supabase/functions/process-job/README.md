# Worker: claim, analyze, match, file

This function processes a specific signed-in user's job when invoked with
`{ "jobId": "<uuid>" }`, or claims the next recoverable job when invoked by
the trusted cron schedule with `{}`. It reuses a saved analysis or runs one,
matches against the job owner's enrolled courses, and either files the notebook
(`worker_file_processing_job`) or leaves the job `course_needed`.
All writes are scoped by the claimed job's own `owner_id`/`id`, not by
`auth.uid()` — this runs with the service-role key, not the caller's session.

## Invocation and auth

Two trusted callers, either is accepted as the bearer token:

1. **A signed-in ClassLens user** — must send a valid `jobId`. The handler
   resolves the JWT through `/auth/v1/user`, and the targeted claim RPC also
   requires that owner ID, so one user cannot claim another user's job.
2. **The exact `WORKER_CRON_SECRET` value** (Session D's `pg_cron`/`pg_net`
   recovery schedule, `supabase/migrations/20260922020000_worker_cron_recovery.sql`)
   — compared with a constant-time check, never routed through
   `/auth/v1/user` (a cron invocation carries no user JWT at all).

`verify_jwt = false` is intentional in `config.toml`: the cron bearer is an
opaque shared secret rather than a project JWT. The handler itself accepts only
a JWT that `/auth/v1/user` validates or the exact cron secret. Only cron calls
without a `jobId` use the global `claim_next_processing_job` recovery queue.
Both global and targeted claims can resume `retryable_failed` jobs only when
their saved stage is server-owned (`analyzing` or `filing`), `retry_count < 3`,
and `updated_at` is older than two minutes multiplied by the retry count.
Upload-phase failures remain phone-owned and are never claimed by the worker.

Required one-time manual setup for the cron path (not performed by the
migration or this session — needs your own secret value):

```sh
# In the SQL editor, once:
select vault.create_secret('<a-strong-random-value>', 'worker_cron_secret');
# Then, matching that same value:
supabase secrets set WORKER_CRON_SECRET=<the-same-value> --project-ref <project-ref>
```

Until both are set to the same value, the scheduled calls 401 harmlessly —
`net.http_post` is async and doesn't raise or block the pg_cron scheduler on
a failed response, it only logs one in `net._http_response`.

## Deployment (not run this session — ask before deploying)

```sh
supabase db push
supabase functions deploy process-job --project-ref <project-ref>
```

Requires the same `GEMINI_API_KEY` secret as `analyze-captures`. Supabase
supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`
automatically — no additional secret needed for the service-role key itself,
but treat it as sensitive: it bypasses RLS entirely and this function is the
first place in the codebase that uses it.

## Local verification (no real Gemini calls)

```sh
node supabase/functions/process-job/check.cjs
```

Type-checks `handler.ts` and exercises targeted owner-scoped claim / unchanged
cron claim / reuse-saved-analysis / run-new-analysis / low-confidence
course_needed / automatic filing / unsupported media / lease-release-on-failure,
all against a mocked `fetch`. This is not a
substitute for the Session C physical-device exit condition (upload → force-
quit → worker completes with no further phone involvement) — that requires an
actual deployed function, a real device, and the phone-side flag wired in,
none of which this test exercises.

## Known duplication

The Gemini prompt/schema/file-upload/response-parsing logic in `handler.ts`
duplicates `../analyze-captures/handler.ts` rather than sharing it, to avoid
touching that already-deployed, working function in this session. If the
prompt or schema changes, update both. The course-matching scorer in
`../_shared/courseMatch.ts` similarly duplicates
`src/features/processing/courseMatcher.ts` (frontend-owned, and importable
only via an alias this Deno runtime can't resolve) — keep the scoring
formula in sync if either changes.

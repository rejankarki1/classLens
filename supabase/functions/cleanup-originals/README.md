# Scheduled cleanup: delete confirmed-eligible photo originals

Session F. Selects `processing_jobs` where `stage = 'completed'`,
`cleanup_eligible_at <= now()`, and `cleanup_completed_at is null` (this already
excludes failed/course_needed/review-needed jobs — only `completed` jobs ever
get a `cleanup_eligible_at`, set automatically 7 days after `completed_at` by
`set_cleanup_eligibility()` in
`supabase/migrations/20260922040000_cleanup_originals_cron.sql`). For each
eligible job it reads the job's `captures` rows, bulk-deletes their Storage
objects from `lecture-materials`, confirms every path came back in the
delete response, and only then marks `cleanup_completed_at`. A partial or
failed deletion records `last_cleanup_error` and `cleanup_attempted_at` but
leaves `cleanup_completed_at` null, so the next scheduled run retries it.
**Never deletes `captures`/`lectures` rows or notebook text** — only the
Storage blobs.

## This session deletes real user photos — the schedule ships OFF

`supabase/migrations/20260922040000_cleanup_originals_cron.sql` registers a
`pg_cron` job (`cleanup-originals`, every 15 minutes) but immediately calls
`cron.alter_job(..., active => false)` in the same migration. Registering the
migration and deploying this function has **no effect on real data** until
someone deliberately runs:

```sql
select cron.alter_job(
  (select jobid from cron.job where jobname = 'cleanup-originals'),
  active => true
);
```

Do not run that until the physical-device dry run below has passed and
you've reviewed the batch size / retry behavior against real data.

## Invocation and auth

Same two-trusted-caller shape as `process-job` (see its README for the full
rationale): a signed-in ClassLens user, or the exact `CLEANUP_CRON_SECRET`
value, checked with a constant-time comparison. Deliberately **not** the same
secret as `WORKER_CRON_SECRET` — this is a more destructive operation and
gets its own credential/blast radius.

Required one-time manual setup for the cron path (not performed by the
migration or this session):

```sh
# In the SQL editor, once:
select vault.create_secret('<a-strong-random-value>', 'cleanup_cron_secret');
# Then, matching that same value:
supabase secrets set CLEANUP_CRON_SECRET=<the-same-value> --project-ref <project-ref>
```

Until both are set to the same value, a scheduled call 401s harmlessly — but
the job stays inactive regardless (see above), so neither step alone starts
real deletion.

## Deployment (not run this session — ask before deploying)

```sh
supabase db push
supabase functions deploy cleanup-originals --project-ref <project-ref>
```

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` automatically. `CLEANUP_CRON_SECRET` needs the
manual `supabase secrets set` step above.

## Local verification (no real Storage or Supabase calls)

```sh
node supabase/functions/cleanup-originals/check.cjs
```

Type-checks `handler.ts` and exercises: unauthenticated / wrong cron secret /
correct cron secret, a fully-confirmed deletion, a partially-confirmed
deletion (records an error, leaves `cleanup_completed_at` unset for retry), a
Storage HTTP error, a captures/`total_count` mismatch (refuses to delete
rather than guessing), and a job with zero captures — all against a mocked
`fetch`. **This is not a substitute for the Session F physical-device exit
condition** — it never calls a real Storage API, so the exact bulk-remove
response shape (`DELETE /storage/v1/object/{bucket}` with
`{ prefixes: [...] }`, mirroring `src/services/materials.ts`'s
`bucket.remove()`) is assumed, not verified live.

## Physical-device dry run (do this before turning the schedule on)

The schedule is off, so nothing fires the function automatically yet. To
exercise it deliberately against one real job:

1. Run capture → notebook to completion for a real job on your device, or use
   an existing `completed` one. Note its `id`.
2. In the SQL editor, force eligibility now instead of waiting 7 days (the
   plan's own suggested method): `update processing_jobs set
   cleanup_eligible_at = now() where id = '<job-id>';` — the trigger only
   auto-sets this column when it's still null, so this manual value sticks.
3. Deploy this function (ask first) and invoke it once, signed in as that
   job's owner, e.g. `supabase functions invoke cleanup-originals` from an
   authenticated session, or `curl` with a real user JWT as the bearer.
4. Confirm: the response shows `succeeded: 1`; the job's
   `cleanup_completed_at` is now set; the Storage objects for that job's
   captures are gone (try `getMaterialUrl`/a signed URL — it should fail);
   the notebook (lecture text, corrections, page references) still loads
   normally; foregrounding or cold-relaunching the app clears any leftover
   local staged copy for that job (see
   `src/services/originalsCleanupSweep.ts`) without prompting or delay.
5. Only after that passes, decide on a batch size / interval you're
   comfortable with and run the `cron.alter_job(..., active => true)`
   statement above.

## Known assumption to double-check before relying on this in production

The Storage bulk-delete endpoint and its response shape
(`DELETE {SUPABASE_URL}/storage/v1/object/lecture-materials` with body
`{ prefixes: [...] }`, returning an array of `{ name, ... }` for each object
actually found and removed) is inferred from `storage-js`'s
`StorageFileApi.remove()` client behavior, not confirmed against a live
Supabase Storage instance in this session — no deploy happened. Verify this
during the physical-device dry run above before turning the schedule on.

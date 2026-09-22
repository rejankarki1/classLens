# ClassLens Migration Status

Originally captured in Session A (migration reconciliation) as a read-only snapshot; updated
after Session B (claim/lease schema) ran the repair it identified as needed. This revision
reflects state as of the Session B push, confirmed live against the linked project `classLens`
(`yeneypkyvdfpdtspswha`).

**Note on this file's own history:** an earlier copy of this doc was written in Session A but
never committed, and went missing from disk (outside git) twice before this revision. It's
committed this time specifically so that can't recur silently. If a future session finds this
file missing again, that's a signal to investigate the environment, not to assume the findings
below no longer apply — re-verify via `supabase migration list --linked` and
`supabase db diff --linked` rather than trusting a stale copy either way.

## Session A: starting state and method

Branch: `integration`. Method: `git status --short`, then `npx supabase db diff --linked` and
`npx supabase migration list --linked` against the linked project. No schema changes, `db push`,
or worker changes were made in Session A — it was read-only. Docker was started locally only to
build the CLI's disposable shadow database for the diff.

An uncommitted, in-progress edit to `supabase/migrations/20260914010000_allow_demo_reads.sql`
was found broken (`grant select` typo'd to `grant selec`, a SQL syntax error) — this broke shadow-
database replay until temporarily `git stash`'d for diff/push runs. Not fixed as part of
reconciliation; it's someone else's in-progress work, outside this scope, and was still present
and untouched as of the Session B push.

## Finding 1 (Session A): six migrations were live but untracked — RESOLVED in Session B

Session A found the remote's `supabase_migrations.schema_migrations` table recognized only 9 of
15 local migrations as applied, even though `db diff --linked` (which replays all 15 into a fresh
shadow database) showed their schema effects were already live and matching committed source
(modulo the cosmetic drift in Finding 2). The six unrecorded migrations were:

- `20260915030000_demo_profile_access`
- `20260915040000_demo_classmate`
- `20260915050000_repair_assembly_catchup`
- `20260916000000_create_course_memberships`
- `20260917000000_multi_photo_captures`
- `20260921000000_durable_processing_jobs`

**Resolution (Session B):** ran `npx supabase migration repair --status applied <version>` for
each of the six (bookkeeping only — confirmed no SQL re-ran), with explicit go-ahead before each
batch. `npx supabase migration list --linked` confirmed all recognized as applied; `db diff
--linked` immediately after showed an unchanged diff (only the pre-existing items in Finding 3),
proving repair changed no actual schema — only the tracking table.

Session B then added and pushed a new migration,
`20260922000000_processing_job_claim_lease.sql` (claim/lease columns and function on
`processing_jobs`). `supabase db push --linked` applied only that one file (confirmed via
`--dry-run` first), and `supabase migration list --linked` now shows **all 16** local migrations
recorded as applied remotely. A post-push `db diff --linked` no longer lists any of that
migration's objects as missing from remote — they match committed source exactly.

**Current state: no gap.** Local migration count, remote applied count, and live schema are all
consistent as of this revision.

## Finding 2: two function bodies drifted from committed source (cosmetic, still present)

`db diff --linked` still flags `CREATE OR REPLACE FUNCTION` for `public.accept_demo_friendship`
(from `20260915040000_demo_classmate.sql`) and `public.claim_captures_for_analysis` (from
`20260917000000_multi_photo_captures.sql`). Logic is identical between live and committed source;
the live bodies are missing inline SQL comments and have different line-wrapping. Most likely
explanation: these migration files were edited for comments/formatting locally after they were
already applied live, and since Postgres has no mechanism to "re-diff" an already-applied
migration, those edits never reached the database. Not a functional bug. Unchanged since Session A.

## Finding 3: two diff items are platform noise, not real drift (still present)

- `drop extension if exists "pg_net"` — the CLI's local shadow-database image enables `pg_net` by
  default; the live project doesn't have it and no migration installs it.
- Three triggers on `storage.buckets` (`protect_bucket_control_insert`,
  `protect_bucket_control_update`, `protect_bucket_control_update_role`) — Supabase-managed
  Storage service internals, not created by any ClassLens migration; present live because the
  hosted Storage service version is newer than what the local shadow image bundles.

Neither needs action from this project. Unchanged since Session A.

## Bottom line (updated after Session B)

- What's actually live matches all 16 committed migrations' intended schema exactly for
  everything except the two cosmetic function-body drifts in Finding 2, which predate Session B
  and are unrelated to it.
- What's recorded as "applied" in the remote's own migration history now matches local exactly —
  the Session A gap (9 of 15) is closed (16 of 16).
- The one file with a local uncommitted change (`20260914010000_allow_demo_reads.sql`) still has
  the typo described above as of this writing; it's already-applied and unaffected by pushes, but
  remains broken if anyone tries to replay it fresh (e.g. via `supabase start`). Still not fixed
  here — still someone else's in-progress work.
- Session B's new migration (`20260922000000_processing_job_claim_lease.sql`) is live, pushed,
  and verified matching. It is not yet wired into the phone app or any worker — Session C's scope.

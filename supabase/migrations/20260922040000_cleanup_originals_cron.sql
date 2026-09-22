begin;

-- Session F: auto-computes the 7-day cleanup-eligibility timestamp Session E's
-- columns left unpopulated, and registers the scheduled cleanup job -- but
-- starts it INACTIVE. This is the session that deletes real user photos from
-- private Storage, so it must not run for real until deliberately verified.
-- See supabase/functions/cleanup-originals/README.md for the physical-device
-- dry run and the exact command to flip it active.

-- Fires only when a job just reached completed_at (never overwrites a value
-- someone set deliberately, e.g. a controlled test timestamp per the plan's
-- Session F exit condition: "force eligibility via controlled timestamp").
create or replace function public.set_cleanup_eligibility()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.completed_at is not null and new.cleanup_eligible_at is null then
    new.cleanup_eligible_at := new.completed_at + interval '7 days';
  end if;
  return new;
end;
$$;

create trigger set_cleanup_eligibility_before_write
before insert or update on public.processing_jobs
for each row execute function public.set_cleanup_eligibility();

-- Requires the same one-time manual setup pattern as Session D's recovery
-- schedule (supabase/migrations/20260922020000_worker_cron_recovery.sql),
-- with its own, separate secret -- this is a more destructive operation and
-- deserves its own blast radius, not reuse of worker_cron_secret:
--   1. select vault.create_secret('<a-strong-random-value>', 'cleanup_cron_secret');
--   2. supabase secrets set CLEANUP_CRON_SECRET=<the-same-value> --project-ref <ref>
-- Until both are set to the same value, a scheduled call 401s harmlessly, the
-- same as process-job's cron path -- but this job stays INACTIVE below
-- regardless, so neither step alone makes it start deleting photos.
select cron.schedule(
  'cleanup-originals',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://yeneypkyvdfpdtspswha.supabase.co/functions/v1/cleanup-originals',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_2QfNGgDVeiRddSMu82RHHQ_kcXT9F3q',
      'Authorization', 'Bearer ' || coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'cleanup_cron_secret'),
        ''
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);

-- The deliberate gate: registered but not running. Flip on only after the
-- Session F exit condition's physical-device dry run passes:
--   select cron.alter_job(
--     (select jobid from cron.job where jobname = 'cleanup-originals'),
--     active => true
--   );
select cron.alter_job(
  (select jobid from cron.job where jobname = 'cleanup-originals'),
  active => false
);

commit;

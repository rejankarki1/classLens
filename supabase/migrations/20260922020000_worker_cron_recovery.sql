begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Broadens the atomic claim to also reclaim jobs stuck in 'analyzing' or
-- 'filing' whose lease has expired (a worker crashed, timed out, or a phone
-- backgrounded mid-filing) -- not only fresh 'uploaded' jobs. This is the
-- "expired leases" half of Session D; Session B/C only covered "ready jobs".
-- Reclaiming preserves the job's current stage unless it was 'uploaded', so
-- a job stuck mid-filing resumes at filing (idempotent, no repeat Gemini
-- call), not restarted from analyzing.
create or replace function public.claim_next_processing_job(
  p_runner_token uuid,
  p_lease_seconds integer default 300
)
returns setof public.processing_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_runner_token is null or p_lease_seconds is null or p_lease_seconds <= 0 then
    return;
  end if;
  return query
    with candidate as (
      select id
      from public.processing_jobs
      where stage in ('uploaded', 'analyzing', 'filing')
        and (lease_expires_at is null or lease_expires_at < now())
      order by created_at
      limit 1
      for update skip locked
    )
    update public.processing_jobs
    set stage = case when stage = 'uploaded' then 'analyzing' else stage end,
        runner_token = p_runner_token,
        claimed_at = now(),
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        updated_at = now()
    from candidate
    where public.processing_jobs.id = candidate.id
    returning public.processing_jobs.*;
end;
$$;

-- Recovery schedule: invokes the process-job worker every 2 minutes so ready
-- and lease-expired jobs get picked up even if the phone never triggered a
-- pass (killed before it could, or the WORKER_PROCESSING_ENABLED flag was
-- off when the job was created and got flipped on later). This also keeps
-- the free-tier project active (see plan doc, "Free projects pause after
-- 7 days of inactivity").
--
-- REQUIRES A ONE-TIME MANUAL STEP not performed by this migration -- it only
-- registers the schedule, it never generates or stores real secret material:
--   1. select vault.create_secret('<a-strong-random-value>', 'worker_cron_secret');
--   2. supabase secrets set WORKER_CRON_SECRET=<the-same-value> --project-ref <ref>
-- Until both are set to the same value, every invocation below 401s
-- harmlessly: net.http_post is async and does not raise or block the
-- scheduler on a failed response, it only logs one in net._http_response.
select cron.schedule(
  'process-job-recovery',
  '*/2 * * * *',
  $cron$
  select net.http_post(
    url := 'https://yeneypkyvdfpdtspswha.supabase.co/functions/v1/process-job',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_2QfNGgDVeiRddSMu82RHHQ_kcXT9F3q',
      'Authorization', 'Bearer ' || coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'worker_cron_secret'),
        ''
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);

commit;

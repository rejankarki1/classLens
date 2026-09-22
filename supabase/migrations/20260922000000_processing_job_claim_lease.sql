begin;

-- Explicit server-ready boundary between "phone finished uploading" and
-- "worker claimed the job". worker_run_id/lease columns already exist as
-- runner_token/lease_expires_at from the original processing_jobs migration
-- (20260921000000) and are reused here rather than duplicated; claimed_at is
-- the only genuinely new column, recording when the current lease started.

alter table public.processing_jobs
  add column claimed_at timestamptz;

alter table public.processing_jobs
  drop constraint processing_jobs_stage_check,
  add constraint processing_jobs_stage_check check (stage in (
    'queued', 'uploading', 'uploaded', 'analyzing', 'course_needed', 'filing',
    'completed', 'retryable_failed', 'terminal_failed'
  ));

-- Existing edges (including uploading -> analyzing) are preserved so the
-- current phone orchestrator keeps working unchanged; uploading -> uploaded
-- and uploaded -> analyzing are added as new, currently-unused edges for the
-- Session C worker to wire in later.
create or replace function public.validate_processing_job_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  valid_transition boolean;
begin
  if new.owner_id <> old.owner_id
    or new.capture_session_id <> old.capture_session_id
    or new.media_type <> old.media_type
    or new.total_count <> old.total_count
    or new.created_at <> old.created_at
  then
    raise exception 'Processing job identity cannot change.' using errcode = '23514';
  end if;

  valid_transition := new.stage = old.stage or case old.stage
    when 'queued' then new.stage in ('uploading', 'terminal_failed')
    when 'uploading' then new.stage in ('uploaded', 'analyzing', 'retryable_failed', 'terminal_failed')
    when 'uploaded' then new.stage in ('analyzing', 'terminal_failed')
    when 'analyzing' then new.stage in ('course_needed', 'filing', 'retryable_failed', 'terminal_failed')
    when 'course_needed' then new.stage in ('filing', 'terminal_failed')
    when 'filing' then new.stage in ('completed', 'retryable_failed', 'terminal_failed')
    when 'retryable_failed' then new.stage in ('queued', 'uploading', 'analyzing', 'filing', 'terminal_failed')
    else false
  end;

  if not valid_transition then
    raise exception 'Invalid processing job transition from % to %.', old.stage, new.stage using errcode = '23514';
  end if;
  if new.uploaded_count < old.uploaded_count then
    raise exception 'Uploaded count cannot decrease.' using errcode = '23514';
  end if;
  if new.course_id is not null and not exists (
    select 1 from public.course_memberships membership
    where membership.user_id = new.owner_id and membership.course_id = new.course_id
  ) then
    raise exception 'Processing course must be enrolled.' using errcode = '42501';
  end if;
  if new.capture_analysis_id is not null and not exists (
    select 1 from public.capture_analyses saved
    where saved.id = new.capture_analysis_id
      and saved.owner_id = new.owner_id
      and saved.capture_session_id = new.capture_session_id
  ) then
    raise exception 'Processing analysis must belong to this session.' using errcode = '42501';
  end if;
  if new.lecture_id is not null and not exists (
    select 1 from public.lectures lecture
    where lecture.id = new.lecture_id
      and lecture.owner_id = new.owner_id
      and lecture.capture_session_id = new.capture_session_id
  ) then
    raise exception 'Processing lecture must belong to this session.' using errcode = '42501';
  end if;
  if new.stage = 'retryable_failed' and new.retry_count <> old.retry_count + 1 then
    raise exception 'Retry count must increment on retryable failure.' using errcode = '23514';
  end if;
  if old.stage = 'retryable_failed' and new.stage <> 'terminal_failed' and new.stage <> old.resume_stage then
    raise exception 'Retry must resume at the saved stage.' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Atomic worker claim: one statement, FOR UPDATE SKIP LOCKED so concurrent
-- worker invocations never block on or double-claim the same row. Not called
-- from anywhere yet (Session C wires it into the worker); EXECUTE is
-- restricted to service_role only, since it claims across all owners and
-- must never be reachable by the phone client.
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
      where stage = 'uploaded'
        and (lease_expires_at is null or lease_expires_at < now())
      order by created_at
      limit 1
      for update skip locked
    )
    update public.processing_jobs
    set stage = 'analyzing',
        runner_token = p_runner_token,
        claimed_at = now(),
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        updated_at = now()
    from candidate
    where public.processing_jobs.id = candidate.id
    returning public.processing_jobs.*;
end;
$$;

revoke all on function public.claim_next_processing_job(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_next_processing_job(uuid, integer) to service_role;

commit;

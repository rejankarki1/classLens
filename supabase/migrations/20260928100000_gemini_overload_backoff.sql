begin;

alter table public.processing_jobs
  add column overload_retry_count smallint not null default 0,
  add column overload_started_at timestamptz,
  add column next_attempt_at timestamptz,
  add constraint processing_jobs_overload_retry_count_nonnegative check (overload_retry_count >= 0);

create index processing_jobs_overload_retry_due_idx
  on public.processing_jobs (next_attempt_at, created_at)
  where stage = 'retryable_failed' and last_error_code = 'GEMINI_ALL_BUSY';

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
    where saved.id = new.capture_analysis_id and saved.owner_id = new.owner_id
      and saved.capture_session_id = new.capture_session_id
  ) then
    raise exception 'Processing analysis must belong to this session.' using errcode = '42501';
  end if;
  if new.lecture_id is not null and not exists (
    select 1 from public.lectures lecture
    where lecture.id = new.lecture_id and lecture.owner_id = new.owner_id
      and lecture.capture_session_id = new.capture_session_id
  ) then
    raise exception 'Processing lecture must belong to this session.' using errcode = '42501';
  end if;
  if new.stage = 'retryable_failed' then
    if new.last_error_code = 'GEMINI_ALL_BUSY' then
      if new.retry_count <> old.retry_count then
        raise exception 'Capacity failures cannot increment retry count.' using errcode = '23514';
      end if;
      if new.overload_retry_count <> old.overload_retry_count + 1
        or new.overload_started_at is null or new.next_attempt_at is null
      then
        raise exception 'Capacity retry schedule is invalid.' using errcode = '23514';
      end if;
    elsif new.retry_count <> old.retry_count + 1 then
      raise exception 'Retry count must increment on retryable failure.' using errcode = '23514';
    end if;
  end if;
  if old.stage = 'retryable_failed' and new.stage <> 'terminal_failed' and new.stage <> old.resume_stage then
    raise exception 'Retry must resume at the saved stage.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.claim_next_processing_job(p_runner_token uuid, p_lease_seconds integer default 300)
returns setof public.processing_jobs language plpgsql security definer set search_path = '' as $$
begin
  if p_runner_token is null or p_lease_seconds is null or p_lease_seconds <= 0 then return; end if;
  update public.processing_jobs set stage = 'terminal_failed', resume_stage = null,
    runner_token = null, lease_expires_at = null, updated_at = now()
  where stage = 'retryable_failed' and last_error_code = 'GEMINI_ALL_BUSY'
    and overload_started_at <= now() - interval '2 hours';
  return query
    with candidate as (
      select id from public.processing_jobs
      where (stage in ('uploaded', 'analyzing', 'filing') or (
        stage = 'retryable_failed' and resume_stage in ('analyzing', 'filing') and (
          (last_error_code = 'GEMINI_ALL_BUSY' and next_attempt_at <= now()
            and overload_started_at > now() - interval '2 hours')
          or (last_error_code is distinct from 'GEMINI_ALL_BUSY' and retry_count < 3
            and updated_at <= now() - make_interval(secs => 120 * retry_count)))))
        and (lease_expires_at is null or lease_expires_at < now())
      order by created_at limit 1 for update skip locked)
    update public.processing_jobs set
      stage = case when public.processing_jobs.stage = 'uploaded' then 'analyzing'
        when public.processing_jobs.stage = 'retryable_failed' then public.processing_jobs.resume_stage
        else public.processing_jobs.stage end,
      resume_stage = case when public.processing_jobs.stage = 'retryable_failed' then null else public.processing_jobs.resume_stage end,
      runner_token = p_runner_token, claimed_at = now(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds), updated_at = now()
    from candidate where public.processing_jobs.id = candidate.id returning public.processing_jobs.*;
end; $$;

revoke all on function public.claim_next_processing_job(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_next_processing_job(uuid, integer) to service_role;

create or replace function public.claim_processing_job_by_id(
  p_job_id uuid, p_owner_id uuid, p_runner_token uuid, p_lease_seconds integer default 300)
returns setof public.processing_jobs language plpgsql security definer set search_path = '' as $$
begin
  if p_job_id is null or p_owner_id is null or p_runner_token is null
    or p_lease_seconds is null or p_lease_seconds <= 0 then return; end if;
  update public.processing_jobs set stage = 'terminal_failed', resume_stage = null,
    runner_token = null, lease_expires_at = null, updated_at = now()
  where id = p_job_id and owner_id = p_owner_id and stage = 'retryable_failed'
    and last_error_code = 'GEMINI_ALL_BUSY' and overload_started_at <= now() - interval '2 hours';
  return query
    with candidate as (
      select id from public.processing_jobs where id = p_job_id and owner_id = p_owner_id
        and (stage in ('uploaded', 'analyzing', 'filing') or (
          stage = 'retryable_failed' and resume_stage in ('analyzing', 'filing') and (
            (last_error_code = 'GEMINI_ALL_BUSY' and next_attempt_at <= now()
              and overload_started_at > now() - interval '2 hours')
            or (last_error_code is distinct from 'GEMINI_ALL_BUSY' and retry_count < 3
              and updated_at <= now() - make_interval(secs => 120 * retry_count)))))
        and (lease_expires_at is null or lease_expires_at < now())
      limit 1 for update skip locked)
    update public.processing_jobs set
      stage = case when public.processing_jobs.stage = 'uploaded' then 'analyzing'
        when public.processing_jobs.stage = 'retryable_failed' then public.processing_jobs.resume_stage
        else public.processing_jobs.stage end,
      resume_stage = case when public.processing_jobs.stage = 'retryable_failed' then null else public.processing_jobs.resume_stage end,
      runner_token = p_runner_token, claimed_at = now(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds), updated_at = now()
    from candidate where public.processing_jobs.id = candidate.id returning public.processing_jobs.*;
end; $$;

revoke all on function public.claim_processing_job_by_id(uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_processing_job_by_id(uuid, uuid, uuid, integer) to service_role;

commit;

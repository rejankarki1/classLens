begin;

-- validate_processing_job_transition already permits retryable_failed to move
-- only to its saved resume_stage (or terminal_failed). Both claims therefore
-- restore exactly that stage and clear resume_stage in the same statement;
-- the trigger remains enabled and enforces the transition.
--
-- Recovery keeps the existing oldest-first global queue, and additionally
-- resumes server-side analysis/filing failures after a retry-count-scaled
-- backoff. Phone-owned queued/uploading failures are deliberately excluded.
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
      where (
          stage in ('uploaded', 'analyzing', 'filing')
          or (
            stage = 'retryable_failed'
            and resume_stage in ('analyzing', 'filing')
            and retry_count < 3
            and updated_at <= now() - make_interval(secs => 120 * retry_count)
          )
        )
        and (lease_expires_at is null or lease_expires_at < now())
      order by created_at
      limit 1
      for update skip locked
    )
    update public.processing_jobs
    set stage = case
          when public.processing_jobs.stage = 'uploaded' then 'analyzing'
          when public.processing_jobs.stage = 'retryable_failed' then public.processing_jobs.resume_stage
          else public.processing_jobs.stage
        end,
        resume_stage = case
          when public.processing_jobs.stage = 'retryable_failed' then null
          else public.processing_jobs.resume_stage
        end,
        runner_token = p_runner_token,
        claimed_at = now(),
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        updated_at = now()
    from candidate
    where public.processing_jobs.id = candidate.id
    returning public.processing_jobs.*;
end;
$$;

revoke all on function public.claim_next_processing_job(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_next_processing_job(uuid, integer)
  to service_role;

-- Direct app invocations must claim the job the signed-in user just uploaded,
-- while the existing no-argument cron path continues to claim the oldest
-- globally available job through claim_next_processing_job.
create or replace function public.claim_processing_job_by_id(
  p_job_id uuid,
  p_owner_id uuid,
  p_runner_token uuid,
  p_lease_seconds integer default 300
)
returns setof public.processing_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_job_id is null
    or p_owner_id is null
    or p_runner_token is null
    or p_lease_seconds is null
    or p_lease_seconds <= 0
  then
    return;
  end if;

  return query
    with candidate as (
      select id
      from public.processing_jobs
      where id = p_job_id
        and owner_id = p_owner_id
        and (
          stage in ('uploaded', 'analyzing', 'filing')
          or (
            stage = 'retryable_failed'
            and resume_stage in ('analyzing', 'filing')
            and retry_count < 3
            and updated_at <= now() - make_interval(secs => 120 * retry_count)
          )
        )
        and (lease_expires_at is null or lease_expires_at < now())
      order by created_at
      limit 1
      for update skip locked
    )
    update public.processing_jobs
    set stage = case
          when public.processing_jobs.stage = 'uploaded' then 'analyzing'
          when public.processing_jobs.stage = 'retryable_failed' then public.processing_jobs.resume_stage
          else public.processing_jobs.stage
        end,
        resume_stage = case
          when public.processing_jobs.stage = 'retryable_failed' then null
          else public.processing_jobs.resume_stage
        end,
        runner_token = p_runner_token,
        claimed_at = now(),
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        updated_at = now()
    from candidate
    where public.processing_jobs.id = candidate.id
    returning public.processing_jobs.*;
end;
$$;

revoke all on function public.claim_processing_job_by_id(uuid, uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_processing_job_by_id(uuid, uuid, uuid, integer)
  to service_role;

commit;

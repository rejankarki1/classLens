begin;

create or replace function public.discard_processing_job(p_job_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  job public.processing_jobs%rowtype;
  storage_paths text[];
begin
  if caller is null or p_job_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select *
  into job
  from public.processing_jobs
  where id = p_job_id
    and owner_id = caller
  for update;

  if not found or job.stage = 'completed' then
    raise exception 'This capture cannot be discarded.' using errcode = '42501';
  end if;

  select coalesce(array_agg(storage_path order by page_number), '{}'::text[])
  into storage_paths
  from public.captures
  where owner_id = caller
    and capture_session_id = job.capture_session_id;

  update public.processing_jobs
  set stage = 'terminal_failed',
      resume_stage = null,
      last_error_code = 'USER_DISCARDED',
      last_error_message = null,
      runner_token = null,
      claimed_at = null,
      lease_expires_at = null,
      next_attempt_at = null,
      capture_analysis_id = null,
      updated_at = now()
  where id = job.id;

  -- The stage update deliberately runs both existing triggers: the transition
  -- validator approves every non-completed stage -> terminal_failed, and the
  -- inbox trigger may create final_failure before all events are removed here.
  delete from public.inbox_events
  where processing_job_id = job.id
    and owner_id = caller;

  delete from public.captures
  where owner_id = caller
    and capture_session_id = job.capture_session_id;

  delete from public.capture_analyses
  where owner_id = caller
    and capture_session_id = job.capture_session_id;

  return storage_paths;
end;
$$;

revoke all on function public.discard_processing_job(uuid)
  from public, anon;
grant execute on function public.discard_processing_job(uuid)
  to authenticated;

commit;

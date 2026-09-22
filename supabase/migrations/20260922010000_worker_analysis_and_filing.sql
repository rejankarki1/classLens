begin;

-- Service-role-only equivalents of claim_captures_for_analysis and
-- file_processing_job, needed because a service-role caller (the Session C
-- worker) has no auth.uid() -- it acts across all owners' jobs, not its own.
-- Logic mirrors the existing owner-scoped functions exactly, with an
-- explicit owner_id in place of auth.uid(). Neither is called by the phone
-- or wired into anything yet; both are restricted to service_role only.

create or replace function public.worker_claim_captures_for_analysis(
  p_owner_id uuid,
  p_capture_session_id text,
  p_capture_ids uuid[],
  p_attempt_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  eligible_count integer;
  claimed_count integer;
begin
  if p_owner_id is null
    or p_attempt_id is null
    or p_capture_session_id is null
    or p_capture_ids is null
    or length(btrim(p_capture_session_id)) = 0
    or cardinality(p_capture_ids) not between 1 and 6
    or cardinality(p_capture_ids) <> (
      select count(distinct capture_id)
      from unnest(p_capture_ids) as capture_id
    )
  then
    return false;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_owner_id::text || ':' || p_capture_session_id, 0)
  );

  select count(*)
  into eligible_count
  from public.captures
  where owner_id = p_owner_id
    and capture_session_id = p_capture_session_id
    and id = any(p_capture_ids)
    and status in ('uploaded', 'failed');

  if eligible_count <> cardinality(p_capture_ids) then
    return false;
  end if;

  update public.captures
  set status = 'analyzing',
      analysis_attempt_id = p_attempt_id,
      updated_at = now()
  where owner_id = p_owner_id
    and capture_session_id = p_capture_session_id
    and id = any(p_capture_ids)
    and status in ('uploaded', 'failed');

  get diagnostics claimed_count = row_count;
  return claimed_count = cardinality(p_capture_ids);
end;
$$;

revoke all on function public.worker_claim_captures_for_analysis(uuid, text, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.worker_claim_captures_for_analysis(uuid, text, uuid[], uuid) to service_role;

create or replace function public.worker_file_processing_job(p_job_id uuid, p_runner_token uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.processing_jobs%rowtype;
  saved_analysis public.capture_analyses%rowtype;
  result_id text;
  analysis jsonb;
begin
  select * into job from public.processing_jobs
  where id = p_job_id
  for update;
  if not found then raise exception 'Processing job not found.' using errcode = 'P0002'; end if;
  if job.media_type <> 'photo' then raise exception 'Unsupported processing media type.' using errcode = '22023'; end if;
  if job.stage = 'completed' and job.lecture_id is not null then return job.lecture_id; end if;
  if job.stage <> 'filing' or job.course_id is null then
    raise exception 'Processing job is not ready for filing.' using errcode = '23514';
  end if;
  if job.runner_token is distinct from p_runner_token or job.lease_expires_at < now() then
    raise exception 'Processing job lease is not held.' using errcode = '55P03';
  end if;
  if not exists (
    select 1 from public.course_memberships membership
    where membership.user_id = job.owner_id and membership.course_id = job.course_id
  ) then raise exception 'Selected course is not enrolled.' using errcode = '42501'; end if;

  select * into saved_analysis from public.capture_analyses
  where id = job.capture_analysis_id
    and owner_id = job.owner_id
    and capture_session_id = job.capture_session_id;
  if not found then raise exception 'Saved analysis not found.' using errcode = 'P0002'; end if;
  analysis := saved_analysis.analysis;
  result_id := 'capture-job:' || job.id::text;

  insert into public.lectures (
    id, owner_id, course_id, title, summary, key_concepts, important_points,
    assignments, exam_mentions, capture_session_id, capture_analysis_id, topic, examples
  ) values (
    result_id,
    job.owner_id,
    job.course_id,
    coalesce(nullif(analysis->'topicSignals'->>0, ''), 'Lecture notes'),
    coalesce(analysis->>'combinedSummary', ''),
    coalesce(array(select jsonb_array_elements_text(analysis->'concepts')), '{}'),
    '{}',
    coalesce(array(select jsonb_array_elements_text(analysis->'assignments')), '{}'),
    coalesce(array(select jsonb_array_elements_text(analysis->'examMentions')), '{}'),
    job.capture_session_id,
    saved_analysis.id,
    nullif(analysis->'topicSignals'->>0, ''),
    coalesce(array(select jsonb_array_elements_text(analysis->'examples')), '{}')
  ) on conflict (id) do nothing;

  select id into result_id from public.lectures
  where owner_id = job.owner_id and capture_session_id = job.capture_session_id;
  if result_id is null then raise exception 'Lecture filing could not be verified.' using errcode = 'P0002'; end if;

  update public.captures
  set lecture_id = result_id, updated_at = now()
  where owner_id = job.owner_id
    and capture_session_id = job.capture_session_id
    and processing_job_id = job.id
    and (lecture_id is null or lecture_id = result_id);

  if (select count(*) from public.captures where processing_job_id = job.id and lecture_id = result_id) <> job.total_count then
    raise exception 'Not every capture was attached to the notebook.' using errcode = '23514';
  end if;

  update public.processing_jobs
  set stage = 'completed', lecture_id = result_id, completed_at = now(), updated_at = now(),
      last_error_code = null, last_error_message = null, runner_token = null, lease_expires_at = null
  where id = job.id;
  return result_id;
end;
$$;

revoke all on function public.worker_file_processing_job(uuid, uuid) from public, anon, authenticated;
grant execute on function public.worker_file_processing_job(uuid, uuid) to service_role;

commit;

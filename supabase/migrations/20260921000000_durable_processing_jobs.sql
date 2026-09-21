begin;

create table public.processing_jobs (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  capture_session_id text not null check (length(btrim(capture_session_id)) > 0),
  media_type text not null check (media_type in ('photo', 'audio', 'video')),
  stage text not null default 'queued' check (stage in (
    'queued', 'uploading', 'analyzing', 'course_needed', 'filing',
    'completed', 'retryable_failed', 'terminal_failed'
  )),
  resume_stage text check (resume_stage is null or resume_stage in ('queued', 'uploading', 'analyzing', 'filing')),
  uploaded_count smallint not null default 0 check (uploaded_count >= 0),
  total_count smallint not null check (total_count between 1 and 6),
  retry_count smallint not null default 0 check (retry_count between 0 and 3),
  last_error_code text,
  last_error_message text,
  course_id text references public.courses(id) on delete restrict,
  suggested_course_id text references public.courses(id) on delete set null,
  suggested_course_label text,
  match_confidence double precision check (match_confidence is null or match_confidence between 0 and 1),
  match_explanation text,
  capture_analysis_id uuid references public.capture_analyses(id) on delete restrict,
  lecture_id text references public.lectures(id) on delete restrict,
  runner_token uuid,
  lease_expires_at timestamptz,
  course_needed_notified_at timestamptz,
  failure_notified_at timestamptz,
  completed_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (owner_id, capture_session_id),
  check (uploaded_count <= total_count),
  check ((stage = 'retryable_failed') = (resume_stage is not null)),
  check ((stage = 'completed') = (completed_at is not null))
);

create index processing_jobs_owner_action_idx
  on public.processing_jobs (owner_id, stage, updated_at desc);

alter table public.processing_jobs enable row level security;
revoke all privileges on table public.processing_jobs from public, anon, authenticated;
grant select on table public.processing_jobs to authenticated;
grant insert (id, capture_session_id, media_type, total_count)
  on public.processing_jobs to authenticated;
grant update (
  stage, resume_stage, uploaded_count, retry_count, last_error_code, last_error_message,
  course_id, suggested_course_id, suggested_course_label, match_confidence,
  match_explanation, capture_analysis_id, lecture_id, runner_token, lease_expires_at,
  course_needed_notified_at, failure_notified_at, completed_notified_at,
  updated_at, completed_at
) on public.processing_jobs to authenticated;

create policy "Users read their own processing jobs"
  on public.processing_jobs for select to authenticated
  using (owner_id = auth.uid());

create policy "Users create their own processing jobs"
  on public.processing_jobs for insert to authenticated
  with check (
    owner_id = auth.uid()
    and stage = 'queued'
    and uploaded_count = 0
    and retry_count = 0
    and course_id is null
    and lecture_id is null
  );

create policy "Users update their own processing jobs"
  on public.processing_jobs for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

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
    when 'uploading' then new.stage in ('analyzing', 'retryable_failed', 'terminal_failed')
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

create trigger validate_processing_job_transition_before_update
before update on public.processing_jobs
for each row execute function public.validate_processing_job_transition();

create or replace function public.claim_processing_job(p_job_id uuid, p_runner_token uuid)
returns setof public.processing_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_runner_token is null then return; end if;
  return query
    update public.processing_jobs
    set runner_token = p_runner_token,
        lease_expires_at = now() + interval '5 minutes',
        updated_at = now()
    where id = p_job_id
      and owner_id = auth.uid()
      and stage not in ('completed', 'course_needed', 'retryable_failed', 'terminal_failed')
      and (lease_expires_at is null or lease_expires_at < now() or runner_token = p_runner_token)
    returning *;
end;
$$;

revoke all on function public.claim_processing_job(uuid, uuid) from public, anon;
grant execute on function public.claim_processing_job(uuid, uuid) to authenticated;

alter table public.captures
  add column processing_job_id uuid references public.processing_jobs(id) on delete restrict,
  add column lecture_id text references public.lectures(id) on delete restrict,
  add column quality_metadata jsonb check (quality_metadata is null or jsonb_typeof(quality_metadata) = 'object');

create index captures_processing_job_idx on public.captures (processing_job_id, page_number);
create index captures_lecture_idx on public.captures (lecture_id, page_number);
grant insert (processing_job_id, quality_metadata) on public.captures to authenticated;
grant update (processing_job_id, quality_metadata, updated_at) on public.captures to authenticated;

create or replace function public.validate_capture_processing_job()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.processing_job_id is not null and not exists (
    select 1 from public.processing_jobs job
    where job.id = new.processing_job_id
      and job.owner_id = new.owner_id
      and job.capture_session_id = new.capture_session_id
      and job.media_type = 'photo'
  ) then
    raise exception 'Capture does not match its processing job.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validate_capture_processing_job_before_write
before insert or update of processing_job_id on public.captures
for each row execute function public.validate_capture_processing_job();

alter table public.lectures
  add column capture_session_id text,
  add column capture_analysis_id uuid references public.capture_analyses(id) on delete restrict,
  add column topic text,
  add column examples text[] not null default '{}';

create unique index lectures_owner_capture_session_key
  on public.lectures (owner_id, capture_session_id)
  where owner_id is not null and capture_session_id is not null;

create or replace function public.file_processing_job(p_job_id uuid, p_runner_token uuid)
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
  where id = p_job_id and owner_id = auth.uid()
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
    where membership.user_id = auth.uid() and membership.course_id = job.course_id
  ) then raise exception 'Selected course is not enrolled.' using errcode = '42501'; end if;

  select * into saved_analysis from public.capture_analyses
  where id = job.capture_analysis_id
    and owner_id = auth.uid()
    and capture_session_id = job.capture_session_id;
  if not found then raise exception 'Saved analysis not found.' using errcode = 'P0002'; end if;
  analysis := saved_analysis.analysis;
  result_id := 'capture-job:' || job.id::text;

  insert into public.lectures (
    id, owner_id, course_id, title, summary, key_concepts, important_points,
    assignments, exam_mentions, capture_session_id, capture_analysis_id, topic, examples
  ) values (
    result_id,
    auth.uid(),
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
  where owner_id = auth.uid() and capture_session_id = job.capture_session_id;
  if result_id is null then raise exception 'Lecture filing could not be verified.' using errcode = 'P0002'; end if;

  update public.captures
  set lecture_id = result_id, updated_at = now()
  where owner_id = auth.uid()
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

revoke all on function public.file_processing_job(uuid, uuid) from public, anon;
grant execute on function public.file_processing_job(uuid, uuid) to authenticated;

commit;

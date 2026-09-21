begin;

create table public.captures (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  capture_session_id text not null check (length(btrim(capture_session_id)) > 0),
  client_photo_id text not null check (length(btrim(client_photo_id)) > 0),
  page_number smallint not null check (page_number between 1 and 6),
  storage_path text not null unique check (length(btrim(storage_path)) > 0),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png')),
  captured_at timestamptz not null,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'analyzing', 'analyzed', 'failed')),
  analysis_attempt_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, capture_session_id, client_photo_id),
  unique (owner_id, capture_session_id, page_number)
);

create index captures_owner_session_idx
  on public.captures (owner_id, capture_session_id, page_number);

create table public.capture_analyses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  capture_session_id text not null check (length(btrim(capture_session_id)) > 0),
  capture_ids uuid[] not null check (cardinality(capture_ids) between 1 and 6),
  analysis jsonb not null check (jsonb_typeof(analysis) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, capture_session_id)
);

alter table public.captures enable row level security;
alter table public.capture_analyses enable row level security;

revoke all privileges on table public.captures, public.capture_analyses
  from public, anon, authenticated;

grant select on table public.captures, public.capture_analyses to authenticated;
grant insert (id, capture_session_id, client_photo_id, page_number, storage_path, mime_type, captured_at)
  on public.captures to authenticated;
grant update (status, updated_at) on public.captures to authenticated;
grant insert (capture_session_id, capture_ids, analysis, updated_at) on public.capture_analyses to authenticated;
grant update (capture_ids, analysis, updated_at) on public.capture_analyses to authenticated;

create policy "Users read their own captures"
  on public.captures for select to authenticated
  using (owner_id = auth.uid());

create policy "Users create their own captures"
  on public.captures for insert to authenticated
  with check (owner_id = auth.uid() and status = 'uploaded');

create policy "Users update their own capture status"
  on public.captures for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create or replace function public.claim_captures_for_analysis(
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
  requesting_user_id uuid := auth.uid();
  eligible_count integer;
  claimed_count integer;
begin
  if requesting_user_id is null
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

  -- Serialize claims for one user's capture session so checking eligibility and
  -- assigning the attempt token is one all-or-nothing operation.
  perform pg_advisory_xact_lock(
    hashtextextended(requesting_user_id::text || ':' || p_capture_session_id, 0)
  );

  select count(*)
  into eligible_count
  from public.captures
  where owner_id = requesting_user_id
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
  where owner_id = requesting_user_id
    and capture_session_id = p_capture_session_id
    and id = any(p_capture_ids)
    and status in ('uploaded', 'failed');

  get diagnostics claimed_count = row_count;
  return claimed_count = cardinality(p_capture_ids);
end;
$$;

revoke all on function public.claim_captures_for_analysis(text, uuid[], uuid)
  from public, anon;
grant execute on function public.claim_captures_for_analysis(text, uuid[], uuid)
  to authenticated;

create policy "Users read their own capture analyses"
  on public.capture_analyses for select to authenticated
  using (owner_id = auth.uid());

create policy "Users create their own capture analyses"
  on public.capture_analyses for insert to authenticated
  with check (owner_id = auth.uid());

create policy "Users update their own capture analyses"
  on public.capture_analyses for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Users upload their own capture photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'lecture-materials'
    and (storage.foldername(name))[1] = 'captures'
    and (storage.foldername(name))[2] = auth.uid()::text
    and name ~ ('^captures/' || auth.uid()::text || '/[0-9a-f-]{36}/photo\.(jpg|png)$')
  );

create policy "Users read their own capture photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'lecture-materials'
    and (storage.foldername(name))[1] = 'captures'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "Users remove their own orphan capture photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'lecture-materials'
    and (storage.foldername(name))[1] = 'captures'
    and (storage.foldername(name))[2] = auth.uid()::text
    and not exists (
      select 1 from public.captures as capture
      where capture.storage_path = storage.objects.name
    )
  );

commit;

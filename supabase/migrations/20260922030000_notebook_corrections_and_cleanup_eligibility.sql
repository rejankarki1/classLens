begin;

-- Session E: student corrections to the faithful extraction, tied to a specific
-- notebook page, plus the cleanup-eligibility bookkeeping columns processing_jobs
-- needs before Session F's scheduled cleanup can run. No cleanup logic runs yet.

-- Corrections never overwrite the saved capture_analyses row -- that stays the
-- durable record of what Gemini originally produced. Each correction snapshots
-- original_text once (from the analysis at edit time) and only corrected_text
-- can change afterward, so the notebook can always show both.
create table public.notebook_corrections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lecture_id text not null references public.lectures(id) on delete cascade,
  capture_id uuid references public.captures(id) on delete cascade,
  page_number smallint not null check (page_number between 1 and 6),
  original_text text not null,
  corrected_text text not null check (length(btrim(corrected_text)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One correction per page: a second edit updates the same row (tap-to-edit
  -- inline saves in place) instead of accumulating a new row per edit.
  unique (owner_id, lecture_id, page_number)
);

create index notebook_corrections_lecture_idx
  on public.notebook_corrections (lecture_id, page_number);

alter table public.notebook_corrections enable row level security;
revoke all privileges on table public.notebook_corrections from public, anon;

grant select on table public.notebook_corrections to authenticated;
grant insert (lecture_id, capture_id, page_number, original_text, corrected_text)
  on public.notebook_corrections to authenticated;
-- original_text is intentionally excluded from the update grant: once written,
-- only corrected_text (and updated_at) may change.
grant update (corrected_text, updated_at) on public.notebook_corrections to authenticated;

create policy "Users read their own corrections"
  on public.notebook_corrections for select to authenticated
  using (owner_id = auth.uid());

create policy "Users create their own corrections"
  on public.notebook_corrections for insert to authenticated
  with check (owner_id = auth.uid());

create policy "Users update their own corrections"
  on public.notebook_corrections for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create or replace function public.validate_notebook_correction()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.lectures lecture
    where lecture.id = new.lecture_id and lecture.owner_id = new.owner_id
  ) then
    raise exception 'Corrections require a notebook you own.' using errcode = '42501';
  end if;
  if new.capture_id is not null and not exists (
    select 1 from public.captures capture
    where capture.id = new.capture_id
      and capture.owner_id = new.owner_id
      and capture.lecture_id = new.lecture_id
      and capture.page_number = new.page_number
  ) then
    raise exception 'Correction page reference does not match this notebook.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (
    new.owner_id <> old.owner_id
    or new.lecture_id <> old.lecture_id
    or new.capture_id is distinct from old.capture_id
    or new.page_number <> old.page_number
    or new.original_text <> old.original_text
    or new.created_at <> old.created_at
  ) then
    raise exception 'Correction identity and original extraction cannot change.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validate_notebook_correction_before_write
before insert or update on public.notebook_corrections
for each row execute function public.validate_notebook_correction();

-- Cleanup-eligibility bookkeeping for the 7-day original-photo retention window
-- (plan §7, §9 Session F). Columns only: no scheduled job reads them yet.
-- completed_at already exists on processing_jobs (Session A/durable jobs).
alter table public.processing_jobs
  add column cleanup_eligible_at timestamptz,
  add column cleanup_attempted_at timestamptz,
  add column cleanup_completed_at timestamptz,
  add column last_cleanup_error text,
  add constraint processing_jobs_cleanup_eligible_requires_completed
    check (cleanup_eligible_at is null or completed_at is not null),
  add constraint processing_jobs_cleanup_completed_requires_attempted
    check (cleanup_completed_at is null or cleanup_attempted_at is not null);

commit;

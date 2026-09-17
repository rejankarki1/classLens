begin;

-- Enrollment is separate from the global catalog; existing courses stay intact.
create table public.course_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null references public.courses(id) on delete restrict,
  joined_at timestamptz not null default now(),
  constraint course_memberships_user_course_key unique (user_id, course_id)
);

-- The unique constraint already indexes user_id as its leading column.
create index course_memberships_course_id_idx
  on public.course_memberships (course_id);

alter table public.course_memberships enable row level security;

revoke all privileges on table public.course_memberships from public, anon, authenticated;

grant select, delete on table public.course_memberships to authenticated;
grant insert (user_id, course_id) on public.course_memberships to authenticated;

create policy "Users read only their own course memberships"
  on public.course_memberships for select to authenticated
  using (auth.uid() = user_id);

create policy "Users create only their own course memberships"
  on public.course_memberships for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users delete only their own course memberships"
  on public.course_memberships for delete to authenticated
  using (auth.uid() = user_id);

commit;

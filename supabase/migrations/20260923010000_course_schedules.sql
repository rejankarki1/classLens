begin;

-- Session I: optional per-course class times, used only as a signal to help
-- the worker's automatic course match (courseMatch.ts) -- never as a filter
-- that could select a course the student isn't enrolled in. The matcher only
-- ever ranks courses already returned by course_memberships; a schedule row
-- can raise a course already in that enrolled-only list, never introduce one
-- that isn't. course_id references the catalog on delete restrict, matching
-- course_memberships: removing a schedule (or an enrollment) never deletes
-- or orphans a catalog course.
create table public.course_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null references public.courses(id) on delete restrict,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null check (end_time > start_time),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, course_id, day_of_week, start_time)
);

create index course_schedules_user_idx on public.course_schedules (user_id);

alter table public.course_schedules enable row level security;
revoke all privileges on table public.course_schedules from public, anon, authenticated;

grant select, insert, delete on table public.course_schedules to authenticated;
-- user_id and course_id are excluded from the update grant: correcting a time
-- for the wrong course/day is a delete-and-recreate, not a silent retarget.
grant update (day_of_week, start_time, end_time, updated_at) on table public.course_schedules to authenticated;

create policy "Users read their own class schedules"
  on public.course_schedules for select to authenticated
  using (user_id = auth.uid());

create policy "Users create their own class schedules"
  on public.course_schedules for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users update their own class schedules"
  on public.course_schedules for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users delete their own class schedules"
  on public.course_schedules for delete to authenticated
  using (user_id = auth.uid());

commit;

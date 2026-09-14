begin;

alter table public.courses enable row level security;
alter table public.lectures enable row level security;

revoke all privileges
  on table public.courses, public.lectures
  from public, anon, authenticated;

grant usage on schema public to anon;

grant select
  on table public.courses, public.lectures
  to anon;

create policy "Demo clients can read courses"
  on public.courses
  for select
  to anon
  using (true);

create policy "Demo clients can read lectures"
  on public.lectures
  for select
  to anon
  using (true);

commit;

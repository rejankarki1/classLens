begin;

-- Onboarding fails with "permission denied for table profiles" because every
-- profiles grant targets the authenticated role, while the running demo talks to
-- PostgREST as anon. This adds the anon path without touching the authenticated
-- one. Idempotent: safe to run more than once.
--
-- RLS stays enabled on profiles; nothing here disables it.

-- A signed-out demo has no auth.users row, so an anon profile could never
-- satisfy the foreign key. id remains a uuid primary key and still holds
-- auth.uid() whenever a user is signed in.
alter table public.profiles
  drop constraint if exists profiles_id_fkey;

alter table public.profiles enable row level security;

grant select on table public.profiles to anon;
grant insert (id, name, year, major) on public.profiles to anon;
grant update (name, year, major) on public.profiles to anon;

-- Shared demo access, matching how courses, lectures and materials already work
-- for anon. The year check constraint on the table still applies.
drop policy if exists "Demo clients can read profiles" on public.profiles;
create policy "Demo clients can read profiles"
  on public.profiles for select to anon
  using (true);

drop policy if exists "Demo clients can create a profile" on public.profiles;
create policy "Demo clients can create a profile"
  on public.profiles for insert to anon
  with check (
    length(btrim(name)) > 0
    and length(btrim(major)) > 0
  );

drop policy if exists "Demo clients can update a profile" on public.profiles;
create policy "Demo clients can update a profile"
  on public.profiles for update to anon
  using (true)
  with check (
    length(btrim(name)) > 0
    and length(btrim(major)) > 0
  );

commit;

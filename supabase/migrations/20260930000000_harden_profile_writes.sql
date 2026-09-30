begin;

-- The demo-era migration granted anonymous clients permission to read, create,
-- and overwrite arbitrary profile rows. Profile discovery is an authenticated
-- feature; every write additionally requires auth.uid() to match id.
drop policy if exists "Demo clients can read profiles" on public.profiles;
drop policy if exists "Demo clients can create a profile" on public.profiles;
drop policy if exists "Demo clients can update a profile" on public.profiles;

-- Remove any other legacy SELECT policy granted through anon or public,
-- regardless of its name. The authenticated-only policy is preserved.
do $$
declare
  policy_name text;
begin
  for policy_name in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and cmd in ('SELECT', 'ALL')
      and roles && array['anon', 'public']::name[]
  loop
    execute format('drop policy %I on public.profiles', policy_name);
  end loop;
end;
$$;

revoke select on table public.profiles from anon;
revoke select (id, name, year, major, is_demo) on table public.profiles from anon;
revoke select on table public.profiles from public;
revoke select (id, name, year, major, is_demo) on table public.profiles from public;
revoke insert on table public.profiles from anon;
revoke update on table public.profiles from anon;
revoke insert (id, name, year, major) on table public.profiles from anon;
revoke update (name, year, major) on table public.profiles from anon;
revoke insert on table public.profiles from public;
revoke update on table public.profiles from public;
revoke insert (id, name, year, major) on table public.profiles from public;
revoke update (name, year, major) on table public.profiles from public;

grant select on table public.profiles to authenticated;
grant insert (id, name, year, major) on table public.profiles to authenticated;
grant update (name, year, major) on table public.profiles to authenticated;

drop policy if exists "Users create only their own profile" on public.profiles;
create policy "Users create only their own profile"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

drop policy if exists "Users update only their own profile" on public.profiles;
create policy "Users update only their own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

commit;

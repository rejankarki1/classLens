begin;

-- Catch Up needs a classmate to share a lecture, but a demo must not require a
-- second real device or a fabricated auth.users row. This creates a seeded
-- profile that is not backed by an auth user, plus a narrowly scoped way to
-- befriend it. Idempotent: safe to run more than once.
--
-- Real friendship behaviour is untouched: anon still has no access to
-- friendships, status is still not grantable, and only an addressee can accept
-- a genuine request.

-- Marks a profile as seeded demo data. This is what keeps the demo acceptance
-- path from ever touching a real account.
alter table public.profiles
  add column if not exists is_demo boolean not null default false;

-- profiles.id lost its auth.users foreign key earlier, so a demo profile is
-- possible. lectures.owner_id still points at auth.users, which a demo profile
-- can never satisfy. Dropping it lets a seeded lecture be owned by the demo
-- classmate. owner_id stays a nullable uuid and every RLS rule still compares it
-- to auth.uid(), so nothing about real ownership changes.
alter table public.lectures
  drop constraint if exists lectures_owner_id_fkey;

-- The only way to become friends with a demo profile.
-- SECURITY DEFINER so it can write the accepted row that RLS deliberately
-- forbids clients from writing directly, but it refuses any profile that is not
-- flagged is_demo, so it cannot be used to force a friendship with a real user.
create or replace function public.accept_demo_friendship(demo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Sign in to add classmates.' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = demo_id and is_demo
  ) then
    raise exception 'That classmate is not a demo profile.' using errcode = '22023';
  end if;

  if me = demo_id then
    raise exception 'You cannot add yourself.' using errcode = '22023';
  end if;

  insert into public.friendships (requester_id, addressee_id, status)
  values (me, demo_id, 'accepted')
  on conflict do nothing;

  -- A pending row may already exist from a normal Add before this ran.
  update public.friendships
  set status = 'accepted'
  where status <> 'accepted'
    and least(requester_id, addressee_id) = least(me, demo_id)
    and greatest(requester_id, addressee_id) = greatest(me, demo_id);
end;
$$;

revoke all on function public.accept_demo_friendship(uuid) from public, anon;
grant execute on function public.accept_demo_friendship(uuid) to authenticated;

-- Let clients see which profiles are demo so the UI can use the demo path.
grant select (id, name, year, major, is_demo) on public.profiles to anon, authenticated;

commit;

begin;

-- Authentication is Supabase Auth. Passwords and emails live in auth.users and
-- are never copied here: this table holds only the non-sensitive fields the app
-- shows, which is also why friend search is by name and never exposes auth.users.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  year text not null check (year in ('Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate')),
  major text not null check (length(btrim(major)) > 0),
  created_at timestamptz not null default now()
);

create index profiles_name_idx on public.profiles (lower(name));

alter table public.profiles enable row level security;

revoke all privileges on table public.profiles from public, anon, authenticated;

grant select on table public.profiles to authenticated;
grant insert (id, name, year, major) on public.profiles to authenticated;
grant update (name, year, major) on public.profiles to authenticated;

-- Finding a classmate requires reading other profiles. Only name, year and
-- major are exposed, and no client may write another user's row.
create policy "Authenticated users can read profiles"
  on public.profiles for select to authenticated
  using (true);

create policy "Users create only their own profile"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

create policy "Users update only their own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);


create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  constraint friendships_no_self_request check (requester_id <> addressee_id)
);

-- One relationship per pair in either direction, so A->B and B->A cannot both
-- exist and a request cannot be sent twice.
create unique index friendships_unique_pair
  on public.friendships (
    least(requester_id, addressee_id),
    greatest(requester_id, addressee_id)
  );

create index friendships_requester_idx on public.friendships (requester_id);
create index friendships_addressee_idx on public.friendships (addressee_id);

alter table public.friendships enable row level security;

revoke all privileges on table public.friendships from public, anon, authenticated;

grant select on table public.friendships to authenticated;
grant insert (requester_id, addressee_id) on public.friendships to authenticated;
grant update (status) on public.friendships to authenticated;

-- A friendship is visible only to the two people in it.
create policy "Users read their own friendships"
  on public.friendships for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- You may only send requests as yourself. status is not grantable, so a new row
-- always takes the pending default.
create policy "Users create only their own requests"
  on public.friendships for insert to authenticated
  with check (auth.uid() = requester_id and requester_id <> addressee_id);

-- Only the addressee accepts, only a pending row, and only into accepted.
-- Requesters cannot accept their own request and nobody can revert to pending.
create policy "Addressees accept requests sent to them"
  on public.friendships for update to authenticated
  using (auth.uid() = addressee_id and status = 'pending')
  with check (auth.uid() = addressee_id and status = 'accepted');

commit;

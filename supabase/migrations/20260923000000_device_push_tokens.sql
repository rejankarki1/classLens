begin;

-- Session H: per-device push token registry. A device registers its own token
-- when notification permission is granted and removes it on logout or when
-- the token is replaced (rotation) or found invalid. No send pipeline exists
-- yet -- these rows are written and read only by their own owner; nothing
-- grants any client role the ability to read another user's token, and no
-- service-role sending function exists in this session, so "server-only
-- delivery access" holds by simply never widening these grants later without
-- a dedicated review.
create table public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  expo_push_token text not null unique check (length(btrim(expo_push_token)) > 0),
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index device_push_tokens_owner_idx on public.device_push_tokens (owner_id);

alter table public.device_push_tokens enable row level security;
revoke all privileges on table public.device_push_tokens from public, anon, authenticated;

grant select, insert, delete on table public.device_push_tokens to authenticated;
-- owner_id and created_at are intentionally excluded from the update grant:
-- a token row's identity never changes after it is written, only its value
-- (rotation) or platform can be corrected.
grant update (expo_push_token, platform, updated_at) on table public.device_push_tokens to authenticated;

create policy "Users read their own device push tokens"
  on public.device_push_tokens for select to authenticated
  using (owner_id = auth.uid());

create policy "Users register their own device push tokens"
  on public.device_push_tokens for insert to authenticated
  with check (owner_id = auth.uid());

create policy "Users update their own device push tokens"
  on public.device_push_tokens for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Users remove their own device push tokens"
  on public.device_push_tokens for delete to authenticated
  using (owner_id = auth.uid());

commit;

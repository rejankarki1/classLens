begin;

-- A physical device token survives account switches. RLS correctly prevents a
-- user from reading another owner's row, so registration needs one narrow
-- server-side operation that can atomically move only the exact presented token.
create or replace function public.register_device_push_token(
  p_expo_push_token text,
  p_platform text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  normalized_token text := btrim(p_expo_push_token);
begin
  if caller is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if normalized_token is null or length(normalized_token) = 0 then
    raise exception 'Push token is required.' using errcode = '22023';
  end if;
  if p_platform not in ('ios', 'android') then
    raise exception 'Unsupported push platform.' using errcode = '22023';
  end if;

  insert into public.device_push_tokens (owner_id, expo_push_token, platform)
  values (caller, normalized_token, p_platform)
  on conflict (expo_push_token) do update
  set owner_id = excluded.owner_id,
      platform = excluded.platform,
      updated_at = now();
end;
$$;

revoke all on function public.register_device_push_token(text, text) from public, anon;
grant execute on function public.register_device_push_token(text, text) to authenticated;

commit;

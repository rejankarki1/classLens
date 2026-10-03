-- Three completed quizzes per rolling seven days. In-flight reservations count
-- for two minutes so concurrent requests cannot all enter Gemini.
create table public.quiz_usage (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'reserved' check (status in ('reserved', 'completed', 'released')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint quiz_usage_completed_at_matches_status
    check ((status = 'completed') = (completed_at is not null))
);

create index quiz_usage_owner_window_idx on public.quiz_usage (owner_id, created_at desc);
alter table public.quiz_usage enable row level security;
create policy "Owners can read their quiz usage" on public.quiz_usage
  for select to authenticated using (owner_id = (select auth.uid()));
revoke all on public.quiz_usage from public, anon, authenticated;
grant select on public.quiz_usage to authenticated;
grant all on public.quiz_usage to service_role;

create function public.reserve_quiz_use(p_owner_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  used_count integer;
  new_id uuid;
begin
  if p_owner_id is null then raise exception 'Owner required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 8821));
  select count(*) into used_count from public.quiz_usage
    where owner_id = p_owner_id
      and ((status = 'completed' and completed_at > now() - interval '7 days')
        or (status = 'reserved' and created_at > now() - interval '2 minutes'));
  if used_count >= 3 then
    return jsonb_build_object('reservationId', null, 'remaining', 0);
  end if;
  insert into public.quiz_usage (owner_id) values (p_owner_id) returning id into new_id;
  return jsonb_build_object('reservationId', new_id, 'remaining', 2 - used_count);
end $$;

create function public.finish_quiz_use(p_reservation_id uuid, p_success boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  reservation_owner uuid;
  reservation_status text;
  other_uses integer;
begin
  if p_reservation_id is null or p_success is null then
    raise exception 'Reservation ID and outcome are required';
  end if;
  select owner_id into reservation_owner from public.quiz_usage where id = p_reservation_id;
  if reservation_owner is null then return jsonb_build_object('outcome', 'not_found'); end if;

  -- Reserve and finish serialize on the same owner lock. Re-read after waiting:
  -- another request may have completed or released this reservation meanwhile.
  perform pg_advisory_xact_lock(hashtextextended(reservation_owner::text, 8821));
  select status into reservation_status from public.quiz_usage
    where id = p_reservation_id and owner_id = reservation_owner for update;
  if reservation_status is null then return jsonb_build_object('outcome', 'not_found'); end if;
  if reservation_status = 'completed' then return jsonb_build_object('outcome', 'completed'); end if;
  if reservation_status = 'released' then return jsonb_build_object('outcome', 'released'); end if;

  if p_success then
    select count(*) into other_uses from public.quiz_usage
      where owner_id = reservation_owner and id <> p_reservation_id
        and ((status = 'completed' and completed_at > now() - interval '7 days')
          or (status = 'reserved' and created_at > now() - interval '2 minutes'));
    if other_uses >= 3 then
      update public.quiz_usage set status = 'released' where id = p_reservation_id;
      return jsonb_build_object('outcome', 'quota_reached');
    end if;
    update public.quiz_usage set status = 'completed', completed_at = now()
      where id = p_reservation_id;
    return jsonb_build_object('outcome', 'completed');
  else
    update public.quiz_usage set status = 'released' where id = p_reservation_id;
    return jsonb_build_object('outcome', 'released');
  end if;
end $$;

create function public.quiz_uses_remaining(p_owner_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select greatest(0, 3 - count(*)::integer) from public.quiz_usage
    where owner_id = p_owner_id
      and ((status = 'completed' and completed_at > now() - interval '7 days')
        or (status = 'reserved' and created_at > now() - interval '2 minutes'));
$$;

revoke all on function public.reserve_quiz_use(uuid) from public, anon, authenticated;
revoke all on function public.finish_quiz_use(uuid, boolean) from public, anon, authenticated;
revoke all on function public.quiz_uses_remaining(uuid) from public, anon, authenticated;
grant execute on function public.reserve_quiz_use(uuid) to service_role;
grant execute on function public.finish_quiz_use(uuid, boolean) to service_role;
grant execute on function public.quiz_uses_remaining(uuid) to service_role;

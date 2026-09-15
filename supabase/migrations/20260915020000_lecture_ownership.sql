begin;

-- Catch Up copies a classmate's lecture into your own notebook, which requires
-- knowing whose notebook a lecture belongs to.
--
-- owner_id is NULLABLE and is not backfilled. Every existing lecture keeps
-- owner_id null and stays readable by everyone, so the current demo data and the
-- verified live-test lecture continue to work unchanged. No row is rewritten and
-- no column is dropped or renamed.
alter table public.lectures
  add column owner_id uuid references auth.users(id) on delete set null;

create index lectures_owner_id_idx on public.lectures (owner_id);

grant select on table public.lectures to authenticated;
grant insert (id, course_id, title, summary, key_concepts, important_points,
  assignments, exam_mentions, owner_id)
  on public.lectures to authenticated;

-- Readable: shared demo lectures, your own, and those of accepted friends.
-- This is what Catch Up lists, enforced in the database rather than the UI.
create policy "Users read demo, own and friends lectures"
  on public.lectures for select to authenticated
  using (
    owner_id is null
    or owner_id = auth.uid()
    or exists (
      select 1 from public.friendships as friendship
      where friendship.status = 'accepted'
        and (
          (friendship.requester_id = auth.uid() and friendship.addressee_id = lectures.owner_id)
          or (friendship.addressee_id = auth.uid() and friendship.requester_id = lectures.owner_id)
        )
    )
  );

-- You may only create lectures you own, in a course that exists. Claiming
-- someone else's id is rejected. UPDATE and DELETE remain unavailable.
create policy "Users create their own lectures"
  on public.lectures for insert to authenticated
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.courses where courses.id = lectures.course_id)
  );

commit;

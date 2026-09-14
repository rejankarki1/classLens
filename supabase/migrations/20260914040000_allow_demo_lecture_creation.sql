begin;

-- Shared hackathon demo: allow creating lectures in existing courses only.
-- No UPDATE or DELETE permissions are added. RLS remains enabled.
grant insert (id, course_id, title, summary, key_concepts, important_points,
  assignments, exam_mentions)
  on public.lectures to anon;

create policy "Demo clients can create lectures"
  on public.lectures for insert to anon
  with check (
    exists (select 1 from public.courses where courses.id = lectures.course_id)
  );

commit;

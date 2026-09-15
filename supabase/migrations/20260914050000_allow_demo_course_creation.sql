begin;

-- Shared hackathon demo: allow creating courses so a clean database is usable.
-- Without this, getCourses() returns no rows and every capture dead-ends.
-- No UPDATE or DELETE permissions are added. RLS remains enabled.
grant insert (id, code, name, professor) on public.courses to anon;

-- Course creation is user-confirmed in the app; analysis never inserts directly.
-- professor may be empty because the analysis contract has no professor field.
create policy "Demo clients can create courses"
  on public.courses for insert to anon
  with check (
    length(btrim(code)) > 0
    and length(btrim(name)) > 0
  );

commit;

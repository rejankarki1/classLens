-- Local/demo seed. Idempotent: reruns preserve rows with matching IDs, so this
-- never overwrites a course a student edited or created from the app.
--
-- Seed data is NOT live data. Applying this file does not touch the hosted
-- project; it runs on `supabase db reset` for local/demo setup.
--
-- cs-3358 is kept because the verified live-test lecture
-- 0ac7fc23-25d1-4ef9-be8d-6746a5bb3f03 references it, and its name stays
-- "Data Structures" to match the row that already exists live.
--
-- The remaining rows mirror the Recommended list in the Add Course sheet
-- (src/components/AddCourseSheet.tsx). IDs are the slugified course code, which
-- is exactly what createCourse derives, so a student who saves a recommended
-- course resolves to the same row instead of creating a duplicate.
--
-- professor is NOT NULL but may be empty: the field is optional in the UI and
-- LectureAnalysis carries no professor.
begin;

insert into public.courses (id, code, name, professor)
values
  ('cs-3358',   'CS 3358',   'Data Structures',                           'Professor Seaman'),
  ('cs-2325',   'CS 2325',   'Computer Organization',                     ''),
  ('math-3398', 'MATH 3398', 'Discrete Mathematics II',                   ''),
  ('math-3305', 'MATH 3305', 'Introduction to Probability and Statistics', ''),
  ('eng-1310',  'ENG 1310',  'College Writing I',                         ''),
  ('eng-1320',  'ENG 1320',  'College Writing II',                        '')
on conflict (id) do nothing;

commit;

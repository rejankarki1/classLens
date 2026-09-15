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

-- Demo classmate for Catch Up. Not backed by an auth.users row: this profile
-- exists only so the Catch Up flow can be shown without a second device. It is
-- flagged is_demo, which is the only thing accept_demo_friendship will befriend.
-- Fixed UUID so reruns update rather than duplicate.
insert into public.profiles (id, name, year, major, is_demo)
values (
  'd3405e91-5a2b-4c77-9f61-0b8a7c2d4e10',
  'Prashant Bhattarai',
  'Junior',
  'Computer Science',
  true
)
on conflict (id) do update
  set name = excluded.name,
      year = excluded.year,
      major = excluded.major,
      is_demo = true;

-- The demo classmate's real lecture: assets/demo/prashant-assembly-notes.jpeg was
-- uploaded through the normal pipeline and analysed by analyze-material. These are
-- Gemini's actual fields for that photo; only the title is a chosen display name.
-- exam_mentions is empty because the photo contains no exam information.
insert into public.lectures (
  id, course_id, title, summary,
  key_concepts, important_points, assignments, exam_mentions, owner_id
)
values (
  'demo-prashant-lecture',
  'cs-2325',
  'Computer Organization',
  'These study notes provide a comprehensive reference for x86 assembly language programming, including register usage, conditional jumps, bitwise operations, loop structures, and common instructions like MOV, DIV, IDIV, and INVOKE.',
  array['Conditional Jumps (jo, jc, jbe, jz, jnz, js, jns, jp, jnp)','Bitwise Operations (AND, OR, XOR, TEST)','Arithmetic Operations (ADD, SUB, MUL, IMUL, DIV, IDIV)','Register Usage (eax, ebx, ecx, edx, esi)','Looping Structures','Procedure Invocation (INVOKE, PROC, PROTO)']::text[],
  array['DIV divides edx:eax; requires edx to be cleared first.','TEST checks bits without changing the register values.','AND is used for clearing bits; OR is used for setting bits.','SF=1 indicates negative values (js), SF=0 indicates positive (jns).','Floating point/conditional jumps: FP maps to loopnz/jnz, FN maps to loopz/jz.']::text[],
  array['Write a procedure named CountMatches that receives two arrays of signed doublewords and their length, then returns the count of matching elements.']::text[],
  array[]::text[],
  'd3405e91-5a2b-4c77-9f61-0b8a7c2d4e10'
)
on conflict (id) do update
  set course_id = excluded.course_id,
      title = excluded.title,
      summary = excluded.summary,
      key_concepts = excluded.key_concepts,
      important_points = excluded.important_points,
      assignments = excluded.assignments,
      exam_mentions = excluded.exam_mentions,
      owner_id = excluded.owner_id;

commit;

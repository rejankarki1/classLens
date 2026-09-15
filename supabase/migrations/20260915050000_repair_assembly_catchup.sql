-- Repair the existing photo-backed demo; never insert a source lecture.
begin;
do $$
begin
  if exists (select 1 from public.lectures where id = 'demo-prashant-lecture') and not exists (
    select 1 from public.materials
    where id = 'a3bdac54-d050-40e7-a934-0a3dc5bb7172'
      and lecture_id = 'demo-prashant-lecture'
      and storage_path = 'materials/a3bdac54-d050-40e7-a934-0a3dc5bb7172/photo.jpg'
  ) then
    raise exception 'Verified Assembly material association is missing; refusing repair';
  end if;
end $$;
with seeded(id, course_id, title, summary, key_concepts, important_points,
  assignments, exam_mentions, owner_id) as (values
('demo-prashant-lecture',
  'cs-2325',
  'Computer Organization',
  'These study notes provide a comprehensive reference for x86 assembly language programming, including register usage, conditional jumps, bitwise operations, loop structures, and common instructions like MOV, DIV, IDIV, and INVOKE.',
  array['Conditional Jumps (jo, jc, jbe, jz, jnz, js, jns, jp, jnp)','Bitwise Operations (AND, OR, XOR, TEST)','Arithmetic Operations (ADD, SUB, MUL, IMUL, DIV, IDIV)','Register Usage (eax, ebx, ecx, edx, esi)','Looping Structures','Procedure Invocation (INVOKE, PROC, PROTO)']::text[],
  array['DIV divides edx:eax; requires edx to be cleared first.','TEST checks bits without changing the register values.','AND is used for clearing bits; OR is used for setting bits.','SF=1 indicates negative values (js), SF=0 indicates positive (jns).','Floating point/conditional jumps: FP maps to loopnz/jnz, FN maps to loopz/jz.']::text[],
  array['Write a procedure named CountMatches that receives two arrays of signed doublewords and their length, then returns the count of matching elements.']::text[],
  array[]::text[],
  'd3405e91-5a2b-4c77-9f61-0b8a7c2d4e10'
)
)
update public.lectures l
set course_id = s.course_id, title = s.title, summary = s.summary,
    key_concepts = s.key_concepts, important_points = s.important_points,
    assignments = s.assignments, exam_mentions = s.exam_mentions,
    owner_id = s.owner_id::uuid
from seeded s where l.id = s.id;

-- Safe when this repair was applied directly before migration bookkeeping.
drop policy if exists "Authenticated users read Prashant Assembly demo" on public.lectures;

-- The same verified demo is available before accepting a demo friendship.
create policy "Authenticated users read Prashant Assembly demo"
  on public.lectures for select to authenticated
  using (id = 'demo-prashant-lecture'
    and owner_id = 'd3405e91-5a2b-4c77-9f61-0b8a7c2d4e10'
    and course_id = 'cs-2325');
commit;

-- Minimal seed for real usage. Reruns preserve rows with matching IDs.
--
-- cs-3358 is kept because the verified live-test lecture
-- 0ac7fc23-25d1-4ef9-be8d-6746a5bb3f03 references it. Demo lectures and the
-- unused math-3398 course were removed so a reset starts clean: students
-- create their own courses from the capture flow.
begin;

insert into public.courses (id, code, name, professor)
values ('cs-3358', 'CS 3358', 'Data Structures', 'Professor Seaman')
on conflict (id) do nothing;

commit;

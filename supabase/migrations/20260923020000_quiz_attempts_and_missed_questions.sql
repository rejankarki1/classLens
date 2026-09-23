begin;

-- Session K: persists a generated quiz as an immutable snapshot (so review
-- stays correct even if the notebook is edited afterward), plus one row per
-- question the student answered incorrectly, retaining its source citation.
-- Neither table is read by generate-quiz itself, which stays stateless.
create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lecture_id text not null references public.lectures(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  questions jsonb not null check (jsonb_typeof(questions) = 'array'),
  created_at timestamptz not null default now()
);

create index quiz_attempts_owner_idx on public.quiz_attempts (owner_id, created_at desc);
create index quiz_attempts_lecture_idx on public.quiz_attempts (lecture_id);

alter table public.quiz_attempts enable row level security;
revoke all privileges on table public.quiz_attempts from public, anon, authenticated;

grant select, insert on table public.quiz_attempts to authenticated;

create policy "Users read their own quiz attempts"
  on public.quiz_attempts for select to authenticated
  using (owner_id = auth.uid());

create policy "Users create their own quiz attempts"
  on public.quiz_attempts for insert to authenticated
  with check (owner_id = auth.uid());

-- One row per missed question per attempt; retaking the same question wrong
-- again updates this row in place rather than accumulating duplicates.
create table public.quiz_missed_questions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  quiz_attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  question_index smallint not null check (question_index between 0 and 4),
  question text not null check (length(btrim(question)) > 0),
  options text[] not null check (array_length(options, 1) = 4),
  correct_answer text not null check (length(btrim(correct_answer)) > 0),
  selected_answer text not null check (length(btrim(selected_answer)) > 0),
  explanation text not null check (length(btrim(explanation)) > 0),
  cited_pages smallint[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (owner_id, quiz_attempt_id, question_index)
);

create index quiz_missed_questions_owner_idx on public.quiz_missed_questions (owner_id, created_at desc);

alter table public.quiz_missed_questions enable row level security;
revoke all privileges on table public.quiz_missed_questions from public, anon, authenticated;

grant select, insert on table public.quiz_missed_questions to authenticated;
-- selected_answer is the only field a retake legitimately changes; every
-- other column describes the question itself as first recorded.
grant update (selected_answer) on table public.quiz_missed_questions to authenticated;

create policy "Users read their own missed questions"
  on public.quiz_missed_questions for select to authenticated
  using (owner_id = auth.uid());

create policy "Users record their own missed questions"
  on public.quiz_missed_questions for insert to authenticated
  with check (owner_id = auth.uid());

create policy "Users update their own missed questions"
  on public.quiz_missed_questions for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Defense-in-depth: a missed-question row must reference an attempt owned by
-- the same user, mirroring notebook_corrections' validate-before-write style.
create or replace function public.validate_quiz_missed_question()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.quiz_attempts attempt
    where attempt.id = new.quiz_attempt_id and attempt.owner_id = new.owner_id
  ) then
    raise exception 'A missed question requires a quiz attempt you own.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger validate_quiz_missed_question_before_write
before insert or update on public.quiz_missed_questions
for each row execute function public.validate_quiz_missed_question();

commit;

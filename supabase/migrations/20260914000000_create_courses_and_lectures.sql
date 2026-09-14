begin;

create table public.courses (
  id text primary key,
  code text not null,
  name text not null,
  professor text not null,
  created_at timestamptz not null default now()
);

create table public.lectures (
  id text primary key,
  course_id text not null,
  title text not null,
  lecture_date date,
  summary text not null default '',
  key_concepts text[] not null default '{}',
  important_points text[] not null default '{}',
  assignments text[] not null default '{}',
  exam_mentions text[] not null default '{}',
  created_at timestamptz not null default now(),

  constraint lectures_course_id_fkey
    foreign key (course_id)
    references public.courses(id)
    on delete restrict
);

create index lectures_course_id_idx
  on public.lectures(course_id);

-- Keep client access closed until policies are defined in a later step.
alter table public.courses enable row level security;
alter table public.lectures enable row level security;

commit;

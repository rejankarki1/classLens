begin;

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  lecture_id text references public.lectures(id) on delete restrict,
  type text not null
    check (type in ('photo', 'audio', 'pdf', 'video')),
  storage_path text not null unique
    check (length(btrim(storage_path)) > 0),
  extracted_text text,
  created_at timestamptz not null default now()
);

create index materials_lecture_id_idx
  on public.materials(lecture_id);

alter table public.materials enable row level security;

-- Shared, non-sensitive hackathon demo; these policies do not isolate users.
revoke all privileges on table public.materials
  from public, anon, authenticated;

grant usage on schema public to anon;
grant select on table public.materials to anon;
grant insert (id, type, storage_path) on public.materials to anon;
grant update (lecture_id) on public.materials to anon;

create policy "Demo clients can read materials"
  on public.materials for select to anon
  using (true);

create policy "Demo clients can stage photos"
  on public.materials for insert to anon
  with check (
    lecture_id is null
    and extracted_text is null
    and type = 'photo'
  );

-- Only staged rows can be attached. Already attached rows cannot be reassigned.
create policy "Demo clients can attach staged materials"
  on public.materials for update to anon
  using (lecture_id is null)
  with check (lecture_id is not null);

commit;

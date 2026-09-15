begin;

-- Every existing policy and grant targets anon only. Supabase switches to the
-- authenticated role once a user signs in, so without this migration signing in
-- removes all access to courses, materials and Storage and the capture flow
-- stops working. This mirrors the existing anon rules for authenticated users.
--
-- Purely additive: no anon policy is dropped or altered, so existing demo data
-- and any anonymous client keep working exactly as before.
-- Lectures are handled separately in the lecture-ownership migration.

grant usage on schema public to authenticated;

-- Courses: same reads, and the same user-confirmed creation rule.
grant select on table public.courses to authenticated;
grant insert (id, code, name, professor) on public.courses to authenticated;

create policy "Authenticated clients can read courses"
  on public.courses for select to authenticated
  using (true);

create policy "Authenticated clients can create courses"
  on public.courses for insert to authenticated
  with check (
    length(btrim(code)) > 0
    and length(btrim(name)) > 0
  );

-- Materials: reads stay open for this shared demo, matching the anon rules.
-- Staged rows must stay readable before they are attached to a lecture.
grant select on table public.materials to authenticated;
grant insert (id, type, storage_path) on public.materials to authenticated;
grant update (lecture_id) on public.materials to authenticated;

create policy "Authenticated clients can read materials"
  on public.materials for select to authenticated
  using (true);

create policy "Authenticated clients can stage photos"
  on public.materials for insert to authenticated
  with check (
    lecture_id is null
    and extracted_text is null
    and type = 'photo'
  );

create policy "Authenticated clients can attach staged materials"
  on public.materials for update to authenticated
  using (lecture_id is null)
  with check (lecture_id is not null);

-- Storage: same bucket and path rules the anon policies already enforce.
create policy "Authenticated clients can upload photo objects"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'lecture-materials'
    and name ~ '^materials/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/photo\.(jpg|png|webp|heic|heif)$'
  );

create policy "Authenticated clients can read photo objects"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'lecture-materials'
    and name ~ '^materials/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/photo\.(jpg|png|webp|heic|heif)$'
  );

create policy "Authenticated clients can remove orphan photo objects"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'lecture-materials'
    and name ~ '^materials/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/photo\.(jpg|png|webp|heic|heif)$'
    and not exists (
      select 1 from public.materials as material
      where material.storage_path = storage.objects.name
    )
  );

commit;

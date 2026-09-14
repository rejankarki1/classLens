begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lecture-materials',
  'lecture-materials',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
);

-- Shared demo access only; no per-user ownership exists without authentication.
create policy "Demo clients can upload photo objects"
  on storage.objects for insert to anon
  with check (
    bucket_id = 'lecture-materials'
    and name ~ '^materials/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/photo\.(jpg|png|webp|heic|heif)$'
  );

create policy "Demo clients can read photo objects"
  on storage.objects for select to anon
  using (
    bucket_id = 'lecture-materials'
    and name ~ '^materials/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/photo\.(jpg|png|webp|heic|heif)$'
  );

-- Cleanup can delete only unregistered objects, never objects referenced by rows.
-- Any anon client can delete an unregistered object; this is a demo tradeoff.
create policy "Demo clients can remove orphan photo objects"
  on storage.objects for delete to anon
  using (
    bucket_id = 'lecture-materials'
    and name ~ '^materials/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/photo\.(jpg|png|webp|heic|heif)$'
    and not exists (
      select 1 from public.materials as material
      where material.storage_path = storage.objects.name
    )
  );

-- No UPDATE policy: clients cannot overwrite existing objects.
commit;

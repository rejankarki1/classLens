import type { Material, MaterialUploadInput } from '@/types';
import { getDataMode } from '@/lib/dataMode';

const bucketName = 'lecture-materials';
const maxPhotoBytes = 10 * 1024 * 1024;
const extensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};
const materialColumns = 'id, lecture_id, type, storage_path, extracted_text';
type MaterialRow = {
  id: string;
  lecture_id: string | null;
  type: Material['type'];
  storage_path: string;
  extracted_text: string | null;
};

function mapMaterial(row: MaterialRow): Material {
  return {
    id: row.id,
    lectureId: row.lecture_id,
    type: row.type,
    filePath: row.storage_path,
    ...(row.extracted_text === null ? {} : { extractedText: row.extracted_text }),
  };
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed.';
}

export async function uploadMaterial(input: MaterialUploadInput): Promise<Material> {
  if (getDataMode() !== 'supabase') {
    throw new Error('Photo upload requires EXPO_PUBLIC_DATA_MODE=supabase. Mock uploads are not implemented.');
  }
  if (input.type !== 'photo') throw new Error('Only photo uploads are supported.');
  const mimeType = input.mimeType.trim().toLowerCase();
  const extension = Object.hasOwn(extensions, mimeType) ? extensions[mimeType] : undefined;
  if (!extension) throw new Error('Unsupported photo format. Use JPEG, PNG, WebP, HEIC, or HEIF.');
  if (!input.uri.startsWith('file://')) throw new Error('Photo upload requires a local file:// URI.');

  const { File } = await import('expo-file-system');
  let bytes: ArrayBuffer;
  try {
    const file = new File(input.uri);
    if (!file.exists) throw new Error('Selected photo no longer exists. Please select it again.');
    if (file.size <= 0) throw new Error('Selected photo is empty.');
    if (file.size > maxPhotoBytes) throw new Error('Photo must be 10 MiB or smaller.');
    bytes = await file.arrayBuffer();
    if (bytes.byteLength === 0) throw new Error('Selected photo is empty.');
    if (bytes.byteLength > maxPhotoBytes) throw new Error('Photo must be 10 MiB or smaller.');
  } catch (error) {
    throw new Error(`Could not read photo: ${reason(error)}`);
  }

  const { randomUUID } = await import('expo-crypto');
  const { supabase } = await import('@/lib/supabase');
  const id = randomUUID();
  const storagePath = `materials/${id}/photo.${extension}`;
  const bucket = supabase.storage.from(bucketName);
  try {
    const { error } = await bucket.upload(storagePath, bytes, { contentType: mimeType, upsert: false });
    if (error) throw new Error(error.message);
  } catch (error) {
    // Never create a metadata row when Storage reports failure.
    throw new Error(`Photo upload failed: ${reason(error)}`);
  }

  let insertFailure: string;
  try {
    // Column grants permit only these fields. Both nullable fields default to null.
    const { data, error } = await supabase.from('materials')
      .insert({ id, type: 'photo', storage_path: storagePath })
      .select(materialColumns).returns<MaterialRow[]>().single();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('No material row was returned.');
    return mapMaterial(data);
  } catch (error) {
    insertFailure = reason(error);
  }

  // A lost insert response is not proof that the database transaction failed.
  try {
    const { data, error } = await supabase.from('materials')
      .select(materialColumns).eq('id', id).eq('storage_path', storagePath)
      .returns<MaterialRow[]>().maybeSingle();
    if (!error && data) return mapMaterial(data);
  } catch {
    // Still attempt cleanup; the Storage policy protects any registered object.
  }

  let cleanupResult: string;
  try {
    const { data, error } = await bucket.remove([storagePath]);
    if (error) cleanupResult = `Cleanup failed: ${error.message}`;
    else if (!data?.length) cleanupResult = 'Cleanup did not confirm removal; the object may be registered or require manual cleanup.';
    else cleanupResult = 'Uploaded object was removed.';
  } catch (error) {
    cleanupResult = `Cleanup failed: ${reason(error)}`;
  }
  throw new Error(`Could not register uploaded photo: ${insertFailure} ${cleanupResult}`);
}

/** Conditionally attach once; never overwrite an existing lecture association. */
export async function attachMaterialToLecture(
  materialId: string,
  lectureId: string,
): Promise<Material> {
  if (getDataMode() !== 'supabase') throw new Error('Material attachment requires EXPO_PUBLIC_DATA_MODE=supabase.');
  if (!materialId.trim() || !lectureId.trim()) throw new Error('Material and lecture IDs are required.');
  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase.from('materials')
    .update({ lecture_id: lectureId }).eq('id', materialId).is('lecture_id', null)
    .select(materialColumns).returns<MaterialRow[]>().maybeSingle();
  if (error) throw new Error(`Could not attach material: ${error.message}`);
  if (data) return mapMaterial(data);
  const { data: existing, error: readError } = await supabase.from('materials')
    .select(materialColumns).eq('id', materialId).returns<MaterialRow[]>().maybeSingle();
  if (readError) throw new Error(`Could not verify material attachment: ${readError.message}`);
  if (!existing) throw new Error('Material not found.');
  if (existing.lecture_id !== null) throw new Error('Material is already attached to a lecture.');
  throw new Error('Material was not attached. Check lecture existence and database permissions.');
}

/** Original captures attached to a lecture, oldest first. */
export async function getMaterials(lectureId: string): Promise<Material[]> {
  // Mock mode has no uploads, so a lecture there never has originals.
  if (getDataMode() !== 'supabase' || !lectureId.trim()) return [];
  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase.from('materials')
    .select(materialColumns).eq('lecture_id', lectureId)
    .order('created_at').order('id').returns<MaterialRow[]>();
  if (error) throw new Error(`Could not load materials: ${error.message}`);
  return data.map(mapMaterial);
}

/**
 * Short-lived signed URL for a private original. Never persisted: the bucket
 * stays private and the link expires. Returns null so one unreadable object
 * degrades to a placeholder instead of failing the whole lecture screen.
 */
export async function getMaterialUrl(material: Material, expiresInSeconds = 3600): Promise<string | null> {
  if (getDataMode() !== 'supabase' || !material.filePath.trim()) return null;
  try {
    const { supabase } = await import('@/lib/supabase');
    const { data, error } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(material.filePath, expiresInSeconds);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/** Copy actual photo objects using existing staged-material grants. Deterministic
 * IDs let retries finish a partial copy without inserting another notebook/photo. */
export async function copyLectureMaterials(sourceId: string, targetId: string): Promise<void> {
  const originals = await getMaterials(sourceId);
  if (originals.some((material) => material.type !== 'photo')) {
    throw new Error('Only photo material copies are supported.');
  }
  const { supabase } = await import('@/lib/supabase');
  const { digestStringAsync, CryptoDigestAlgorithm } = await import('expo-crypto');
  const bucket = supabase.storage.from(bucketName);
  for (const original of originals) {
    const hash = await digestStringAsync(CryptoDigestAlgorithm.SHA256, `${targetId}:${original.id}`);
    const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    const extension = original.filePath.split('.').pop();
    if (!extension || !Object.values(extensions).includes(extension)) throw new Error('Unsupported source photo format.');
    const storagePath = `materials/${id}/photo.${extension}`;
    const read = () => supabase.from('materials').select(materialColumns).eq('id', id)
      .returns<MaterialRow[]>().maybeSingle();
    let { data: row, error: readError } = await read();
    if (readError) throw new Error(`Could not verify copied photo: ${readError.message}`);
    if (!row) {
      const { error: copyError } = await bucket.copy(original.filePath, storagePath);
      if (copyError) {
        // Only an existing, readable destination permits resuming registration.
        const { data: existing, error } = await bucket.download(storagePath);
        if (error || !existing) throw new Error(`Could not copy photo: ${copyError.message}`);
      }
      const { error: insertError } = await supabase.from('materials').insert({ id, type: 'photo', storage_path: storagePath });
      const result = await read();
      row = result.data;
      if (!row) throw new Error(`Could not register copied photo: ${insertError?.message ?? result.error?.message ?? 'Try again.'}`);
    }
    if (row.storage_path !== storagePath || (row.lecture_id !== null && row.lecture_id !== targetId)) {
      throw new Error('Copied material association does not match this notebook.');
    }
    if (row.lecture_id === null) {
      try {
        await attachMaterialToLecture(id, targetId);
      } catch (error) {
        const result = await read();
        if (result.data?.lecture_id !== targetId) throw error;
      }
    }
  }
}

import type { Material, MaterialUploadInput } from '@/types';

export async function uploadMaterial(_file: MaterialUploadInput): Promise<Material> {
  throw new Error('Not implemented: material upload will use Supabase Storage.');
}

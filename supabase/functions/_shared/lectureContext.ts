import { Failure, loadPhoto, base64 } from './ai.ts';
const columns = 'id,title,summary,key_concepts,important_points,assignments,exam_mentions';

export async function loadLectureContext(origin: string, headers: Record<string, string>, lectureId: string,
  signal: AbortSignal, fetcher: typeof fetch, photoLimitMessage = 'Lecture context supports up to three photos.') {
      const lectureQuery = new URLSearchParams({ id: `eq.${lectureId}`, select: columns, limit: '1' });
      const lectureResponse = await fetcher(`${origin}/rest/v1/lectures?${lectureQuery}`, { headers, signal: signal });
      if (!lectureResponse.ok) throw new Failure(502, 'DATABASE', 'Could not read lecture.');
      const lectures = await lectureResponse.json();
      if (!Array.isArray(lectures)) throw new Failure(502, 'DATABASE', 'Invalid lecture data.');
      if (!lectures.length) throw new Failure(404, 'NOT_FOUND', 'Lecture not found.');
      const lecture = lectures[0];
      const materialQuery = new URLSearchParams({ lecture_id: `eq.${lectureId}`, type: 'eq.photo', select: 'id,storage_path', order: 'id', limit: '4' });
      const materialResponse = await fetcher(`${origin}/rest/v1/materials?${materialQuery}`, { headers, signal: signal });
      if (!materialResponse.ok) throw new Failure(502, 'DATABASE', 'Could not read lecture materials.');
      const materials = await materialResponse.json();
      if (!Array.isArray(materials)) throw new Failure(502, 'DATABASE', 'Invalid lecture materials.');
      if (materials.length > 3) throw new Failure(413, 'CONTEXT_LIMIT', photoLimitMessage);
      const photos: unknown[] = [];
      let remaining = 10 * 1024 * 1024;
      for (const material of materials) {
        const { mime, image } = await loadPhoto(origin, headers, material.id, material.storage_path, signal, fetcher, remaining);
        remaining -= image.byteLength;
        photos.push({ inlineData: { mimeType: mime, data: base64(image) } });
      }
  return { lecture, photos };
}

import { Failure, loadPhoto, base64 } from './ai.ts';
import { parseCaptureAnalysis } from '../../../src/lib/captureAnalysis.ts';

const lectureColumns = 'id,title,summary,key_concepts,important_points,assignments,exam_mentions';
const notebookLectureColumns = `${lectureColumns},capture_analysis_id`;

type LectureFields = {
  id: string; title: string; summary: string;
  key_concepts: string[]; important_points: string[]; assignments: string[]; exam_mentions: string[];
};

export async function loadLectureContext(origin: string, headers: Record<string, string>, lectureId: string,
  signal: AbortSignal, fetcher: typeof fetch, photoLimitMessage = 'Lecture context supports up to three photos.') {
      const lectureQuery = new URLSearchParams({ id: `eq.${lectureId}`, select: lectureColumns, limit: '1' });
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

export type NotebookPage = {
  pageNumber: number;
  text: string;
  readability: 'clear' | 'partial' | 'unreadable';
  unclearSections: string[];
};

/**
 * Session J: grounds Ask/Quiz in stored notebook text only -- never original
 * Storage photos -- so answers stay correct after the 7-day original-photo
 * cleanup sweep. The caller must forward the requesting user's real
 * Authorization header (not just the publishable apikey) so RLS on
 * capture_analyses/notebook_corrections resolves auth.uid() to the real
 * owner; lectures/materials' anon demo policies are what let the *old*
 * loadLectureContext above work without it, but capture_analyses and
 * notebook_corrections have no anon policy at all.
 */
export async function loadNotebookContext(origin: string, headers: Record<string, string>, lectureId: string,
  signal: AbortSignal, fetcher: typeof fetch): Promise<{ lecture: LectureFields; pages: NotebookPage[] }> {
  const lectureQuery = new URLSearchParams({ id: `eq.${lectureId}`, select: notebookLectureColumns, limit: '1' });
  const lectureResponse = await fetcher(`${origin}/rest/v1/lectures?${lectureQuery}`, { headers, signal });
  if (!lectureResponse.ok) throw new Failure(502, 'DATABASE', 'Could not read lecture.');
  const lectures = await lectureResponse.json();
  if (!Array.isArray(lectures)) throw new Failure(502, 'DATABASE', 'Invalid lecture data.');
  if (!lectures.length) throw new Failure(404, 'NOT_FOUND', 'Lecture not found.');
  const row = lectures[0] as LectureFields & { capture_analysis_id: string | null };
  const lecture: LectureFields = {
    id: row.id, title: row.title, summary: row.summary,
    key_concepts: row.key_concepts, important_points: row.important_points,
    assignments: row.assignments, exam_mentions: row.exam_mentions,
  };

  if (!row.capture_analysis_id) return { lecture, pages: [] };

  const analysisQuery = new URLSearchParams({ id: `eq.${row.capture_analysis_id}`, select: 'analysis', limit: '1' });
  const analysisResponse = await fetcher(`${origin}/rest/v1/capture_analyses?${analysisQuery}`, { headers, signal });
  if (!analysisResponse.ok) throw new Failure(502, 'DATABASE', 'Could not read the saved notebook analysis.');
  const analysisRows = await analysisResponse.json();
  if (!Array.isArray(analysisRows) || !analysisRows.length) throw new Failure(502, 'DATABASE', 'Saved notebook analysis is missing.');
  const analysis = parseCaptureAnalysis(analysisRows[0].analysis);

  const correctionsQuery = new URLSearchParams({ lecture_id: `eq.${lectureId}`, select: 'page_number,corrected_text' });
  const correctionsResponse = await fetcher(`${origin}/rest/v1/notebook_corrections?${correctionsQuery}`, { headers, signal });
  if (!correctionsResponse.ok) throw new Failure(502, 'DATABASE', 'Could not read saved notebook corrections.');
  const correctionRows = await correctionsResponse.json();
  if (!Array.isArray(correctionRows)) throw new Failure(502, 'DATABASE', 'Invalid saved notebook corrections.');
  const correctionByPage = new Map<number, string>(
    correctionRows.map((row: { page_number: number; corrected_text: string }) => [row.page_number, row.corrected_text]),
  );

  const pages: NotebookPage[] = analysis.photos.map((photo) => ({
    pageNumber: photo.pageNumber,
    text: correctionByPage.get(photo.pageNumber) ?? photo.faithfulExtraction,
    readability: photo.readability,
    unclearSections: photo.unclearSections,
  }));

  return { lecture, pages };
}

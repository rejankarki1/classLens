import type { CaptureAnalysis, CapturePhotoAnalysis } from '../features/capture/types.ts';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}.`);
  return value as Record<string, unknown>;
}

function requiredString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid capture analysis field: ${key}.`);
  return value.trim();
}

function strings(row: Record<string, unknown>, key: string): string[] {
  const value = row[key];
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string')) {
    throw new Error(`Invalid capture analysis field: ${key}.`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function parsePhoto(value: unknown): CapturePhotoAnalysis {
  const row = record(value, 'capture photo analysis');
  const captureId = requiredString(row, 'captureId').toLowerCase();
  if (!uuid.test(captureId)) throw new Error('Invalid capture analysis field: captureId.');
  if (!Number.isInteger(row.pageNumber) || (row.pageNumber as number) < 1 || (row.pageNumber as number) > 6) {
    throw new Error('Invalid capture analysis field: pageNumber.');
  }
  if (row.readability !== 'clear' && row.readability !== 'partial' && row.readability !== 'unreadable') {
    throw new Error('Invalid capture analysis field: readability.');
  }
  if (typeof row.faithfulExtraction !== 'string') {
    throw new Error('Invalid capture analysis field: faithfulExtraction.');
  }
  return {
    captureId,
    pageNumber: row.pageNumber as number,
    readability: row.readability,
    faithfulExtraction: row.faithfulExtraction.trim(),
    unclearSections: strings(row, 'unclearSections'),
  };
}

/** Validate untrusted Gemini/database JSON at both Edge and mobile boundaries. */
export function parseCaptureAnalysis(value: unknown, expectedCaptureIds?: string[]): CaptureAnalysis {
  const row = record(value, 'capture analysis');
  const sessionId = requiredString(row, 'sessionId');
  if (!Array.isArray(row.photos) || row.photos.length < 1 || row.photos.length > 6) {
    throw new Error('Invalid capture analysis field: photos.');
  }
  const photos = row.photos.map(parsePhoto).sort((a, b) => a.pageNumber - b.pageNumber);
  const ids = photos.map((photo) => photo.captureId);
  if (new Set(ids).size !== ids.length || new Set(photos.map((photo) => photo.pageNumber)).size !== photos.length) {
    throw new Error('Capture analysis contains duplicate photos.');
  }
  if (expectedCaptureIds) {
    const expected = expectedCaptureIds.map((id) => id.toLowerCase());
    if (expected.length !== ids.length || expected.some((id, index) => id !== ids[index])) {
      throw new Error('Capture analysis does not include every requested photo in order.');
    }
  }
  return {
    sessionId,
    photos,
    combinedSummary: requiredString(row, 'combinedSummary'),
    concepts: strings(row, 'concepts'),
    examples: strings(row, 'examples'),
    assignments: strings(row, 'assignments'),
    examMentions: strings(row, 'examMentions'),
    courseSignals: strings(row, 'courseSignals'),
    topicSignals: strings(row, 'topicSignals'),
  };
}

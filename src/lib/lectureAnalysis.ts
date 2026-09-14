import type { LectureAnalysis } from '../features/lectures/types.ts';

/** Validate untrusted JSON at both the Edge and mobile service boundaries. */
export function parseLectureAnalysis(value: unknown): LectureAnalysis {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid lecture analysis.');
  const row = value as Record<string, unknown>;
  const requiredString = (key: string): string => {
    const value = row[key];
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid analysis field: ${key}.`);
    return value.trim();
  };
  const strings = (key: string): string[] => {
    const value = row[key];
    if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string')) {
      throw new Error(`Invalid analysis field: ${key}.`);
    }
    return value.map(item => item.trim()).filter(Boolean);
  };
  if (row.suggestedCourse !== null && typeof row.suggestedCourse !== 'string') {
    throw new Error('Invalid analysis field: suggestedCourse.');
  }
  return {
    suggestedCourse: row.suggestedCourse === null ? null : row.suggestedCourse.trim() || null,
    title: requiredString('title'), topic: requiredString('topic'), summary: requiredString('summary'),
    keyConcepts: strings('keyConcepts'), importantPoints: strings('importantPoints'),
    assignments: strings('assignments'), examMentions: strings('examMentions'),
  };
}

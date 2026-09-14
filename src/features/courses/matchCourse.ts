import type { Course } from '@/types';

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Resolve the analysis label `suggestedCourse` to a saved Course.
 * The label is free text from Gemini, never a course ID, so an unmatched or
 * ambiguous label returns null and the student picks the course instead.
 * This never creates a course.
 */
export function matchCourse(suggestedCourse: string | null, courses: Course[]): Course | null {
  if (!suggestedCourse) return null;
  const target = normalize(suggestedCourse);
  if (!target) return null;

  const exact = courses.find((course) =>
    [course.id, course.code, course.name].some((field) => {
      const candidate = normalize(field);
      return candidate.length > 0 && candidate === target;
    }));
  if (exact) return exact;

  // A label like "CS 3358 - Data Structures" still identifies one course.
  const contained = courses.filter((course) =>
    [course.id, course.code, course.name].some((field) => {
      const candidate = normalize(field);
      return candidate.length > 0 && target.includes(candidate);
    }));
  return contained.length === 1 ? contained[0] : null;
}

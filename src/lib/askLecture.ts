import type { AskLectureResult } from '../types/askLecture.ts';

export function parseAskLectureInput(lectureId: unknown, question: unknown) {
  if (typeof lectureId !== 'string' || !lectureId.trim()) throw new Error('Lecture ID is required.');
  if (typeof question !== 'string' || !question.trim()) throw new Error('Question is required.');
  if (question.trim().length > 2000) throw new Error('Question must be 2,000 characters or fewer.');
  return { lectureId: lectureId.trim(), question: question.trim() };
}

export function parseAskLectureResult(value: unknown): AskLectureResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid lecture answer.');
  const answer = (value as Record<string, unknown>).answer;
  if (typeof answer !== 'string' || !answer.trim()) throw new Error('Invalid lecture answer.');
  return { answer: answer.trim() };
}

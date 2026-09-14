import type { GenerateQuizResult } from '../types/quiz.ts';

export function parseQuizInput(lectureId: unknown): { lectureId: string } {
  if (typeof lectureId !== 'string' || !lectureId.trim()) throw new Error('Lecture ID is required.');
  return { lectureId: lectureId.trim() };
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid quiz object.');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Quiz text must be nonempty.');
  return value.trim();
}
export function parseQuizResult(value: unknown): GenerateQuizResult {
  const row = record(value);
  const title = text(row.title);
  if (!Array.isArray(row.questions) || row.questions.length !== 5) throw new Error('Quiz must contain exactly five questions.');
  const questions = row.questions.map(value => {
    const q = record(value);
    if (!Array.isArray(q.options) || q.options.length !== 4) throw new Error('Each question must have four options.');
    const options = q.options.map(text);
    if (new Set(options).size !== 4) throw new Error('Quiz options must be distinct.');
    const correctAnswer = text(q.correctAnswer);
    if (!options.includes(correctAnswer)) throw new Error('Correct answer must match an option.');
    return { question: text(q.question), options, correctAnswer, explanation: text(q.explanation) };
  });
  if (new Set(questions.map(q => q.question)).size !== 5) throw new Error('Quiz questions must be distinct.');
  return { title, questions };
}

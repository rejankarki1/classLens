import type { LectureAnalysis, Material, Quiz } from '@/types';

export async function analyzeMaterial(_material: Material): Promise<LectureAnalysis> {
  throw new Error('Not implemented: material analysis is not connected.');
}

export async function askLecture(_lectureId: string, _question: string): Promise<string> {
  throw new Error('Not implemented: Ask This Lecture is not connected.');
}

export async function generateQuiz(_lectureId: string): Promise<Quiz> {
  throw new Error('Not implemented: quiz generation is not connected.');
}

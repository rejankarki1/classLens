import { parseQuizInput, parseQuizResult } from '@/lib/quiz';
import { parseAskLectureInput, parseAskLectureResult } from '@/lib/askLecture';
import type { LectureAnalysis, Material, GenerateQuizResult, AskLectureResult } from '@/types';

import { getDataMode } from '@/lib/dataMode';
import { parseLectureAnalysis } from '@/lib/lectureAnalysis';

export async function analyzeMaterial(material: Material): Promise<LectureAnalysis> {
  if (getDataMode() !== 'supabase') throw new Error('Analysis requires EXPO_PUBLIC_DATA_MODE=supabase.');
  if (material.type !== 'photo') throw new Error('Only photos can be analyzed.');
  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase.functions.invoke('analyze-material', { body: { materialId: material.id } });
  if (error) {
    let message = 'Photo analysis failed. Check your connection and function deployment.';
    if (error.context instanceof Response) {
      try {
        const body = await error.context.json();
        if (typeof body?.error?.message === 'string') message = body.error.message;
      } catch { /* Keep a useful message for non-JSON gateway errors. */ }
    }
    throw new Error(message);
  }
  return parseLectureAnalysis(data);
}

export async function askLecture(lectureId: string, question: string): Promise<AskLectureResult> {
  const body = parseAskLectureInput(lectureId, question);
  if (getDataMode() !== 'supabase') throw new Error('Lecture Q&A requires EXPO_PUBLIC_DATA_MODE=supabase.');
  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase.functions.invoke('ask-lecture', { body });
  if (error) {
    let message = 'Lecture Q&A failed. Check your connection and function deployment.';
    if (error.context instanceof Response) {
      try {
        const result = await error.context.json();
        if (typeof result?.error?.message === 'string') message = result.error.message;
      } catch { /* Preserve a useful message for gateway failures. */ }
    }
    throw new Error(message);
  }
  return parseAskLectureResult(data);
}

export async function generateQuiz(lectureId: string): Promise<GenerateQuizResult> {
  const body = parseQuizInput(lectureId);
  if (getDataMode() !== 'supabase') throw new Error('Quiz generation requires EXPO_PUBLIC_DATA_MODE=supabase.');
  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase.functions.invoke('generate-quiz', { body });
  if (error) {
    let message = 'Quiz generation failed. Check your connection and function deployment.';
    if (error.context instanceof Response) {
      try {
        const result = await error.context.json();
        if (typeof result?.error?.message === 'string') message = result.error.message;
      } catch { /* Keep a useful message for gateway failures. */ }
    }
    throw new Error(message);
  }
  return parseQuizResult(data);
}

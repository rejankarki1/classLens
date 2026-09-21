import { FunctionsHttpError } from '@supabase/supabase-js';

import { parseQuizInput, parseQuizResult } from '@/lib/quiz';
import { parseAskLectureInput, parseAskLectureResult } from '@/lib/askLecture';
import type { CaptureAnalysis, LectureAnalysis, Material, GenerateQuizResult, AskLectureResult } from '@/types';

import { getDataMode } from '@/lib/dataMode';
import { parseLectureAnalysis } from '@/lib/lectureAnalysis';
import { parseCaptureAnalysis } from '@/lib/captureAnalysis';

type StructuredFunctionError = { code: string; message: string };

function parseStructuredFunctionError(value: unknown): StructuredFunctionError | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const candidate = body.error && typeof body.error === 'object' && !Array.isArray(body.error)
    ? body.error as Record<string, unknown>
    : body;
  if (typeof candidate.code !== 'string' || typeof candidate.message !== 'string') return null;
  const code = candidate.code.trim();
  const message = candidate.message.replace(/\s+/g, ' ').trim();
  if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(code) || !message || message.length > 500) return null;
  return { code, message };
}

async function captureFunctionError(error: unknown): Promise<Error> {
  const fallback = 'Combined lecture analysis failed. Please try again.';
  if (!(error instanceof FunctionsHttpError)) return new Error(fallback);

  const context = error.context as {
    status?: unknown;
    clone?: () => { json?: () => Promise<unknown> };
    json?: () => Promise<unknown>;
  } | null;
  const httpStatus = typeof context?.status === 'number' ? context.status : null;
  let structured: StructuredFunctionError | null = null;
  try {
    const readable = typeof context?.clone === 'function' ? context.clone() : context;
    if (typeof readable?.json === 'function') {
      structured = parseStructuredFunctionError(await readable.json());
    }
  } catch {
    // Non-JSON relay/gateway responses use the friendly fallback below.
  }

  const errorCode = structured?.code ?? 'UNSTRUCTURED_HTTP_ERROR';
  const safeMessage = structured?.message ?? fallback;
  if (__DEV__) console.error({ httpStatus, errorCode, message: safeMessage });
  return new Error(structured ? `${structured.code}: ${structured.message}` : fallback);
}

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

export async function analyzeCaptures(sessionId: string, captureIds: string[]): Promise<CaptureAnalysis> {
  if (getDataMode() !== 'supabase') throw new Error('Capture analysis requires EXPO_PUBLIC_DATA_MODE=supabase.');
  if (!sessionId.trim() || captureIds.length < 1 || captureIds.length > 6) {
    throw new Error('Capture analysis requires one to six photos from a session.');
  }
  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase.functions.invoke('analyze-captures', {
    body: { sessionId, captureIds },
  });
  if (error) throw await captureFunctionError(error);
  const parsed = parseCaptureAnalysis(data, captureIds);
  if (parsed.sessionId !== sessionId) throw new Error('Capture analysis session does not match this lecture.');
  return parsed;
}

export async function getCaptureAnalysis(sessionId: string, captureIds: string[]): Promise<CaptureAnalysis | null> {
  if (getDataMode() !== 'supabase') return null;
  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase.from('capture_analyses')
    .select('analysis').eq('capture_session_id', sessionId)
    .returns<{ analysis: unknown }[]>().maybeSingle();
  if (error) throw new Error(`Could not load saved capture analysis: ${error.message}`);
  if (!data) return null;
  const parsed = parseCaptureAnalysis(data.analysis, captureIds);
  if (parsed.sessionId !== sessionId) throw new Error('Saved analysis session does not match this lecture.');
  return parsed;
}

export async function getLectureCaptureAnalysis(lectureId: string): Promise<CaptureAnalysis | null> {
  if (getDataMode() !== 'supabase') return null;
  const { supabase } = await import('@/lib/supabase');
  const lecture = await supabase.from('lectures').select('capture_session_id, capture_analysis_id')
    .eq('id', lectureId).returns<{ capture_session_id: string | null; capture_analysis_id: string | null }[]>().maybeSingle();
  if (lecture.error) throw new Error(`Could not load lecture analysis link: ${lecture.error.message}`);
  if (!lecture.data?.capture_session_id || !lecture.data.capture_analysis_id) return null;
  const captures = await supabase.from('captures').select('id, page_number').eq('lecture_id', lectureId)
    .order('page_number').returns<{ id: string; page_number: number }[]>();
  if (captures.error) throw new Error(`Could not load lecture capture order: ${captures.error.message}`);
  const analysis = await supabase.from('capture_analyses').select('analysis').eq('id', lecture.data.capture_analysis_id)
    .returns<{ analysis: unknown }[]>().maybeSingle();
  if (analysis.error) throw new Error(`Could not load lecture capture analysis: ${analysis.error.message}`);
  return analysis.data ? parseCaptureAnalysis(analysis.data.analysis, captures.data.map((capture) => capture.id)) : null;
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

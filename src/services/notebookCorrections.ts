import { getDataMode } from '@/lib/dataMode';
import type { NotebookCorrection } from '@/types';

type CorrectionRow = {
  lecture_id: string;
  capture_id: string | null;
  page_number: number;
  original_text: string;
  corrected_text: string;
  updated_at: string;
};

const correctionColumns = 'lecture_id, capture_id, page_number, original_text, corrected_text, updated_at';

function fromRow(row: CorrectionRow): NotebookCorrection {
  return {
    lectureId: row.lecture_id,
    captureId: row.capture_id,
    pageNumber: row.page_number,
    originalText: row.original_text,
    correctedText: row.corrected_text,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

// Mock mode has no capture analysis to correct, but keeps a working in-memory
// store so the correction editor is exercisable without Supabase mode.
const mockCorrections = new Map<string, NotebookCorrection>();
const mockKey = (lectureId: string, pageNumber: number) => `${lectureId}:${pageNumber}`;

export async function getNotebookCorrections(lectureId: string): Promise<NotebookCorrection[]> {
  if (getDataMode() === 'mock') {
    return Array.from(mockCorrections.values())
      .filter((correction) => correction.lectureId === lectureId)
      .sort((a, b) => a.pageNumber - b.pageNumber);
  }

  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase
    .from('notebook_corrections')
    .select(correctionColumns)
    .eq('lecture_id', lectureId)
    .order('page_number')
    .returns<CorrectionRow[]>();

  if (error) throw new Error(`Could not load notebook corrections: ${error.message}`);
  return data.map(fromRow);
}

export type SaveNotebookCorrectionInput = {
  lectureId: string;
  captureId: string | null;
  pageNumber: number;
  /** The faithful extraction as it currently reads, used only the first time this page is corrected. */
  originalText: string;
  correctedText: string;
};

/**
 * Tap-to-edit save, tied to one notebook page. The first save on a page fixes
 * originalText as a permanent record of what Gemini produced; every later edit
 * to the same page only replaces correctedText.
 */
export async function saveNotebookCorrection(input: SaveNotebookCorrectionInput): Promise<NotebookCorrection> {
  const correctedText = input.correctedText.trim();
  if (!correctedText) throw new Error('A correction cannot be empty.');

  if (getDataMode() === 'mock') {
    const key = mockKey(input.lectureId, input.pageNumber);
    const existing = mockCorrections.get(key);
    const saved: NotebookCorrection = {
      lectureId: input.lectureId,
      captureId: input.captureId,
      pageNumber: input.pageNumber,
      originalText: existing?.originalText ?? input.originalText,
      correctedText,
      updatedAt: new Date().toISOString(),
    };
    mockCorrections.set(key, saved);
    return saved;
  }

  const { supabase } = await import('@/lib/supabase');
  const { data: existing, error: existingError } = await supabase
    .from('notebook_corrections')
    .select('id')
    .eq('lecture_id', input.lectureId)
    .eq('page_number', input.pageNumber)
    .returns<{ id: string }[]>()
    .maybeSingle();
  if (existingError) throw new Error(`Could not check for an existing correction: ${existingError.message}`);

  if (existing) {
    const { data, error } = await supabase
      .from('notebook_corrections')
      .update({ corrected_text: correctedText, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select(correctionColumns)
      .returns<CorrectionRow[]>()
      .single();
    if (error) throw new Error(`Could not save the correction: ${error.message}`);
    return fromRow(data);
  }

  const { data, error } = await supabase
    .from('notebook_corrections')
    .insert({
      lecture_id: input.lectureId,
      capture_id: input.captureId,
      page_number: input.pageNumber,
      original_text: input.originalText,
      corrected_text: correctedText,
    })
    .select(correctionColumns)
    .returns<CorrectionRow[]>()
    .single();
  if (error) throw new Error(`Could not save the correction: ${error.message}`);
  return fromRow(data);
}

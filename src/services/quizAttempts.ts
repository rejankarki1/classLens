import { getDataMode } from '@/lib/dataMode';
import type { GenerateQuizResult, MissedQuestion, QuizQuestion } from '@/types';

type MissedQuestionRow = {
  id: string;
  quiz_attempt_id: string;
  question_index: number;
  question: string;
  options: string[];
  correct_answer: string;
  selected_answer: string;
  explanation: string;
  cited_pages: number[];
  created_at: string;
  quiz_attempts: { lecture_id: string; lectures: { title: string } | { title: string }[] | null } | null;
};

const missedQuestionColumns = 'id,quiz_attempt_id,question_index,question,options,correct_answer,selected_answer,explanation,cited_pages,created_at,quiz_attempts(lecture_id,lectures(title))';

function fromRow(row: MissedQuestionRow): MissedQuestion {
  const lecture = row.quiz_attempts?.lectures;
  const lectureTitle = (Array.isArray(lecture) ? lecture[0]?.title : lecture?.title) ?? 'Untitled lecture';
  return {
    id: row.id,
    quizAttemptId: row.quiz_attempt_id,
    lectureId: row.quiz_attempts?.lecture_id ?? '',
    lectureTitle,
    questionIndex: row.question_index,
    question: row.question,
    options: row.options,
    correctAnswer: row.correct_answer,
    selectedAnswer: row.selected_answer,
    explanation: row.explanation,
    citedPages: row.cited_pages,
    createdAt: row.created_at,
  };
}

/** Mock mode has one demo user; attempts/missed questions reset on reload. */
type MockAttempt = { lectureId: string; lectureTitle: string; quiz: GenerateQuizResult };
const mockAttempts = new Map<string, MockAttempt>();
const mockMissed = new Map<string, MissedQuestion>();
let mockAttemptSeq = 0;

/** Immutable snapshot of a generated quiz, so review stays correct even if the notebook is edited later. */
export async function saveQuizAttempt(lectureId: string, quiz: GenerateQuizResult): Promise<{ id: string }> {
  if (getDataMode() === 'mock') {
    const id = `mock-attempt-${++mockAttemptSeq}`;
    mockAttempts.set(id, { lectureId, lectureTitle: 'Mock lecture', quiz });
    return { id };
  }

  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase
    .from('quiz_attempts')
    .insert({ lecture_id: lectureId, title: quiz.title, questions: quiz.questions })
    .select('id')
    .returns<{ id: string }[]>()
    .single();

  if (error) throw new Error(`Could not save this quiz attempt: ${error.message}`);
  return { id: data.id };
}

/**
 * Best-effort: never throws, so a persistence failure can never block quiz-
 * taking. Retaking the same question wrong again updates the same row (only
 * selected_answer changes) rather than accumulating duplicates.
 */
export async function recordMissedQuestion(attemptId: string, index: number, question: QuizQuestion, selectedAnswer: string): Promise<void> {
  if (getDataMode() === 'mock') {
    const attempt = mockAttempts.get(attemptId);
    mockMissed.set(`${attemptId}:${index}`, {
      id: `${attemptId}:${index}`, quizAttemptId: attemptId,
      lectureId: attempt?.lectureId ?? '', lectureTitle: attempt?.lectureTitle ?? 'Untitled lecture',
      questionIndex: index, question: question.question, options: question.options,
      correctAnswer: question.correctAnswer, selectedAnswer, explanation: question.explanation,
      citedPages: question.citedPages, createdAt: new Date().toISOString(),
    });
    return;
  }

  try {
    const { supabase } = await import('@/lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    const ownerId = session?.user.id;
    if (!ownerId) return;

    const { data: existing, error: existingError } = await supabase
      .from('quiz_missed_questions')
      .select('id')
      .eq('quiz_attempt_id', attemptId)
      .eq('question_index', index)
      .returns<{ id: string }[]>()
      .maybeSingle();
    if (existingError) throw existingError;

    if (existing) {
      const { error } = await supabase
        .from('quiz_missed_questions')
        .update({ selected_answer: selectedAnswer })
        .eq('id', existing.id);
      if (error) throw error;
      return;
    }

    const { error } = await supabase.from('quiz_missed_questions').insert({
      owner_id: ownerId, quiz_attempt_id: attemptId, question_index: index,
      question: question.question, options: question.options, correct_answer: question.correctAnswer,
      selected_answer: selectedAnswer, explanation: question.explanation, cited_pages: question.citedPages,
    });
    if (error) throw error;
  } catch {
    // Recording a miss is a nice-to-have, not part of the quiz-taking flow.
  }
}

/** Every missed question the signed-in student has, newest first, source citation intact. */
export async function getMissedQuestions(): Promise<MissedQuestion[]> {
  if (getDataMode() === 'mock') {
    return [...mockMissed.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  }

  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase
    .from('quiz_missed_questions')
    .select(missedQuestionColumns)
    .order('created_at', { ascending: false })
    .returns<MissedQuestionRow[]>();

  if (error) throw new Error(`Could not load your missed questions: ${error.message}`);
  return data.map(fromRow);
}

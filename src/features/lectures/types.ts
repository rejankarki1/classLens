export interface Lecture {
  id: string;
  courseId: string;
  title: string;
  summary: string;
  keyConcepts: string[];
  importantPoints: string[];
  assignments: string[];
  examMentions: string[];
  createdAt: string;
}

export interface LectureAnalysis {
  suggestedCourse: string | null;
  title: string;
  topic: string;
  summary: string;
  keyConcepts: string[];
  importantPoints: string[];
  assignments: string[];
  examMentions: string[];
}

export type CreateLectureInput = Omit<Lecture, 'id' | 'createdAt'>;

/**
 * A student's tap-to-edit fix to one page's faithful extraction. originalText is
 * the AI extraction as it stood the first time this page was corrected -- it never
 * changes afterward, so the notebook can always show what Gemini originally
 * produced next to the student's fix.
 */
export interface NotebookCorrection {
  lectureId: string;
  captureId: string | null;
  pageNumber: number;
  originalText: string;
  correctedText: string;
  updatedAt: string;
}

export interface Quiz {
  lectureId: string;
  questions: {
    prompt: string;
    choices: string[];
    correctAnswerIndex: number;
    explanation: string;
  }[];
}

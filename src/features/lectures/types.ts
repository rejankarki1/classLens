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

export interface Quiz {
  lectureId: string;
  questions: {
    prompt: string;
    choices: string[];
    correctAnswerIndex: number;
    explanation: string;
  }[];
}

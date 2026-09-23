export type QuizQuestion = {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  citedPages: number[];
};
export type GenerateQuizResult = { title: string; questions: QuizQuestion[] };

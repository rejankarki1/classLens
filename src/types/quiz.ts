export type QuizQuestion = {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
};
export type GenerateQuizResult = { title: string; questions: QuizQuestion[] };

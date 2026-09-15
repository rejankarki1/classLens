import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Brand } from '@/constants/theme';
import { askLecture, generateQuiz } from '@/services/ai';
import type { GenerateQuizResult } from '@/types';
import { ThemedText } from './themed-text';
import { AppButton } from './ui/AppButton';

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export function StudyActions({ lectureId }: { lectureId: string }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [quiz, setQuiz] = useState<GenerateQuizResult | null>(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState<'ask' | 'quiz' | null>(null);
  const [error, setError] = useState('');

  /** Replay the questions already in state; never re-requests from Gemini. */
  function restart() {
    setIndex(0);
    setSelected(null);
    setScore(0);
    setFinished(false);
  }

  async function ask() {
    const trimmed = question.trim();
    if (!trimmed || busy) return;
    setBusy('ask');
    setError('');
    setAnswer('');
    try {
      const result = await askLecture(lectureId, trimmed);
      setAnswer(result.answer);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(null);
    }
  }

  /** The only call to generateQuiz: all five questions arrive at once. */
  async function makeQuiz() {
    if (busy) return;
    setBusy('quiz');
    setError('');
    try {
      const result = await generateQuiz(lectureId);
      setQuiz(result);
      restart();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(null);
    }
  }

  function choose(option: string, correctAnswer: string) {
    // Answers lock on first tap, so the score can never be inflated.
    if (selected !== null) return;
    setSelected(option);
    if (option === correctAnswer) setScore((value) => value + 1);
  }

  function advance() {
    if (!quiz || selected === null) return;
    if (index + 1 >= quiz.questions.length) {
      setFinished(true);
      return;
    }
    setIndex((value) => value + 1);
    setSelected(null);
  }

  return <View style={styles.panel}>
    <ThemedText style={styles.label}>✦  GO FROM KNOWING TO UNDERSTANDING</ThemedText>
    <ThemedText style={styles.title}>Make it click.</ThemedText>
    <ThemedText style={styles.body}>Ask the question you didn’t get to ask. Put your understanding to the test.</ThemedText>

    <TextInput
      value={question}
      onChangeText={setQuestion}
      editable={busy !== 'ask'}
      placeholder="Ask anything from this lecture…"
      placeholderTextColor="#9FB3A3"
      accessibilityLabel="Your question about this lecture"
      multiline
      maxLength={2000}
      style={styles.input}
    />
    <AppButton
      title={busy === 'ask' ? 'Asking…' : 'Ask This Lecture  ↗'}
      secondary
      disabled={busy !== null || !question.trim()}
      onPress={ask}
    />

    {busy === 'ask' ? <ActivityIndicator color={Brand.lime} accessibilityLabel="Finding an answer" /> : null}
    {answer ? <View style={styles.answer}>
      <ThemedText style={styles.answerLabel}>ANSWER</ThemedText>
      <ThemedText accessibilityLiveRegion="polite" style={styles.body}>{answer}</ThemedText>
    </View> : null}

    {quiz ? null : <AppButton
      title={busy === 'quiz' ? 'Generating…' : 'Generate Quiz  →'}
      secondary
      disabled={busy !== null}
      onPress={makeQuiz}
    />}
    {busy === 'quiz' ? <ActivityIndicator color={Brand.lime} accessibilityLabel="Generating your quiz" /> : null}

    {quiz && !finished ? (() => {
      const total = quiz.questions.length;
      const item = quiz.questions[index];
      const answered = selected !== null;
      const right = answered && selected === item.correctAnswer;
      const last = index + 1 >= total;

      return <View style={styles.quiz}>
        <ThemedText style={styles.answerLabel}>QUIZ · {quiz.title.toUpperCase()}</ThemedText>

        <View style={styles.track} accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: total, now: index + (answered ? 1 : 0) }}>
          <View style={[styles.fill, { width: `${((index + (answered ? 1 : 0)) / total) * 100}%` }]} />
        </View>
        <ThemedText style={styles.progressLabel}>QUESTION {index + 1} OF {total}</ThemedText>

        <View style={styles.question}>
          <ThemedText accessibilityLiveRegion="polite" style={styles.prompt}>{item.question}</ThemedText>

          {item.options.map((option) => {
            const chosen = selected === option;
            const correct = option === item.correctAnswer;
            return <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityLabel={option}
              accessibilityState={{ selected: chosen, disabled: answered }}
              disabled={answered}
              onPress={() => choose(option, item.correctAnswer)}
              style={({ pressed }) => [
                styles.option,
                answered && correct && styles.correct,
                answered && chosen && !correct && styles.wrong,
                pressed && styles.pressed,
              ]}
            >
              <ThemedText style={styles.body}>{answered && correct ? '✓  ' : answered && chosen ? '✕  ' : ''}{option}</ThemedText>
            </Pressable>;
          })}

          {answered ? <>
            <ThemedText accessibilityLiveRegion="polite"
              style={[styles.verdict, { color: right ? Brand.lime : '#F3C7C7' }]}>
              {right ? 'Correct' : 'Not quite'}
            </ThemedText>
            <ThemedText style={styles.explanation}>{item.explanation}</ThemedText>
          </> : null}
        </View>

        <AppButton
          title={last ? 'See Results  →' : 'Next Question  →'}
          secondary
          disabled={!answered}
          onPress={advance}
        />
      </View>;
    })() : null}

    {quiz && finished ? <View style={styles.quiz}>
      <ThemedText style={styles.answerLabel}>QUIZ COMPLETE</ThemedText>

      <View style={styles.question}>
        <ThemedText accessibilityLiveRegion="polite" style={styles.score}>
          {score} / {quiz.questions.length}
        </ThemedText>

        <ThemedText style={styles.body}>
          {score === quiz.questions.length
            ? 'Every one right. This lecture has landed.'
            : score >= Math.ceil(quiz.questions.length / 2)
              ? 'Solid work. Revisit the ones you missed and it will stick.'
              : 'A good place to start. Read the notebook again, then retake it.'}
        </ThemedText>
      </View>

      <AppButton title="Try Again" secondary onPress={restart} />
      <AppButton title="Back to Notebook" secondary onPress={() => { setQuiz(null); restart(); }} />
    </View> : null}

    {error ? <ThemedText accessibilityLiveRegion="polite" style={styles.error}>{error}</ThemedText> : null}
  </View>;
}

const styles = StyleSheet.create({
  panel: { borderRadius: 24, padding: 24, backgroundColor: Brand.forest, gap: 16 },
  label: { color: Brand.lime, fontSize: 10, lineHeight: 16, letterSpacing: 1 },
  title: { color: '#FFFFFF', fontSize: 32, lineHeight: 40, fontWeight: '500' },
  body: { color: '#DCE7DA', fontWeight: '400' },
  input: {
    minHeight: 56, borderRadius: 16, padding: 16, color: '#FFFFFF',
    backgroundColor: '#1B3B2D', borderWidth: 1, borderColor: '#3D6350',
    fontSize: 16, lineHeight: 24, textAlignVertical: 'top',
  },
  answer: { borderRadius: 16, padding: 16, backgroundColor: '#1B3B2D', gap: 8 },
  answerLabel: { color: Brand.lime, fontSize: 10, lineHeight: 16, letterSpacing: 1 },
  quiz: { gap: 16 },
  track: { height: 4, width: '100%', borderRadius: 4, overflow: 'hidden', backgroundColor: '#58745D' },
  fill: { height: 4, backgroundColor: Brand.lime },
  progressLabel: { color: '#B9CEBF', fontSize: 12, lineHeight: 16, letterSpacing: 1 },
  question: { gap: 8, borderRadius: 16, padding: 16, backgroundColor: '#1B3B2D' },
  verdict: { fontWeight: '700', lineHeight: 24, paddingTop: 4 },
  score: { color: '#FFFFFF', fontSize: 40, lineHeight: 48, fontWeight: '600' },
  prompt: { color: '#FFFFFF', fontWeight: '600', lineHeight: 24 },
  option: { minHeight: 48, justifyContent: 'center', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: '#3D6350' },
  correct: { backgroundColor: '#2C5B43', borderColor: Brand.lime },
  wrong: { borderColor: '#C98B8B' },
  pressed: { opacity: 0.6 },
  explanation: { color: '#B9CEBF', fontSize: 14, lineHeight: 22, paddingTop: 4 },
  error: { color: '#F3C7C7', lineHeight: 24 },
});

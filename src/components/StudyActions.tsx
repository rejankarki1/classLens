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
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<'ask' | 'quiz' | null>(null);
  const [error, setError] = useState('');

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

  async function makeQuiz() {
    if (busy) return;
    setBusy('quiz');
    setError('');
    try {
      const result = await generateQuiz(lectureId);
      setQuiz(result);
      setPicked({});
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(null);
    }
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

    <AppButton
      title={busy === 'quiz' ? 'Generating…' : 'Generate Quiz  →'}
      secondary
      disabled={busy !== null}
      onPress={makeQuiz}
    />
    {busy === 'quiz' ? <ActivityIndicator color={Brand.lime} accessibilityLabel="Generating your quiz" /> : null}

    {quiz ? <View style={styles.quiz}>
      <ThemedText style={styles.answerLabel}>QUIZ · {quiz.questions.length} QUESTIONS</ThemedText>
      <ThemedText style={styles.quizTitle}>{quiz.title}</ThemedText>
      {quiz.questions.map((item, index) => {
        const choice = picked[index];
        return <View key={`${index}-${item.question}`} style={styles.question}>
          <ThemedText style={styles.prompt}>{index + 1}. {item.question}</ThemedText>
          {item.options.map((option) => {
            const chosen = choice === option;
            const correct = option === item.correctAnswer;
            const show = choice !== undefined;
            return <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityLabel={option}
              accessibilityState={{ selected: chosen, disabled: show }}
              disabled={show}
              onPress={() => setPicked((current) => ({ ...current, [index]: option }))}
              style={({ pressed }) => [
                styles.option,
                show && correct && styles.correct,
                show && chosen && !correct && styles.wrong,
                pressed && styles.pressed,
              ]}
            >
              <ThemedText style={styles.body}>{show && correct ? '✓  ' : show && chosen ? '✕  ' : ''}{option}</ThemedText>
            </Pressable>;
          })}
          {choice !== undefined ? <ThemedText style={styles.explanation}>{item.explanation}</ThemedText> : null}
        </View>;
      })}
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
  quizTitle: { color: '#FFFFFF', fontSize: 22, lineHeight: 28, fontWeight: '500' },
  question: { gap: 8, borderRadius: 16, padding: 16, backgroundColor: '#1B3B2D' },
  prompt: { color: '#FFFFFF', fontWeight: '600', lineHeight: 24 },
  option: { minHeight: 48, justifyContent: 'center', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: '#3D6350' },
  correct: { backgroundColor: '#2C5B43', borderColor: Brand.lime },
  wrong: { borderColor: '#C98B8B' },
  pressed: { opacity: 0.6 },
  explanation: { color: '#B9CEBF', fontSize: 14, lineHeight: 22, paddingTop: 4 },
  error: { color: '#F3C7C7', lineHeight: 24 },
});

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { EmptyState, SectionHeader } from '@/components/ui/Editorial';
import { Screen } from '@/components/ui/Screen';
import { Brand } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getMissedQuestions } from '@/services/quizAttempts';
import type { MissedQuestion } from '@/types';

export default function QuizReviewScreen() {
  const theme = useTheme();
  const [missed, setMissed] = useState<MissedQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError(false);
    getMissedQuestions()
      .then((data) => { if (active) setMissed(data); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  // Retry intentionally creates a new focused request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]));

  if (loading) return <Screen><EmptyState loading title="Gathering your missed questions" description="Looking through your quiz history." /></Screen>;
  if (error) return <Screen><EmptyState title="This didn't load" description="We couldn't load your missed questions. Please try again." action="Try again" onPress={() => setAttempt((value) => value + 1)} /></Screen>;

  return (
    <Screen>
      <SectionHeader title="Missed questions" detail={`${missed.length} to review`} />
      <ThemedText themeColor="textSecondary">Every question you've answered incorrectly, with its source still attached.</ThemedText>

      {missed.length ? missed.map((item) => (
        <View key={item.id} style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" themeColor="textSecondary">{item.lectureTitle}</ThemedText>
          <ThemedText style={styles.question}>{item.question}</ThemedText>

          <View style={styles.answerRow}>
            <ThemedText type="small" style={styles.wrong}>Your answer: {item.selectedAnswer}</ThemedText>
            <ThemedText type="small" style={styles.correct}>Correct answer: {item.correctAnswer}</ThemedText>
          </View>

          <ThemedText themeColor="textSecondary">{item.explanation}</ThemedText>

          {item.citedPages.length && item.lectureId ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`See ${item.citedPages.map((page) => `page ${page}`).join(', ')} in ${item.lectureTitle}`}
              onPress={() => router.push({ pathname: '/lecture/[id]', params: { id: item.lectureId } })}
            >
              <ThemedText style={styles.link}>
                See {item.citedPages.map((page) => `page ${page}`).join(', ')} in {item.lectureTitle} →
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      )) : (
        <EmptyState title="Nothing missed yet" description="Answer a quiz question incorrectly and it will show up here for review." />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 16, gap: 10 },
  question: { fontSize: 17, fontWeight: '700' },
  answerRow: { gap: 4 },
  wrong: { color: '#A14E4E', fontWeight: '600' },
  correct: { color: Brand.forest, fontWeight: '600' },
  link: { color: Brand.forest, fontWeight: '700' },
});

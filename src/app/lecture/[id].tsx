import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { Screen } from '@/components/ui/Screen';
import { getCourse } from '@/services/courses';
import { getLecture } from '@/services/lectures';
import type { Course, Lecture } from '@/types';

function Notes({ title, items }: { title: string; items: string[] }) {
  return <AppCard>
    <ThemedText style={{ fontSize: 20, fontWeight: '600' }}>{title}</ThemedText>
    {items.length ? items.map((item, index) => <ThemedText key={`${index}-${item}`}>• {item}</ThemedText>)
      : <ThemedText themeColor="textSecondary">None noted in this lecture.</ThemedText>}
  </AppCard>;
}

export default function LectureScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<{ lecture: Lecture; course: Course | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState('');

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError(false);
    setNotice('');
    async function load() {
      try {
        const lecture = await getLecture(id);
        const course = lecture ? await getCourse(lecture.courseId) : null;
        if (active) setData(lecture ? { lecture, course } : null);
      } catch { if (active) setError(true); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [id, attempt]));

  if (loading) return <Screen><ActivityIndicator accessibilityLabel="Loading lecture" /></Screen>;
  if (error) return <Screen><ThemedText>Could not load this lecture.</ThemedText>
    <AppButton title="Try again" onPress={() => setAttempt((value) => value + 1)} /></Screen>;
  if (!data) return <Screen><ThemedText>Lecture not found.</ThemedText>
    <AppButton title="Go home" onPress={() => router.replace('/')} /></Screen>;

  const { lecture, course } = data;
  return <Screen>
    <ThemedText type="subtitle">{lecture.title}</ThemedText>
    <ThemedText themeColor="textSecondary">{course ? `${course.code} · ${course.name}` : 'Course unavailable'}</ThemedText>
    <AppCard>
      <ThemedText style={{ fontSize: 20, fontWeight: '600' }}>Summary</ThemedText>
      <ThemedText>{lecture.summary}</ThemedText>
    </AppCard>
    <Notes title="Key concepts" items={lecture.keyConcepts} />
    <Notes title="Important points" items={lecture.importantPoints} />
    <Notes title="Assignments" items={lecture.assignments} />
    <Notes title="Exam mentions" items={lecture.examMentions} />
    <AppButton title="Ask This Lecture" onPress={() => setNotice('Coming soon: ask questions about this lecture.')} />
    <AppButton title="Generate Quiz" secondary onPress={() => setNotice('Coming soon: generate a quiz from this lecture.')} />
    {notice ? <ThemedText accessibilityLiveRegion="polite">{notice}</ThemedText> : null}
  </Screen>;
}

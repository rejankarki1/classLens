import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { LectureCard } from '@/components/LectureCard';
import { ThemedText } from '@/components/themed-text';
import { AppButton } from '@/components/ui/AppButton';
import { Screen } from '@/components/ui/Screen';
import { getCourse } from '@/services/courses';
import { getLectures } from '@/services/lectures';
import type { Course, Lecture } from '@/types';

export default function CourseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<{ course: Course | null; lectures: Lecture[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError(false);
    Promise.all([getCourse(id), getLectures(id)]).then(([course, lectures]) => {
      if (active) setData({ course, lectures });
    }).catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, attempt]));

  if (loading) return <Screen><ActivityIndicator accessibilityLabel="Loading course" /></Screen>;
  if (error) return <Screen><ThemedText>Could not load this course.</ThemedText>
    <AppButton title="Try again" onPress={() => setAttempt((value) => value + 1)} /></Screen>;
  if (!data?.course) return <Screen><ThemedText>Course not found.</ThemedText>
    <AppButton title="Go home" onPress={() => router.replace('/')} /></Screen>;

  return <Screen>
    <ThemedText type="smallBold">{data.course.code}</ThemedText>
    <ThemedText type="subtitle">{data.course.name}</ThemedText>
    <ThemedText themeColor="textSecondary">{data.course.professor}</ThemedText>
    <ThemedText style={{ fontSize: 22, fontWeight: '600' }}>Lectures</ThemedText>
    {data.lectures.length ? data.lectures.map((lecture) => <LectureCard key={lecture.id} lecture={lecture} />)
      : <ThemedText>No lectures yet.</ThemedText>}
  </Screen>;
}

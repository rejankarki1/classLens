import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { EmptyState, SectionHeader, StatusBadge } from '@/components/ui/Editorial';
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
  // Retry intentionally creates a new focused request even when the route is unchanged.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, attempt]));

  if (loading) return <Screen><EmptyState loading title="Opening your notebook" description="Gathering the ideas from this course." /></Screen>;
  if (error) return <Screen><EmptyState title="This notebook didn’t open" description="We couldn’t load this course. Please try again." action="Try again" onPress={() => setAttempt(value => value + 1)} /></Screen>;
  if (!data?.course) return <Screen><EmptyState title="This page is missing" description="It may have moved or is no longer available. Your workspace is a good place to start." action="Go home" onPress={() => router.replace('/')} /></Screen>;

  return <Screen>
    <StatusBadge label={data.course.code} />
    <View style={{ gap: 12 }}>
      <ThemedText type="title">{data.course.name}</ThemedText>
      <ThemedText themeColor="textSecondary">{data.course.professor}</ThemedText>
    </View>
    <ThemedText themeColor="textSecondary">One course. A clearer picture. All your lecture ideas, together.</ThemedText>
    <SectionHeader title="Lecture notebook" detail={`${data.lectures.length} lecture${data.lectures.length === 1 ? '' : 's'}`} />
    {data.lectures.length ? data.lectures.map(lecture => <LectureCard key={lecture.id} lecture={lecture} />)
      : <EmptyState title="Room for your next idea" description="No lectures in this course yet. Explore how capturing class material works." action="Explore capture" onPress={() => router.push('/capture')} />}
    <AppButton title="Capture class material  +" onPress={() => router.push('/capture')} />
  </Screen>;
}

import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { EmptyState, StatusBadge, formatDate } from '@/components/ui/Editorial';
import { LectureSections } from '@/components/LectureSections';
import { StudyActions } from '@/components/StudyActions';
import { ThemedText } from '@/components/themed-text';
import { AppButton } from '@/components/ui/AppButton';
import { Screen } from '@/components/ui/Screen';
import { getCourse } from '@/services/courses';
import { getLecture } from '@/services/lectures';
import type { Course, Lecture } from '@/types';

export default function LectureScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<{ lecture: Lecture; course: Course | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError(false);
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
  // Retry intentionally creates a new focused request even when the route is unchanged.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, attempt]));

  if (loading) return <Screen><EmptyState loading title="Bringing your ideas together" description="Opening your organized lecture notes." /></Screen>;
  if (error) return <Screen><EmptyState title="This notebook didn’t open" description="We couldn’t load this lecture. Please try again." action="Try again" onPress={() => setAttempt(value => value + 1)} /></Screen>;
  if (!data) return <Screen><EmptyState title="This page is missing" description="It may have moved or is no longer available. Your workspace is a good place to start." action="Go home" onPress={() => router.replace('/')} /></Screen>;

  const { lecture, course } = data;
  return <Screen>
    <StatusBadge label="LECTURE NOTEBOOK" />
    <View style={{ gap: 16 }}>
      <ThemedText type="title">{lecture.title}</ThemedText>
      <ThemedText themeColor="textSecondary">{course ? `${course.code} · ${course.name}` : 'Course unavailable'}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{course?.professor ? `${course.professor} · ` : ''}{formatDate(lecture.createdAt)}</ThemedText>
    </View>
    <LectureSections lecture={lecture} />
    <StudyActions key={lecture.id} lectureId={lecture.id} />
    {course ? <AppButton secondary title={`Back to ${course.code}`} onPress={() => router.replace({ pathname: '/course/[id]', params: { id: course.id } })} /> : null}
  </Screen>;
}

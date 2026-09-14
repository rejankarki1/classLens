import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { CourseCard } from '@/components/CourseCard';
import { ThemedText } from '@/components/themed-text';
import { AppButton } from '@/components/ui/AppButton';
import { Screen } from '@/components/ui/Screen';
import { getCourses } from '@/services/courses';
import type { Course } from '@/types';

export default function HomeScreen() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError(false);
    getCourses().then((data) => { if (active) setCourses(data); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]));

  return <Screen>
    <ThemedText type="title">ClassLens</ThemedText>
    <ThemedText themeColor="textSecondary">Your classes, made clearer.</ThemedText>
    <AppButton title="Capture class material" onPress={() => router.push('/capture')} />
    <ThemedText type="subtitle">Your courses</ThemedText>
    {loading ? <ActivityIndicator accessibilityLabel="Loading courses" /> : error ? <>
      <ThemedText>Could not load your courses.</ThemedText>
      <AppButton title="Try again" onPress={() => setAttempt((value) => value + 1)} />
    </> : courses.length ? courses.map((course) => <CourseCard key={course.id} course={course} />)
      : <ThemedText>No courses yet.</ThemedText>}
    <ThemedText type="small" themeColor="textSecondary">Demo workspace · Sample course material</ThemedText>
  </Screen>;
}

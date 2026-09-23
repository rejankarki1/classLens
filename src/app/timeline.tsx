import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { LectureCard } from '@/components/LectureCard';
import { ThemedText } from '@/components/themed-text';
import { EmptyState, SectionHeader, StatusBadge } from '@/components/ui/Editorial';
import { Screen } from '@/components/ui/Screen';
import { getMyEnrolledCourses } from '@/services/enrollment';
import { getMyLectures } from '@/services/lectures';
import type { Course, Lecture } from '@/types';

export default function TimelineScreen() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError(false);
    Promise.all([getMyEnrolledCourses(), getMyLectures()])
      .then(([courseList, lectureList]) => {
        if (!active) return;
        setCourses(courseList);
        setLectures(lectureList);
      })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  // Retry intentionally creates a new focused request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]));

  if (loading) {
    return <Screen><EmptyState loading title="Building your timeline" description="Gathering every lecture you've captured this semester." /></Screen>;
  }
  if (error) {
    return <Screen><EmptyState title="This didn't load" description="We couldn't build your timeline. Please try again." action="Try again" onPress={() => setAttempt((value) => value + 1)} /></Screen>;
  }

  const byCourse = new Map<string, Lecture[]>();
  for (const lecture of lectures) {
    const group = byCourse.get(lecture.courseId) ?? [];
    group.push(lecture);
    byCourse.set(lecture.courseId, group);
  }
  // Course order follows the enrolled list; a lecture whose course has since
  // been dropped still shows under its own group rather than disappearing.
  const knownCourseIds = new Set(courses.map((course) => course.id));
  const groupOrder = [...courses.map((course) => course.id), ...[...byCourse.keys()].filter((id) => !knownCourseIds.has(id))];

  return (
    <Screen>
      <SectionHeader title="Semester timeline" detail={`${lectures.length} lecture${lectures.length === 1 ? '' : 's'}`} />
      <ThemedText themeColor="textSecondary">Every lecture you've captured this semester, ordered by when it was filed.</ThemedText>

      {lectures.length ? groupOrder.map((courseId) => {
        const group = byCourse.get(courseId);
        if (!group?.length) return null;
        const course = courses.find((item) => item.id === courseId);
        return (
          <View key={courseId} style={{ gap: 12 }}>
            <StatusBadge label={course ? `${course.code} · ${course.name}` : 'Other'} />
            {group.map((lecture) => <LectureCard key={lecture.id} lecture={lecture} />)}
          </View>
        );
      }) : (
        <EmptyState
          title="Nothing captured yet"
          description="Capture your first lecture and it will show up here, in order."
          action="Capture your first lecture"
          onPress={() => router.push('/capture')}
        />
      )}
    </Screen>
  );
}

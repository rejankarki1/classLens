import {
  useCallback,
  useState,
} from 'react';

import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import {
  router,
  useFocusEffect,
} from 'expo-router';

import { CourseCard } from '@/components/CourseCard';
import { ClassLensLogo } from '@/components/ClassLensLogo';

import {
  EmptyState,
  SectionHeader,
  StatusBadge,
} from '@/components/ui/Editorial';

import { Screen } from '@/components/ui/Screen';
import { ThemedText } from '@/components/themed-text';

import { Brand, Fonts } from '@/constants/theme';

import { getMyEnrolledCourses } from '@/services/enrollment';

import type { Course } from '@/types';

export default function CoursesScreen() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      setLoading(true);
      setError(false);

      getMyEnrolledCourses()
        .then((data) => {
          if (active) {
            setCourses(data);
          }
        })
        .catch(() => {
          if (active) {
            setError(true);
          }
        })
        .finally(() => {
          if (active) {
            setLoading(false);
          }
        });

      return () => {
        active = false;
      };
    }, [attempt])
  );

  return (
    <Screen showBottomNav>
      <View style={styles.header}>
        <ClassLensLogo compact />
        <StatusBadge label="COURSES" />
      </View>

      <View style={styles.intro}>
        <ThemedText type="title" style={styles.title}>
          Everything you're learning.
        </ThemedText>

        <ThemedText themeColor="textSecondary">
          Keep lectures, notes, assignments and study material organized by course.
        </ThemedText>
      </View>

      <View style={styles.sectionHeader}>
        <SectionHeader
          title="Your courses"
          detail={
            loading
              ? 'Loading…'
              : `${courses.length} course${courses.length === 1 ? '' : 's'}`
          }
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add course"
          onPress={() => router.push('/course-onboarding' as never)}
          style={({ pressed }) => [
            styles.addButton,
            pressed && styles.pressed,
          ]}
        >
          <ThemedText style={styles.addButtonText}>
            ＋
          </ThemedText>
        </Pressable>
      </View>

      {loading ? (
        <EmptyState
          loading
          title="Opening your courses"
          description="Gathering your academic workspace."
        />
      ) : error ? (
        <EmptyState
          title="Courses couldn't load"
          description="Try again and ClassLens will reopen your workspace."
          action="Try again"
          onPress={() =>
            setAttempt((value) => value + 1)
          }
        />
      ) : courses.length ? (
        courses.map((course) => (
          <CourseCard
            key={course.id}
            course={course}
          />
        ))
      ) : (
        <EmptyState
          title="Start with a course"
          description="Create your first course and keep everything from class in one place."
        />
      )}

      <Pressable
        onPress={() => router.push('/capture')}
        style={({ pressed }) => [
          styles.captureShortcut,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.captureIcon}>
          <ThemedText style={styles.captureIconText}>
            ◎
          </ThemedText>
        </View>

        <View style={styles.captureCopy}>
          <ThemedText style={styles.captureTitle}>
            Capture something now
          </ThemedText>

          <ThemedText
            type="small"
            themeColor="textSecondary"
          >
            Add new material and choose its course afterwards.
          </ThemedText>
        </View>

        <ThemedText style={styles.arrow}>
          →
        </ThemedText>
      </Pressable>

    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },

  intro: {
    gap: 12,
  },

  title: {
    fontFamily: Fonts.serif,
    fontWeight: '400',
    letterSpacing: -1.2,
  },

  sectionHeader: {
    gap: 12,
  },

  addButton: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignSelf: 'flex-end',
    backgroundColor: Brand.forest,
    justifyContent: 'center',
    alignItems: 'center',
  },

  addButtonText: {
    color: '#FFFFFF',
    fontSize: 23,
  },

  pressed: {
    opacity: 0.6,
    transform: [{ scale: 0.96 }],
  },

  captureShortcut: {
    borderRadius: 22,
    padding: 16,
    backgroundColor: '#E8EFDE',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  captureIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: Brand.forest,
    justifyContent: 'center',
    alignItems: 'center',
  },

  captureIconText: {
    color: '#D1AD69',
    fontSize: 24,
  },

  captureCopy: {
    flex: 1,
    gap: 4,
  },

  captureTitle: {
    color: Brand.ink,
    fontWeight: '700',
    fontSize: 15,
  },

  arrow: {
    color: Brand.forest,
    fontSize: 20,
  },
});

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AddCourseSheet } from '@/components/AddCourseSheet';
import { ClassLensLogo } from '@/components/ClassLensLogo';
import { ThemedText } from '@/components/themed-text';
import { EmptyState } from '@/components/ui/Editorial';
import { Screen } from '@/components/ui/Screen';
import { Brand, Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getCourses } from '@/services/courses';
import { enrollInCourse, getMyEnrolledCourses } from '@/services/enrollment';
import type { Course } from '@/types';

export default function CourseOnboardingScreen() {
  const theme = useTheme();
  const dark = theme.background !== Brand.paper;
  const [courses, setCourses] = useState<Course[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([getCourses(), getMyEnrolledCourses()])
      .then(([catalog, enrolled]) => {
        if (!active) return;
        setCourses(catalog);
        setSelected(new Set(enrolled.map((course) => course.id)));
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Could not load courses.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function toggle(courseId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(courseId)) next.delete(courseId); else next.add(courseId);
      return next;
    });
    setError('');
  }

  async function submit() {
    if (!selected.size || saving) return;
    setSaving(true);
    setError('');
    try {
      await Promise.all([...selected].map(enrollInCourse));
      router.replace('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save your courses.');
      setSaving(false);
    }
  }

  return (
    <>
      <Screen avoidKeyboard>
        <View style={styles.header}>
          <ClassLensLogo compact />
          <ThemedText type="smallBold" themeColor="textSecondary">COURSES</ThemedText>
        </View>

        <View style={styles.intro}>
          <ThemedText type="title" style={styles.title}>Choose your courses.</ThemedText>
          <ThemedText themeColor="textSecondary">
            Pick at least one course. ClassLens will use these choices for your notebooks and photo matching.
          </ThemedText>
        </View>

        {loading ? (
          <EmptyState loading title="Opening the course catalog" description="Finding courses you can add." />
        ) : courses.length ? (
          <View style={styles.list}>
            {courses.map((course) => {
              const active = selected.has(course.id);
              return (
                <Pressable
                  key={course.id}
                  accessibilityRole="checkbox"
                  accessibilityLabel={`${course.code}, ${course.name}`}
                  accessibilityState={{ checked: active, disabled: saving }}
                  disabled={saving}
                  onPress={() => toggle(course.id)}
                  style={({ pressed }) => [
                    styles.course,
                    { backgroundColor: theme.backgroundElement, borderColor: active ? Brand.forest : theme.backgroundSelected },
                    active && { backgroundColor: dark ? theme.backgroundSelected : '#EAF2E8' },
                    pressed && styles.dim,
                  ]}
                >
                  <View style={styles.courseCopy}>
                    <ThemedText style={styles.code}>{course.code}</ThemedText>
                    <ThemedText style={styles.name}>{course.name}</ThemedText>
                    {course.professor ? <ThemedText type="small" themeColor="textSecondary">{course.professor}</ThemedText> : null}
                  </View>
                  <View style={[styles.check, { borderColor: active ? Brand.forest : theme.backgroundSelected }, active && styles.checkActive]}>
                    {active ? <ThemedText style={styles.checkText}>✓</ThemedText> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <EmptyState title="No courses yet" description="Create your course to start your ClassLens workspace." />
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create a missing course"
          disabled={saving}
          onPress={() => setAddOpen(true)}
          style={({ pressed }) => [styles.secondary, { backgroundColor: theme.backgroundSelected }, pressed && styles.dim]}
        >
          <ThemedText style={styles.actionText}>＋ Create a missing course</ThemedText>
        </Pressable>

        {error ? <ThemedText accessibilityLiveRegion="polite" style={[styles.error, { color: dark ? '#E7A6A6' : '#8C3B3B' }]}>{error}</ThemedText> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Enter ClassLens"
          accessibilityState={{ disabled: !selected.size || saving, busy: saving }}
          disabled={!selected.size || saving}
          onPress={submit}
          style={({ pressed }) => [styles.primary, { backgroundColor: dark ? Brand.lime : Brand.forest }, (pressed || !selected.size || saving) && styles.dim]}
        >
          {saving ? <ActivityIndicator color={dark ? Brand.ink : '#FFFFFF'} /> : <ThemedText style={[styles.actionText, { color: dark ? Brand.ink : '#FFFFFF' }]}>Enter ClassLens  →</ThemedText>}
        </Pressable>
      </Screen>

      <AddCourseSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(course) => {
          setCourses((current) => [course, ...current.filter((item) => item.id !== course.id)].sort((a, b) => a.code.localeCompare(b.code) || a.id.localeCompare(b.id)));
          setSelected((current) => new Set(current).add(course.id));
          setError('');
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  intro: { gap: 12 },
  title: { fontFamily: Fonts.serif, fontWeight: '400', letterSpacing: -1.2 },
  list: { gap: 12 },
  course: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 16, padding: 18, borderRadius: 20, borderWidth: 1 },
  courseCopy: { flex: 1, gap: 3 },
  code: { color: Brand.forest, fontSize: 13, fontWeight: '800', letterSpacing: 0.7 },
  name: { fontSize: 19, lineHeight: 25, fontWeight: '600' },
  check: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 2 },
  checkActive: { backgroundColor: Brand.forest },
  checkText: { color: '#FFFFFF', fontSize: 16, lineHeight: 20, fontWeight: '800' },
  primary: { minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 17 },
  secondary: { minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 17 },
  actionText: { fontWeight: '700' },
  error: { fontSize: 14, lineHeight: 21 },
  dim: { opacity: 0.6 },
});

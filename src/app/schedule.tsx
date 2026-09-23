import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState, SectionHeader } from '@/components/ui/Editorial';
import { Screen } from '@/components/ui/Screen';
import { Brand } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deleteSchedule, getMySchedules, saveSchedule } from '@/services/courseSchedules';
import { getMyEnrolledCourses } from '@/services/enrollment';
import type { Course, CourseSchedule } from '@/types';

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type Draft = { dayOfWeek: number; startTime: string; endTime: string };

export default function ScheduleScreen() {
  const theme = useTheme();
  const [courses, setCourses] = useState<Course[]>([]);
  const [schedules, setSchedules] = useState<CourseSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingCourseId, setSavingCourseId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    Promise.all([getMyEnrolledCourses(), getMySchedules()])
      .then(([courseList, scheduleList]) => {
        if (!active) return;
        setCourses(courseList);
        setSchedules(scheduleList);
      })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : 'Could not load your schedule.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []));

  function draftFor(courseId: string): Draft {
    return drafts[courseId] ?? { dayOfWeek: 1, startTime: '09:00', endTime: '10:00' };
  }
  function updateDraft(courseId: string, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [courseId]: { ...draftFor(courseId), ...patch } }));
  }

  async function addTime(courseId: string) {
    setSavingCourseId(courseId);
    setError('');
    try {
      const saved = await saveSchedule({ courseId, ...draftFor(courseId) });
      setSchedules((current) => [...current.filter((row) => row.id !== saved.id), saved]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that class time.');
    } finally {
      setSavingCourseId(null);
    }
  }

  async function removeTime(id: string) {
    setError('');
    try {
      await deleteSchedule(id);
      setSchedules((current) => current.filter((row) => row.id !== id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not remove that class time.');
    }
  }

  if (loading) return <Screen avoidKeyboard><EmptyState loading title="Opening your schedule" description="Gathering your enrolled courses." /></Screen>;

  return (
    <Screen avoidKeyboard>
      <SectionHeader title="Class schedule" detail="Optional" />
      <ThemedText themeColor="textSecondary">
        Add class times so ClassLens can use them as a hint when matching a capture to a course. A schedule never overrides your enrolled courses.
      </ThemedText>

      {courses.length ? courses.map((course) => {
        const courseTimes = schedules.filter((row) => row.courseId === course.id);
        const draft = draftFor(course.id);
        return (
          <View key={course.id} style={[styles.courseCard, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText style={styles.courseTitle}>{course.code} · {course.name}</ThemedText>

            {courseTimes.map((row) => (
              <View key={row.id} style={styles.timeRow}>
                <ThemedText type="small">{dayLabels[row.dayOfWeek]} {row.startTime}–{row.endTime}</ThemedText>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${dayLabels[row.dayOfWeek]} ${row.startTime} class time`} onPress={() => removeTime(row.id)}>
                  <ThemedText style={styles.remove}>Remove</ThemedText>
                </Pressable>
              </View>
            ))}

            <View style={styles.dayChips}>
              {dayLabels.map((label, index) => {
                const active = draft.dayOfWeek === index;
                return (
                  <Pressable
                    key={label}
                    accessibilityRole="button"
                    accessibilityLabel={`${label}`}
                    accessibilityState={{ selected: active }}
                    onPress={() => updateDraft(course.id, { dayOfWeek: index })}
                    style={[styles.dayChip, { borderColor: theme.backgroundSelected }, active && { backgroundColor: Brand.forest, borderColor: Brand.forest }]}
                  >
                    <ThemedText type="small" style={active ? styles.dayChipTextActive : undefined}>{label}</ThemedText>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.timeInputs}>
              <TextInput
                value={draft.startTime}
                onChangeText={(value) => updateDraft(course.id, { startTime: value })}
                placeholder="09:00"
                placeholderTextColor={theme.textSecondary}
                style={[styles.timeInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
              />
              <ThemedText themeColor="textSecondary">to</ThemedText>
              <TextInput
                value={draft.endTime}
                onChangeText={(value) => updateDraft(course.id, { endTime: value })}
                placeholder="10:00"
                placeholderTextColor={theme.textSecondary}
                style={[styles.timeInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
              />
            </View>

            <AppButton
              title={savingCourseId === course.id ? 'Saving…' : 'Save this time'}
              disabled={savingCourseId === course.id}
              onPress={() => addTime(course.id)}
            />
          </View>
        );
      }) : (
        <EmptyState
          title="No enrolled courses yet"
          description="Add a course before setting a class schedule."
          action="Choose courses"
          onPress={() => router.push('/course-onboarding' as never)}
        />
      )}

      {error ? <ThemedText accessibilityLiveRegion="polite" style={styles.error}>{error}</ThemedText> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  courseCard: { borderRadius: 20, padding: 16, gap: 12 },
  courseTitle: { fontSize: 17, fontWeight: '700' },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  remove: { color: '#A14E4E', fontWeight: '700' },
  dayChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dayChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  dayChipTextActive: { color: '#FFFFFF', fontWeight: '700' },
  timeInputs: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeInput: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12 },
  error: { color: '#8C3B3B' },
});

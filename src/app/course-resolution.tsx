import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AddCourseSheet } from '@/components/AddCourseSheet';
import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui/Screen';
import { Brand, Fonts } from '@/constants/theme';
import type { Course, ProcessingJob } from '@/types';
import { getMyEnrolledCourses, enrollInCourse } from '@/services/enrollment';
import { chooseProcessingJobCourse, getProcessingJob } from '@/services/processingJobs';
import { runProcessingJob } from '@/services/processingOrchestrator';

export default function CourseResolutionScreen() {
  const params = useLocalSearchParams<{ jobId?: string | string[] }>();
  const jobId = Array.isArray(params.jobId) ? params.jobId[0] : params.jobId;
  const [job, setJob] = useState<ProcessingJob | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!jobId) { setLoading(false); return; }
    Promise.all([getProcessingJob(jobId), getMyEnrolledCourses()])
      .then(([nextJob, nextCourses]) => { if (active) { setJob(nextJob); setCourses(nextCourses); } })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : 'Could not load course choices.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [jobId]);

  async function choose(course: Course) {
    if (!job || saving) return;
    setSaving(true);
    setError('');
    try {
      await chooseProcessingJobCourse(job.id, course.id);
      await runProcessingJob(job.id, 'screen');
      const completed = await getProcessingJob(job.id);
      if (completed?.lectureId) router.replace({ pathname: '/lecture/[id]', params: { id: completed.lectureId } });
      else router.replace({ pathname: '/processing', params: { jobId: job.id } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not file this course.');
      setSaving(false);
    }
  }

  if (loading) return <Screen><ActivityIndicator color={Brand.forest} accessibilityLabel="Loading enrolled courses" /></Screen>;

  return (
    <>
      <Screen>
        <View style={styles.header}>
          <ThemedText type="smallBold" style={styles.eyebrow}>COURSE NEEDED</ThemedText>
          <ThemedText type="title" style={styles.title}>Where should these notes live?</ThemedText>
          <ThemedText themeColor="textSecondary">{job?.suggestedCourseLabel ? `Suggestion: ${job.suggestedCourseLabel} · ${Math.round((job.matchConfidence ?? 0) * 100)}%` : 'No enrolled course matched confidently.'}</ThemedText>
          {job?.matchExplanation ? <ThemedText type="small" themeColor="textSecondary">{job.matchExplanation}</ThemedText> : null}
        </View>
        <View style={styles.list}>
          {courses.map((course) => <Pressable key={course.id} accessibilityRole="button" accessibilityLabel={`File in ${course.code}, ${course.name}`} disabled={saving} onPress={() => choose(course)} style={({ pressed }) => [styles.course, pressed && styles.pressed]}><View style={styles.courseCopy}><ThemedText style={styles.code}>{course.code}</ThemedText><ThemedText>{course.name}</ThemedText>{course.professor ? <ThemedText type="small" themeColor="textSecondary">{course.professor}</ThemedText> : null}</View><ThemedText style={styles.arrow}>→</ThemedText></Pressable>)}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Create and enroll in a new course" disabled={saving} onPress={() => setCreating(true)} style={styles.secondary}><ThemedText style={styles.secondaryText}>Create and enroll in a new course</ThemedText></Pressable>
        {error ? <ThemedText style={styles.error} accessibilityLiveRegion="polite">{error}</ThemedText> : null}
      </Screen>
      <AddCourseSheet visible={creating} onClose={() => setCreating(false)} onCreated={(course) => {
        void (async () => {
          try { await enrollInCourse(course.id); setCourses((current) => [...current, course]); await choose(course); }
          catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not enroll in that course.'); setSaving(false); }
        })();
      }} />
    </>
  );
}

const styles = StyleSheet.create({
  header: { gap: 10 }, eyebrow: { color: Brand.forest, letterSpacing: 1.1 }, title: { fontFamily: Fonts.serif, fontWeight: '400' }, list: { gap: 10 },
  course: { minHeight: 76, padding: 16, borderRadius: 18, backgroundColor: '#E8EFDE', flexDirection: 'row', alignItems: 'center', gap: 12 }, courseCopy: { flex: 1, gap: 3 },
  code: { color: Brand.forest, fontWeight: '800' }, arrow: { color: Brand.forest, fontSize: 20 }, secondary: { minHeight: 52, borderWidth: 1, borderColor: Brand.forest, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: Brand.forest, fontWeight: '800' }, error: { color: '#8C3B3B' }, pressed: { opacity: 0.65 },
});

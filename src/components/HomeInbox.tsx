import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Brand } from '@/constants/theme';
import type { ProcessingJob } from '@/types';
import { ThemedText } from './themed-text';
import { getActuallyActiveProcessingJobs, getCourseNeededJobs, onProcessingJobsChange } from '@/services/processingJobs';

// Three calm zones, replacing the old flat two-list dump:
//  - a single quiet status line while anything is uploading/processing
//    (retryable_failed is folded in here without raw error text -- retries
//    are the server's job, not Home's; the manual Retry on /processing,
//    reachable by tapping this line, is the only client-initiated retry);
//  - "Needs your input", only for course_needed and truly terminal jobs;
//  - the notebooks list itself (Home's existing "Continue studying" section
//    already covers this -- nothing to render here for it).

function calmStatus(jobs: ProcessingJob[]): string {
  if (jobs.length > 1) return `Processing ${jobs.length} lectures…`;
  if (jobs[0]?.lastErrorCode === 'GEMINI_ALL_BUSY') return 'Your notes will be ready soon';
  const stage = jobs[0]?.stage;
  if (stage === 'uploaded' || stage === 'analyzing' || stage === 'filing') return 'Making your notes…';
  return 'Uploading your lecture…';
}

export function HomeInbox() {
  const [needsCourse, setNeedsCourse] = useState<ProcessingJob[]>([]);
  const [active, setActive] = useState<ProcessingJob[]>([]);
  const [focused, setFocused] = useState(false);

  const refreshActive = useCallback(() => {
    void getActuallyActiveProcessingJobs(5).then(setActive).catch(() => setActive([]));
  }, []);

  const refresh = useCallback(() => {
    void getCourseNeededJobs(50).then(setNeedsCourse).catch(() => setNeedsCourse([]));
    refreshActive();
  }, [refreshActive]);

  useFocusEffect(useCallback(() => {
    setFocused(true);
    refresh();
    const off = onProcessingJobsChange(refresh);
    return () => { setFocused(false); off(); };
  }, [refresh]));

  useEffect(() => {
    const shouldPoll = active.some((job) => ['uploading', 'uploaded', 'analyzing', 'filing'].includes(job.stage));
    if (!focused || !shouldPoll) return;
    const timer = setInterval(refresh, 3_000);
    return () => clearInterval(timer);
  }, [active, focused, refresh]);

  if (!active.length && !needsCourse.length) return null;

  return (
    <View style={styles.shell} accessibilityLabel="Processing status">
      {active.length ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View processing details"
          onPress={() => router.push({ pathname: '/processing', params: { jobId: active[0].id } })}
          style={({ pressed }) => [styles.statusRow, pressed && styles.pressed]}
        >
          <ActivityIndicator color={Brand.forest} />
          <ThemedText style={styles.statusText}>{calmStatus(active)}</ThemedText>
        </Pressable>
      ) : null}

      {needsCourse.length ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${needsCourse.length} captures need a course. Review`}
          onPress={() => router.push('/inbox')}
          style={({ pressed }) => [styles.reviewRow, pressed && styles.pressed]}
        >
          <ThemedText style={styles.statusText}>{needsCourse.length} captures need a course → Review</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { gap: 14 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusText: { color: Brand.forest, fontWeight: '600' },
  reviewRow: { minHeight: 52, justifyContent: 'center' },
  pressed: { opacity: 0.65 },
});

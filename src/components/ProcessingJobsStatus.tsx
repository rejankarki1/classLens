import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Brand } from '@/constants/theme';
import type { ProcessingJob } from '@/types';
import { ThemedText } from './themed-text';
import { runProcessingJob } from '@/services/processingOrchestrator';
import { getRecentProcessingJobs, onProcessingJobsChange, retryProcessingJob } from '@/services/processingJobs';

const priority: Record<ProcessingJob['stage'], number> = {
  course_needed: 0, retryable_failed: 0, terminal_failed: 0,
  queued: 1, uploading: 1, analyzing: 1, filing: 1, completed: 2,
};

function label(job: ProcessingJob): string {
  if (job.stage === 'uploading') return `Uploading ${job.uploadedCount} of ${job.totalCount} pages…`;
  if (job.stage === 'analyzing') return 'Analyzing your lecture…';
  if (job.stage === 'course_needed') return 'Course needed';
  if (job.stage === 'filing') return 'Building your notebook…';
  if (job.stage === 'completed') return 'Notes successfully filed';
  if (job.stage === 'queued') return 'Lecture queued';
  return job.lastErrorMessage ?? 'Processing needs attention';
}

export function ProcessingJobsStatus() {
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void getRecentProcessingJobs(10).then(setJobs).catch(() => setJobs([]));
  }, []);

  useFocusEffect(useCallback(() => {
    refresh();
    return onProcessingJobsChange(refresh);
  }, [refresh]));

  const visible = useMemo(() => [...jobs]
    .sort((a, b) => priority[a.stage] - priority[b.stage] || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 3), [jobs]);
  if (!visible.length) return null;

  async function retry(job: ProcessingJob) {
    setBusy(job.id);
    try { await retryProcessingJob(job.id); await runProcessingJob(job.id, 'retry'); refresh(); }
    finally { setBusy(null); }
  }

  return (
    <View style={styles.shell} accessibilityLabel="Lecture processing status">
      <View style={styles.heading}><ThemedText type="smallBold" style={styles.eyebrow}>PROCESSING</ThemedText>{jobs.length > 3 ? <ThemedText type="small" themeColor="textSecondary">+{jobs.length - 3} more</ThemedText> : null}</View>
      {visible.map((job) => {
        const action = job.stage === 'course_needed' ? 'Choose course' : job.stage === 'retryable_failed' ? 'Retry' : job.stage === 'completed' ? 'Open notes' : 'View';
        return <View key={job.id} style={styles.row}><View style={styles.copy}><ThemedText style={styles.title}>{label(job)}</ThemedText>{job.suggestedCourseLabel ? <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{job.suggestedCourseLabel}</ThemedText> : null}</View><Pressable accessibilityRole="button" accessibilityLabel={`${action} for processing job`} accessibilityState={{ disabled: busy === job.id }} disabled={busy === job.id} onPress={() => {
          if (job.stage === 'course_needed') router.push({ pathname: '/course-resolution' as never, params: { jobId: job.id } } as never);
          else if (job.stage === 'retryable_failed') void retry(job);
          else if (job.stage === 'completed' && job.lectureId) router.push({ pathname: '/lecture/[id]', params: { id: job.lectureId } });
          else router.push({ pathname: '/processing', params: { jobId: job.id } });
        }} style={({ pressed }) => [styles.action, pressed && styles.pressed]}><ThemedText style={styles.actionText}>{busy === job.id ? 'Starting…' : job.stage === 'terminal_failed' ? 'Review' : action}</ThemedText></Pressable></View>;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { borderRadius: 20, padding: 15, gap: 12, backgroundColor: '#E8EFDE' }, heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, eyebrow: { color: Brand.forest, letterSpacing: 1 },
  row: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#BDCCB8', paddingTop: 10 }, copy: { flex: 1, gap: 2 }, title: { fontWeight: '700' },
  action: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 13, backgroundColor: Brand.forest }, actionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' }, pressed: { opacity: 0.65 },
});

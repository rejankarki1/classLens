import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Brand, Fonts } from '@/constants/theme';
import { getCaptureAnalysisRecord, getCourseNeededJobs, chooseProcessingJobCourse } from '@/services/processingJobs';
import { processJobNow } from '@/services/processingOrchestrator';
import type { ProcessingJob } from '@/types';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/Editorial';
import { Screen } from '@/components/ui/Screen';
import { ThemedText } from '@/components/themed-text';

type AnalysisPreview = { summary: string | null; topics: string[] };

function preview(value: unknown): AnalysisPreview {
  if (!value || typeof value !== 'object') return { summary: null, topics: [] };
  const row = value as Record<string, unknown>;
  return {
    summary: typeof row.combinedSummary === 'string' ? row.combinedSummary : null,
    topics: Array.isArray(row.topicSignals) ? row.topicSignals.filter((item): item is string => typeof item === 'string').slice(0, 3) : [],
  };
}

export default function InboxScreen() {
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [previews, setPreviews] = useState<Record<string, AnalysisPreview>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    setError('');
    void getCourseNeededJobs(50).then(async (rows) => {
      setJobs(rows);
      const pairs = await Promise.all(rows.map(async (job) => {
        if (!job.captureAnalysisId) return [job.id, { summary: null, topics: [] }] as const;
        try {
          const saved = await getCaptureAnalysisRecord(job.captureSessionId);
          return [job.id, preview(saved?.analysis)] as const;
        } catch {
          return [job.id, { summary: null, topics: [] }] as const;
        }
      }));
      setPreviews(Object.fromEntries(pairs));
    }).catch(() => setError('Could not load captures needing a course.'));
  }, []);

  useFocusEffect(useCallback(() => {
    refresh();
  }, [refresh]));

  const visible = jobs.filter((job) => !dismissed.has(job.id));

  async function confirm(job: ProcessingJob) {
    if (!job.suggestedCourseId || busyId) return;
    setBusyId(job.id);
    setError('');
    try {
      await chooseProcessingJobCourse(job.id, job.suggestedCourseId);
      const finished = await processJobNow(job.id);
      if (finished?.lectureId) router.replace({ pathname: '/lecture/[id]', params: { id: finished.lectureId } });
      else refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not file this capture.');
    } finally {
      setBusyId(null);
    }
  }

  if (!visible.length && !error) {
    return <Screen><EmptyState title="Inbox is clear" description="Captures needing a course will appear here." /></Screen>;
  }

  return (
    <Screen>
      <View style={styles.header}>
        <ThemedText type="smallBold" style={styles.eyebrow}>INBOX</ThemedText>
        <ThemedText type="subtitle" style={styles.title}>Choose where your notes belong</ThemedText>
        <ThemedText themeColor="textSecondary">Confirm the suggestion or choose another enrolled course.</ThemedText>
      </View>
      {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
      <View style={styles.list}>
        {visible.map((job) => {
          const detail = previews[job.id];
          const topic = detail?.topics.join(' · ');
          return (
            <View key={job.id} style={styles.card}>
              <View style={styles.copy}>
                <ThemedText style={styles.cardTitle}>{topic || 'Captured lecture notes'}</ThemedText>
                {detail?.summary ? <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>{detail.summary}</ThemedText> : null}
                <ThemedText style={styles.courseLabel}>Suggested course</ThemedText>
                <ThemedText style={styles.course}>{job.suggestedCourseLabel ?? 'No confident suggestion'}</ThemedText>
              </View>
              <AppButton title="Confirm" disabled={busyId !== null} onPress={() => void confirm(job)} />
              <View style={styles.actions}>
                <Pressable accessibilityRole="button" accessibilityLabel="Change course" disabled={busyId !== null} onPress={() => router.push({ pathname: '/course-resolution' as never, params: { jobId: job.id } } as never)}>
                  <ThemedText style={styles.link}>Change</ThemedText>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Dismiss capture" disabled={busyId !== null} onPress={() => setDismissed((current) => new Set(current).add(job.id))}>
                  <ThemedText style={styles.dismiss}>Dismiss</ThemedText>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 10 },
  eyebrow: { color: Brand.forest, letterSpacing: 1.1 },
  title: { fontFamily: Fonts.serif, fontWeight: '400' },
  list: { gap: 14 },
  card: { gap: 14, padding: 16, borderRadius: 20, backgroundColor: '#F6EFDC' },
  copy: { gap: 5 },
  cardTitle: { color: Brand.ink, fontWeight: '800' },
  courseLabel: { color: Brand.ink, fontSize: 12, fontWeight: '700', marginTop: 5 },
  course: { color: Brand.forest, fontWeight: '800' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: Brand.forest, fontWeight: '800' },
  dismiss: { color: Brand.ink, fontSize: 13, fontWeight: '700' },
  error: { color: '#8C3B3B' },
});

import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui/Screen';
import { Brand, Fonts } from '@/constants/theme';
import type { ProcessingJob } from '@/types';
import { runProcessingJob } from '@/services/processingOrchestrator';
import { getProcessingJob, onProcessingJobsChange, retryProcessingJob } from '@/services/processingJobs';
import { requestProcessingNotificationPermission } from '@/services/processingNotifications';
import { registerDeviceToken } from '@/services/pushTokens';

function copy(job: ProcessingJob | null) {
  if (!job) return { title: 'Opening your processing job', body: 'Checking the saved lecture state.' };
  if (job.stage === 'queued') return { title: 'Lecture saved', body: 'Your durable processing job is ready to start.' };
  if (job.stage === 'uploading') return { title: `Uploading ${job.uploadedCount} of ${job.totalCount} pages…`, body: 'Each verified page is safe before ClassLens continues.' };
  if (job.stage === 'uploaded') return { title: 'Pages saved', body: 'Your notes are being prepared.' };
  if (job.stage === 'analyzing') return { title: 'Analyzing your lecture…', body: 'ClassLens is reading all pages together. You can return Home.' };
  if (job.stage === 'course_needed') return { title: 'Course needed', body: job.matchExplanation ?? 'Choose an enrolled course to finish filing.' };
  if (job.stage === 'filing') return { title: 'Building your notebook…', body: 'Saving one organized notebook for this capture session.' };
  if (job.stage === 'completed') return { title: 'Your notes are ready', body: 'The originals and saved analysis are filed together.' };
  if (job.lastErrorCode === 'GEMINI_ALL_BUSY' && ['retryable_failed', 'terminal_failed'].includes(job.stage)) {
    return { title: 'Your notes will be ready soon', body: 'You can leave ClassLens—we’ll keep trying in the background.' };
  }
  if (job.stage === 'retryable_failed') return { title: 'Processing paused', body: job.lastErrorMessage ?? 'Open Home for recovery options.' };
  if (job.stage === 'terminal_failed') return { title: 'Processing needs attention', body: job.lastErrorMessage ?? 'Open Home for recovery options.' };
  return { title: 'Processing…', body: 'ClassLens is still working on this.' };
}

export default function ProcessingScreen() {
  const params = useLocalSearchParams<{ jobId?: string | string[] }>();
  const jobId = Array.isArray(params.jobId) ? params.jobId[0] : params.jobId;
  const [job, setJob] = useState<ProcessingJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notifying, setNotifying] = useState(false);
  const requestSeq = useRef(0);

  const refresh = useCallback(async () => {
    if (!jobId) { setLoading(false); return null; }
    const seq = ++requestSeq.current;
    try {
      const current = await getProcessingJob(jobId);
      if (seq !== requestSeq.current) return current;
      setJob(current);
      setError('');
      return current;
    } catch (caught) {
      if (seq !== requestSeq.current) return null;
      setError(caught instanceof Error ? caught.message : 'Could not load processing.');
      return null;
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    // Only 'queued'/'uploading' are still phone-owned (see
    // processingOrchestrator.ts's resumeProcessingJobs). Anything past that
    // is owned by the process-job worker -- re-running the claim RPC here on
    // every screen mount contends with the worker's own claim/PATCH on the
    // same row instead of just observing it.
    void refresh().then((current) => {
      if (jobId && current && ['queued', 'uploading'].includes(current.stage)) {
        void runProcessingJob(jobId, 'screen').then(refresh);
      }
    });
    const off = onProcessingJobsChange(() => { void refresh(); });
    const timer = setInterval(() => { void refresh(); }, 1500);
    return () => { off(); clearInterval(timer); };
  }, [jobId, refresh]);

  async function retry() {
    if (!job) return;
    try { await retryProcessingJob(job.id); await runProcessingJob(job.id, 'retry'); await refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Retry could not start.'); }
  }

  async function enableNotifications() {
    setNotifying(true);
    const allowed = await requestProcessingNotificationPermission().catch(() => false);
    if (allowed) void registerDeviceToken().catch(() => undefined);
    setNotifying(false);
    setError(allowed ? '' : 'Notifications are off. Home will continue to show this job.');
  }

  const status = copy(job);
  const overloaded = job?.lastErrorCode === 'GEMINI_ALL_BUSY';
  const active = job && (['queued', 'uploading', 'uploaded', 'analyzing', 'filing'].includes(job.stage) || overloaded);
  return (
    <Screen>
      <View style={styles.header}>
        <ThemedText type="smallBold" style={styles.eyebrow}>CLASSLENS PROCESSING</ThemedText>
        <ThemedText type="title" style={styles.title}>{status.title}</ThemedText>
        <ThemedText themeColor="textSecondary" accessibilityLiveRegion="polite">{status.body}</ThemedText>
      </View>
      <View style={styles.card}>
        {loading || active ? <ActivityIndicator color={Brand.forest} accessibilityLabel="Processing lecture" /> : <ThemedText style={styles.symbol}>{job?.stage === 'completed' ? '✓' : '!'}</ThemedText>}
        <View style={styles.cardCopy}>
          <ThemedText type="subtitle" style={styles.cardTitle}>{job ? `${job.uploadedCount}/${job.totalCount} pages saved` : 'Loading'}</ThemedText>
          {job?.suggestedCourseLabel ? <ThemedText type="small" style={styles.cardSubtitle}>Suggestion: {job.suggestedCourseLabel} · {Math.round((job.matchConfidence ?? 0) * 100)}%</ThemedText> : null}
          {error ? <ThemedText style={styles.error} accessibilityLiveRegion="polite">{error}</ThemedText> : null}
        </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Return Home while processing continues" onPress={() => router.replace('/')} style={styles.primary}><ThemedText style={styles.primaryText}>Continue on Home</ThemedText></Pressable>
      {job?.stage === 'course_needed' ? <Pressable accessibilityRole="button" accessibilityLabel="Choose course" onPress={() => router.push({ pathname: '/course-resolution' as never, params: { jobId: job.id } } as never)} style={styles.secondary}><ThemedText style={styles.secondaryText}>Choose course</ThemedText></Pressable> : null}
      {job?.stage === 'retryable_failed' && !overloaded ? <Pressable accessibilityRole="button" accessibilityLabel="Retry processing" onPress={retry} style={styles.secondary}><ThemedText style={styles.secondaryText}>Retry</ThemedText></Pressable> : null}
      {job?.stage === 'completed' && job.lectureId ? <Pressable accessibilityRole="button" accessibilityLabel="Open notes" onPress={() => router.replace({ pathname: '/lecture/[id]', params: { id: job.lectureId! } })} style={styles.secondary}><ThemedText style={styles.secondaryText}>Open notes</ThemedText></Pressable> : null}
      {job && !['completed', 'terminal_failed'].includes(job.stage) ? <Pressable accessibilityRole="button" accessibilityLabel="Notify me when processing changes" disabled={notifying} onPress={enableNotifications} style={styles.link}><ThemedText style={styles.linkText}>{notifying ? 'Opening notification settings…' : 'Notify me when ready'}</ThemedText></Pressable> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 12 }, eyebrow: { color: Brand.forest, letterSpacing: 1.2 }, title: { fontFamily: Fonts.serif, fontWeight: '400' },
  card: { minHeight: 96, borderRadius: 22, padding: 18, backgroundColor: '#E8EFDE', flexDirection: 'row', alignItems: 'center', gap: 15 }, cardCopy: { flex: 1, gap: 5 },
  symbol: { color: Brand.forest, fontSize: 26, fontWeight: '800' }, error: { color: '#8C3B3B' },
  cardTitle: { color: Brand.ink }, cardSubtitle: { color: Brand.forest },
  primary: { minHeight: 54, borderRadius: 17, backgroundColor: Brand.forest, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: '#FFFFFF', fontWeight: '800' },
  secondary: { minHeight: 50, borderRadius: 16, borderWidth: 1, borderColor: Brand.forest, alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: Brand.forest, fontWeight: '800' },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' }, linkText: { color: Brand.forest, fontWeight: '700' },
});

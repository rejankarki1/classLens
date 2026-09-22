import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Brand } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { InboxEvent, ProcessingJob } from '@/types';
import { ThemedText } from './themed-text';
import { runProcessingJob } from '@/services/processingOrchestrator';
import {
  getActiveProcessingJobs,
  getInboxEvents,
  onProcessingJobsChange,
  retryProcessingJob,
} from '@/services/processingJobs';

// Session G: replaces the old low-contrast "recent jobs" card, which re-showed
// the same completion forever (or dropped it once 3 newer jobs pushed it out)
// with no durable record. Two sources, both read-only here:
//  - active jobs: still in flight, not yet at a durable outcome.
//  - inbox events: one durable row per job that reached a notable outcome
//    (completed/course_needed/terminal_failed), created only by the database
//    trigger in supabase/migrations/20260922050000_inbox_events.sql -- never
//    written by this screen.

function activeLabel(job: ProcessingJob): string {
  if (job.stage === 'uploading') return `Uploading ${job.uploadedCount} of ${job.totalCount} pages…`;
  if (job.stage === 'uploaded') return 'Waiting to be processed…';
  if (job.stage === 'analyzing') return 'Analyzing your lecture…';
  if (job.stage === 'filing') return 'Building your notebook…';
  if (job.stage === 'queued') return 'Lecture queued';
  return job.lastErrorMessage ?? 'Processing needs attention';
}

type InboxCopy = { title: string; subtitle: string | null; accent: string; action: string };

function inboxCopy(event: InboxEvent): InboxCopy {
  if (event.eventType === 'ready') {
    return { title: 'Notes successfully filed', subtitle: event.job.suggestedCourseLabel, accent: Brand.forest, action: 'Open notes' };
  }
  if (event.eventType === 'course_needed') {
    return { title: 'Course needed', subtitle: event.job.suggestedCourseLabel, accent: '#B08A2E', action: 'Choose course' };
  }
  return { title: event.job.lastErrorMessage ?? 'Processing needs attention', subtitle: null, accent: '#8C3B3B', action: 'Review' };
}

function openInboxEvent(event: InboxEvent) {
  if (event.eventType === 'course_needed') {
    router.push({ pathname: '/course-resolution' as never, params: { jobId: event.job.id } } as never);
  } else if (event.eventType === 'ready' && event.job.lectureId) {
    router.push({ pathname: '/lecture/[id]', params: { id: event.job.lectureId } });
  } else {
    router.push({ pathname: '/processing', params: { jobId: event.job.id } });
  }
}

export function HomeInbox() {
  const theme = useTheme();
  const [events, setEvents] = useState<InboxEvent[]>([]);
  const [active, setActive] = useState<ProcessingJob[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void getInboxEvents(10).then(setEvents).catch(() => setEvents([]));
    void getActiveProcessingJobs(5).then(setActive).catch(() => setActive([]));
  }, []);

  useFocusEffect(useCallback(() => {
    refresh();
    return onProcessingJobsChange(refresh);
  }, [refresh]));

  if (!events.length && !active.length) return null;

  async function retry(job: ProcessingJob) {
    setBusy(job.id);
    try { await retryProcessingJob(job.id); await runProcessingJob(job.id, 'retry'); refresh(); }
    finally { setBusy(null); }
  }

  return (
    <View style={styles.shell} accessibilityLabel="Inbox and processing status">
      <ThemedText type="smallBold" style={styles.eyebrow}>INBOX</ThemedText>

      {active.map((job) => (
        <View key={job.id} style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
          <View style={[styles.dot, { backgroundColor: theme.textSecondary }]} />
          <View style={styles.copy}>
            <ThemedText style={styles.title}>{activeLabel(job)}</ThemedText>
            {job.suggestedCourseLabel ? (
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{job.suggestedCourseLabel}</ThemedText>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={job.stage === 'retryable_failed' ? 'Retry processing this lecture' : 'View processing status'}
            accessibilityState={{ disabled: busy === job.id }}
            disabled={busy === job.id}
            onPress={() => {
              if (job.stage === 'retryable_failed') void retry(job);
              else router.push({ pathname: '/processing', params: { jobId: job.id } });
            }}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <ThemedText style={styles.actionText}>
              {busy === job.id ? 'Retrying…' : job.stage === 'retryable_failed' ? 'Retry' : 'View'}
            </ThemedText>
          </Pressable>
        </View>
      ))}

      {events.map((event) => {
        const copy = inboxCopy(event);
        return (
          <View key={event.id} style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
            <View style={[styles.dot, { backgroundColor: copy.accent }]} />
            <View style={styles.copy}>
              <ThemedText style={styles.title}>{copy.title}</ThemedText>
              {copy.subtitle ? (
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{copy.subtitle}</ThemedText>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${copy.action} for ${copy.title}`}
              onPress={() => openInboxEvent(event)}
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            >
              <ThemedText style={styles.actionText}>{copy.action}</ThemedText>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { gap: 10 },
  eyebrow: { color: Brand.forest, letterSpacing: 1 },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16 },
  dot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  title: { fontWeight: '700' },
  action: { minHeight: 40, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 12, backgroundColor: Brand.forest },
  actionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.65 },
});

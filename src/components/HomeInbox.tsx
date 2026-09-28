import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Brand } from '@/constants/theme';
import { SectionHeader } from '@/components/ui/Editorial';
import type { InboxEvent, ProcessingJob } from '@/types';
import { ThemedText } from './themed-text';
import { getActiveProcessingJobs, getInboxEvents, onProcessingJobsChange } from '@/services/processingJobs';

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
  if (stage === 'filing') return 'Finishing your notebook…';
  if (stage === 'analyzing') return 'Reading your lecture…';
  return 'Uploading your lecture…';
}

type InboxCopy = { title: string; subtitle: string | null; action: string };

function inboxCopy(event: InboxEvent): InboxCopy {
  if (event.eventType === 'course_needed') {
    return { title: 'Course needed', subtitle: event.job.suggestedCourseLabel, action: 'Choose course' };
  }
  return { title: event.job.lastErrorMessage ?? 'This lecture needs a new capture', subtitle: null, action: 'Review' };
}

function openInboxEvent(event: InboxEvent) {
  if (event.eventType === 'course_needed') {
    router.push({ pathname: '/course-resolution' as never, params: { jobId: event.job.id } } as never);
  } else {
    router.push({ pathname: '/processing', params: { jobId: event.job.id } });
  }
}

export function HomeInbox() {
  const [events, setEvents] = useState<InboxEvent[]>([]);
  const [active, setActive] = useState<ProcessingJob[]>([]);

  const refresh = useCallback(() => {
    void getInboxEvents(10).then(setEvents).catch(() => setEvents([]));
    void getActiveProcessingJobs(5).then(setActive).catch(() => setActive([]));
  }, []);

  useFocusEffect(useCallback(() => {
    refresh();
    return onProcessingJobsChange(refresh);
  }, [refresh]));

  const needsInput = events.filter((event) => event.eventType === 'course_needed' || event.eventType === 'final_failure');

  if (!active.length && !needsInput.length) return null;

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

      {needsInput.length ? (
        <View style={styles.needsInput}>
          <SectionHeader title="Needs your input" />
          {needsInput.map((event) => {
            const copy = inboxCopy(event);
            return (
              <Pressable
                key={event.id}
                accessibilityRole="button"
                accessibilityLabel={`${copy.action} for ${copy.title}`}
                onPress={() => openInboxEvent(event)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <View style={styles.copy}>
                  <ThemedText style={styles.title}>{copy.title}</ThemedText>
                  {copy.subtitle ? (
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{copy.subtitle}</ThemedText>
                  ) : null}
                </View>
                <ThemedText style={styles.actionText}>{copy.action}</ThemedText>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { gap: 14 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusText: { color: Brand.forest, fontWeight: '600' },
  needsInput: { gap: 10 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: '#F6EFDC' },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  title: { fontWeight: '700' },
  actionText: { color: Brand.forest, fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.65 },
});

import * as Notifications from 'expo-notifications';

import type { ProcessingJob, ProcessingJobEvent } from '@/types';
import { claimProcessingNotification } from './processingJobs';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function requestProcessingNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: false, allowSound: false } });
  return requested.granted || requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}
async function notificationsAllowed(): Promise<boolean> {
  const status = await Notifications.getPermissionsAsync();
  return status.granted || status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function notifyProcessingJob(job: ProcessingJob, event: ProcessingJobEvent): Promise<void> {
  try {
    if (!(await notificationsAllowed())) return;
    if (!(await claimProcessingNotification(job.id, event))) return;
    const content = event === 'completed'
      ? { title: 'Your notes are ready', body: 'ClassLens filed your lecture notes.', route: `/lecture/${job.lectureId}` }
      : event === 'course_needed'
        ? { title: 'Course needed', body: 'Choose an enrolled course to finish filing your notes.', route: `/course-resolution?jobId=${job.id}` }
        : { title: 'Processing needs attention', body: 'Open ClassLens to retry your lecture.', route: `/processing?jobId=${job.id}` };
    await Notifications.scheduleNotificationAsync({
      identifier: `processing-${job.id}-${event}`,
      content: { title: content.title, body: content.body, data: { jobId: job.id, route: content.route } },
      trigger: null,
    });
  } catch {
    // Notifications are optional; Home remains the recovery path.
  }
}

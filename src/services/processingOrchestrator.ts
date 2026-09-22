import { randomUUID } from 'expo-crypto';

import { MAX_PROCESSING_FAILURES } from '@/features/processing/stateMachine';
import type { ProcessingJob, ProcessingTrigger, ResumableProcessingStage } from '@/types';
import { uploadCapture } from './materials';
import { getStagedCaptureSession, removeStagedPhoto } from './processingLocal';
import {
  claimProcessingJob,
  getJobCaptureIds,
  getProcessingJob,
  getRunnableProcessingJobs,
  notifyProcessingJobsChanged,
  updateProcessingJob,
} from './processingJobs';
import { notifyProcessingJob } from './processingNotifications';

// Post-upload work (analysis, course matching, filing) is owned entirely by
// the process-job worker Edge Function -- proven end-to-end on a physical
// device (force-quit immediately after reaching 'uploaded', worker completed
// filing with zero further phone involvement; see docs/CLASSLENS_IMPLEMENTATION_PLAN.md
// Session C/D exit conditions). The phone's job stops at the upload boundary:
// stage the job as 'uploaded' and nudge the worker.
async function triggerWorker(): Promise<void> {
  try {
    const { supabase } = await import('@/lib/supabase');
    await supabase.functions.invoke('process-job', { method: 'POST' });
  } catch {
    // Best-effort nudge only. A force-quit right after this call does not
    // cancel the in-flight request server-side; Session D's pg_cron sweep is
    // the correctness backstop if this never reaches the server at all.
  }
}

type Failure = { code: string; message: string; retryable: boolean };

function safeFailure(error: unknown): Failure {
  const raw = error instanceof Error ? error.message : '';
  const upper = raw.toUpperCase();
  if (upper.includes('UNSUPPORTED') || upper.includes('BLOCKED') || upper.includes('OWNERSHIP') || upper.includes('INVALID')) {
    return { code: 'PROCESSING_TERMINAL', message: 'This lecture cannot be processed automatically.', retryable: false };
  }
  if (upper.includes('SIGNED OUT') || upper.includes('SIGN IN')) {
    return { code: 'AUTH_REQUIRED', message: 'Sign in again to continue processing.', retryable: true };
  }
  if (upper.includes('QUOTA') || upper.includes('429')) {
    return { code: 'PROVIDER_BUSY', message: 'Analysis is busy right now. Try again shortly.', retryable: true };
  }
  return { code: 'PROCESSING_INTERRUPTED', message: 'Processing was interrupted. Your saved work can be retried.', retryable: true };
}
async function failJob(job: ProcessingJob, token: string, error: unknown): Promise<ProcessingJob> {
  const failure = safeFailure(error);
  const retryable = failure.retryable && job.retryCount + 1 < MAX_PROCESSING_FAILURES;
  const values = retryable
    ? {
        stage: 'retryable_failed', resume_stage: job.stage as ResumableProcessingStage,
        retry_count: job.retryCount + 1, last_error_code: failure.code,
        last_error_message: failure.message, runner_token: null, lease_expires_at: null,
      }
    : {
        stage: 'terminal_failed', resume_stage: null, retry_count: Math.min(MAX_PROCESSING_FAILURES, job.retryCount + 1),
        last_error_code: failure.code, last_error_message: failure.message,
        runner_token: null, lease_expires_at: null,
      };
  const failed = await updateProcessingJob(job.id, token, values);
  await notifyProcessingJob(failed, 'failure');
  return failed;
}

export async function runProcessingJob(jobId: string, _trigger: ProcessingTrigger): Promise<ProcessingJob | null> {
  const token = randomUUID();
  let job = await claimProcessingJob(jobId, token);
  if (!job) return getProcessingJob(jobId);

  try {
    if (job.mediaType !== 'photo') {
      return updateProcessingJob(job.id, token, {
        stage: 'terminal_failed', resume_stage: null, retry_count: job.retryCount,
        last_error_code: 'UNSUPPORTED_MEDIA', last_error_message: `${job.mediaType} processing is not available yet.`,
        runner_token: null, lease_expires_at: null,
      });
    }

    if (job.stage === 'queued') job = await updateProcessingJob(job.id, token, { stage: 'uploading' });

    if (job.stage === 'uploading') {
      const staged = getStagedCaptureSession(job.id, job.ownerId);
      const existingIds = await getJobCaptureIds(job.id);
      if (!staged && existingIds.length !== job.totalCount) throw new Error('A staged lecture page is no longer available.');
      let uploadedCount = existingIds.length;
      for (const photo of staged?.photos ?? []) {
        await uploadCapture({
          processingJobId: job.id,
          sessionId: job.captureSessionId,
          clientPhotoId: photo.id,
          pageNumber: photo.pageNumber,
          uri: photo.uri,
          mimeType: photo.mimeType,
          capturedAt: photo.capturedAt,
          quality: photo.quality,
        });
        uploadedCount = (await getJobCaptureIds(job.id)).length;
        job = await updateProcessingJob(job.id, token, { stage: 'uploading', uploaded_count: uploadedCount });
        removeStagedPhoto(job.id, job.ownerId, photo.id);
      }
      if (uploadedCount !== job.totalCount) throw new Error('Not every lecture page was uploaded.');
      job = await updateProcessingJob(job.id, token, {
        stage: 'uploaded', uploaded_count: uploadedCount, runner_token: null, lease_expires_at: null,
      });
      void triggerWorker();
      return job;
    }
    return job;
  } catch (error) {
    const latest = await getProcessingJob(job.id);
    if (!latest || ['completed', 'course_needed', 'retryable_failed', 'terminal_failed'].includes(latest.stage)) return latest;
    return failJob(latest, token, error);
  } finally {
    notifyProcessingJobsChanged();
  }
}

export async function resumeProcessingJobs(trigger: ProcessingTrigger, limit = trigger === 'background' ? 1 : 3): Promise<void> {
  const jobs = await getRunnableProcessingJobs(limit);
  for (const job of jobs) await runProcessingJob(job.id, trigger);
}

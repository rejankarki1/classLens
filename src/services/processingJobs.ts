import { randomUUID } from 'expo-crypto';

import type { CaptureSession } from '@/features/capture/captureSession';
import type {
  ProcessingJob,
  ProcessingJobEvent,
  ProcessingJobStage,
  ResumableProcessingStage,
} from '@/types';
import { getCurrentUserId } from './auth';
import { stageCaptureSession } from './processingLocal';

type JobRow = {
  id: string; owner_id: string; capture_session_id: string; media_type: ProcessingJob['mediaType'];
  stage: ProcessingJobStage; resume_stage: ResumableProcessingStage | null; uploaded_count: number;
  total_count: number; retry_count: number; last_error_code: string | null; last_error_message: string | null;
  course_id: string | null; suggested_course_id: string | null; suggested_course_label: string | null;
  match_confidence: number | null; match_explanation: string | null; capture_analysis_id: string | null;
  lecture_id: string | null; created_at: string; updated_at: string; completed_at: string | null;
};

export const processingJobColumns = 'id, owner_id, capture_session_id, media_type, stage, resume_stage, uploaded_count, total_count, retry_count, last_error_code, last_error_message, course_id, suggested_course_id, suggested_course_label, match_confidence, match_explanation, capture_analysis_id, lecture_id, created_at, updated_at, completed_at';

function fromRow(row: JobRow): ProcessingJob {
  return {
    id: row.id, ownerId: row.owner_id, captureSessionId: row.capture_session_id, mediaType: row.media_type,
    stage: row.stage, resumeStage: row.resume_stage, uploadedCount: row.uploaded_count, totalCount: row.total_count,
    retryCount: row.retry_count, lastErrorCode: row.last_error_code, lastErrorMessage: row.last_error_message,
    courseId: row.course_id, suggestedCourseId: row.suggested_course_id, suggestedCourseLabel: row.suggested_course_label,
    matchConfidence: row.match_confidence, matchExplanation: row.match_explanation,
    captureAnalysisId: row.capture_analysis_id, lectureId: row.lecture_id,
    createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at,
  };
}

const listeners = new Set<() => void>();
export function onProcessingJobsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function notifyProcessingJobsChanged() { listeners.forEach((listener) => listener()); }

async function client() {
  const { supabase } = await import('@/lib/supabase');
  return supabase;
}

export async function enqueuePhotoProcessingJob(session: CaptureSession): Promise<ProcessingJob> {
  const ownerId = await getCurrentUserId();
  if (!ownerId) throw new Error('Sign in before processing lecture photos.');
  const supabase = await client();
  const existing = await supabase.from('processing_jobs').select(processingJobColumns)
    .eq('capture_session_id', session.id).returns<JobRow[]>().maybeSingle();
  if (existing.error) throw new Error(`Could not check the processing job: ${existing.error.message}`);
  if (existing.data) {
    await stageCaptureSession(existing.data.id, ownerId, session);
    return fromRow(existing.data);
  }

  const id = randomUUID();
  await stageCaptureSession(id, ownerId, session);
  const inserted = await supabase.from('processing_jobs').insert({
    id, capture_session_id: session.id, media_type: 'photo', total_count: session.photos.length,
  }).select(processingJobColumns).returns<JobRow[]>().single();
  if (inserted.error || !inserted.data) {
    const raced = await supabase.from('processing_jobs').select(processingJobColumns)
      .eq('capture_session_id', session.id).returns<JobRow[]>().maybeSingle();
    if (!raced.data) throw new Error(`Could not save the processing job: ${inserted.error?.message ?? 'No saved job returned.'}`);
    await stageCaptureSession(raced.data.id, ownerId, session);
    notifyProcessingJobsChanged();
    return fromRow(raced.data);
  }
  notifyProcessingJobsChanged();
  return fromRow(inserted.data);
}

export async function getProcessingJob(id: string): Promise<ProcessingJob | null> {
  const supabase = await client();
  const { data, error } = await supabase.from('processing_jobs').select(processingJobColumns)
    .eq('id', id).returns<JobRow[]>().maybeSingle();
  if (error) throw new Error(`Could not load processing job: ${error.message}`);
  return data ? fromRow(data) : null;
}

export async function getRecentProcessingJobs(limit = 8): Promise<ProcessingJob[]> {
  const supabase = await client();
  const { data, error } = await supabase.from('processing_jobs').select(processingJobColumns)
    .order('updated_at', { ascending: false }).limit(limit).returns<JobRow[]>();
  if (error) throw new Error(`Could not load processing jobs: ${error.message}`);
  return data.map(fromRow);
}

export async function getRunnableProcessingJobs(limit = 3): Promise<ProcessingJob[]> {
  const supabase = await client();
  const { data, error } = await supabase.from('processing_jobs').select(processingJobColumns)
    .in('stage', ['queued', 'uploading'])
    .order('created_at').limit(limit).returns<JobRow[]>();
  if (error) throw new Error(`Could not load unfinished processing jobs: ${error.message}`);
  return data.map(fromRow);
}

export async function updateProcessingJob(id: string, runnerToken: string | null, values: Record<string, unknown>): Promise<ProcessingJob> {
  const supabase = await client();
  let query = supabase.from('processing_jobs').update({ ...values, updated_at: new Date().toISOString() }).eq('id', id);
  if (runnerToken) query = query.eq('runner_token', runnerToken);
  const { data, error } = await query.select(processingJobColumns).returns<JobRow[]>().maybeSingle();
  if (error) throw new Error(`Could not update processing job: ${error.message}`);
  if (!data) throw new Error('Processing job lease was lost.');
  notifyProcessingJobsChanged();
  return fromRow(data);
}

export async function claimProcessingJob(id: string, token: string): Promise<ProcessingJob | null> {
  const supabase = await client();
  const { data, error } = await supabase.rpc('claim_processing_job', { p_job_id: id, p_runner_token: token });
  if (error) throw new Error(`Could not claim processing job: ${error.message}`);
  const rows = data as unknown as JobRow[] | null;
  return rows?.[0] ? fromRow(rows[0]) : null;
}

export async function chooseProcessingJobCourse(id: string, courseId: string): Promise<ProcessingJob> {
  const job = await getProcessingJob(id);
  if (!job || job.stage !== 'course_needed') throw new Error('This processing job does not need a course.');
  return updateProcessingJob(id, null, { stage: 'filing', course_id: courseId, resume_stage: null, last_error_code: null, last_error_message: null });
}

export async function retryProcessingJob(id: string): Promise<ProcessingJob> {
  const job = await getProcessingJob(id);
  if (!job || job.stage !== 'retryable_failed' || !job.resumeStage) throw new Error('This processing job cannot be retried.');
  if (job.retryCount >= 3) return updateProcessingJob(id, null, { stage: 'terminal_failed', resume_stage: null });
  return updateProcessingJob(id, null, { stage: job.resumeStage, resume_stage: null, last_error_code: null, last_error_message: null, runner_token: null, lease_expires_at: null });
}

const notificationColumn: Record<ProcessingJobEvent, string> = {
  course_needed: 'course_needed_notified_at', failure: 'failure_notified_at', completed: 'completed_notified_at',
};

export async function claimProcessingNotification(id: string, event: ProcessingJobEvent): Promise<boolean> {
  const supabase = await client();
  const column = notificationColumn[event];
  const { data, error } = await supabase.from('processing_jobs').update({ [column]: new Date().toISOString() })
    .eq('id', id).is(column, null).select('id').maybeSingle();
  if (error) return false;
  return Boolean(data);
}

export async function getCaptureAnalysisRecord(sessionId: string): Promise<{ id: string; analysis: unknown } | null> {
  const supabase = await client();
  const { data, error } = await supabase.from('capture_analyses').select('id, analysis')
    .eq('capture_session_id', sessionId).returns<{ id: string; analysis: unknown }[]>().maybeSingle();
  if (error) throw new Error(`Could not load saved capture analysis: ${error.message}`);
  return data;
}

export async function getJobCaptureIds(jobId: string): Promise<string[]> {
  const supabase = await client();
  const { data, error } = await supabase.from('captures').select('id, page_number')
    .eq('processing_job_id', jobId).order('page_number').returns<{ id: string; page_number: number }[]>();
  if (error) throw new Error(`Could not load uploaded captures: ${error.message}`);
  return data.map((row) => row.id);
}

export async function fileProcessingJob(id: string, runnerToken: string): Promise<string> {
  const supabase = await client();
  const { data, error } = await supabase.rpc('file_processing_job', { p_job_id: id, p_runner_token: runnerToken });
  if (error || typeof data !== 'string') throw new Error(`Could not file the lecture notebook: ${error?.message ?? 'No lecture ID returned.'}`);
  notifyProcessingJobsChanged();
  return data;
}

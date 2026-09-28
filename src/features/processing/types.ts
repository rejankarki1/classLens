import type { CaptureAnalysis, Course } from '@/types';

export type ProcessingMediaType = 'photo' | 'audio' | 'video';

export type ProcessingJobStage =
  | 'queued'
  | 'uploading'
  | 'uploaded'
  | 'analyzing'
  | 'course_needed'
  | 'filing'
  | 'completed'
  | 'retryable_failed'
  | 'terminal_failed';

export type ResumableProcessingStage = 'queued' | 'uploading' | 'analyzing' | 'filing';
export type ProcessingTrigger = 'immediate' | 'screen' | 'foreground' | 'background' | 'retry';

export type ProcessingJob = {
  id: string;
  ownerId: string;
  captureSessionId: string;
  mediaType: ProcessingMediaType;
  stage: ProcessingJobStage;
  resumeStage: ResumableProcessingStage | null;
  uploadedCount: number;
  totalCount: number;
  retryCount: number;
  overloadRetryCount: number;
  overloadStartedAt: string | null;
  nextAttemptAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  courseId: string | null;
  suggestedCourseId: string | null;
  suggestedCourseLabel: string | null;
  matchConfidence: number | null;
  matchExplanation: string | null;
  captureAnalysisId: string | null;
  lectureId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type CourseMatch = {
  course: Course | null;
  confidence: number;
  explanation: string;
  automatic: boolean;
};

export type PhotoProcessingInput = {
  captureIds: string[];
  analysis: CaptureAnalysis;
};

export type ProcessingJobEvent = 'course_needed' | 'failure' | 'completed';

/** Session G: durable, server-created inbox rows -- see inbox_events (owner-only reads). */
export type InboxEventType = 'ready' | 'course_needed' | 'final_failure';

export type InboxEvent = {
  id: string;
  eventType: InboxEventType;
  createdAt: string;
  job: ProcessingJob;
};

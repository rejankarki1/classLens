import type { ProcessingJobStage } from './types';

export const MAX_PROCESSING_FAILURES = 3;

const transitions: Record<ProcessingJobStage, readonly ProcessingJobStage[]> = {
  queued: ['uploading', 'terminal_failed'],
  uploading: ['uploading', 'uploaded', 'analyzing', 'retryable_failed', 'terminal_failed'],
  uploaded: ['uploaded', 'analyzing', 'terminal_failed'],
  analyzing: ['analyzing', 'course_needed', 'filing', 'retryable_failed', 'terminal_failed'],
  course_needed: ['filing', 'terminal_failed'],
  filing: ['filing', 'completed', 'retryable_failed', 'terminal_failed'],
  completed: [],
  retryable_failed: ['queued', 'uploading', 'analyzing', 'filing', 'terminal_failed'],
  terminal_failed: [],
};

export function canTransitionProcessingJob(from: ProcessingJobStage, to: ProcessingJobStage): boolean {
  return transitions[from].includes(to);
}
export function assertProcessingJobTransition(from: ProcessingJobStage, to: ProcessingJobStage): void {
  if (!canTransitionProcessingJob(from, to)) {
    throw new Error(`Invalid processing job transition: ${from} to ${to}.`);
  }
}

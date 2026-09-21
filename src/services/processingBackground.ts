import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { resumeProcessingJobs } from './processingOrchestrator';

export const PROCESSING_BACKGROUND_TASK = 'classlens-durable-processing';

if (!TaskManager.isTaskDefined(PROCESSING_BACKGROUND_TASK)) {
  TaskManager.defineTask(PROCESSING_BACKGROUND_TASK, async () => {
    try {
      await resumeProcessingJobs('background', 1);
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function registerProcessingBackgroundTask(): Promise<boolean> {
  if (!(await TaskManager.isAvailableAsync())) return false;
  if (!(await TaskManager.isTaskRegisteredAsync(PROCESSING_BACKGROUND_TASK))) {
    await BackgroundTask.registerTaskAsync(PROCESSING_BACKGROUND_TASK, { minimumInterval: 15 });
  }
  return true;
}

export async function unregisterProcessingBackgroundTask(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(PROCESSING_BACKGROUND_TASK)) {
    await BackgroundTask.unregisterTaskAsync(PROCESSING_BACKGROUND_TASK);
  }
}

export async function triggerProcessingBackgroundTaskForTesting(): Promise<boolean> {
  if (!__DEV__) return false;
  return BackgroundTask.triggerTaskWorkerForTestingAsync();
}

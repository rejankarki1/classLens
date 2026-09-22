const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');

const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, 'processingOrchestrator.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const base = {
  id: 'job', ownerId: 'owner', captureSessionId: 'session', mediaType: 'photo', stage: 'queued', resumeStage: null,
  uploadedCount: 0, totalCount: 1, retryCount: 0, lastErrorCode: null, lastErrorMessage: null, courseId: null,
  suggestedCourseId: null, suggestedCourseLabel: null, matchConfidence: null, matchExplanation: null,
  captureAnalysisId: null, lectureId: null, createdAt: '', updatedAt: '', completedAt: null,
};
let job = { ...base };
let claimable = true;
let staged = null;
let jobCaptureIds = [];
let uploadCalls = 0;
let triggerCalls = 0;
let notifications = [];

function apply(values) {
  const map = { resume_stage: 'resumeStage', uploaded_count: 'uploadedCount', retry_count: 'retryCount', last_error_code: 'lastErrorCode', last_error_message: 'lastErrorMessage', course_id: 'courseId', suggested_course_id: 'suggestedCourseId', suggested_course_label: 'suggestedCourseLabel', match_confidence: 'matchConfidence', match_explanation: 'matchExplanation', capture_analysis_id: 'captureAnalysisId', lecture_id: 'lectureId', completed_at: 'completedAt' };
  for (const [key, value] of Object.entries(values)) job[map[key] ?? key] = value;
  return { ...job };
}

const mocks = {
  'expo-crypto': { randomUUID: () => 'runner-token' },
  '@/features/processing/stateMachine': { MAX_PROCESSING_FAILURES: 3 },
  '@/types': {},
  '@/lib/supabase': { supabase: { functions: { invoke: async () => { triggerCalls += 1; } } } },
  './materials': { uploadCapture: async (input) => { uploadCalls += 1; jobCaptureIds.push(`capture-${input.pageNumber}`); } },
  './processingLocal': { getStagedCaptureSession: () => staged, removeStagedPhoto: () => {} },
  './processingNotifications': { notifyProcessingJob: async (_job, event) => { notifications.push(event); } },
  './processingJobs': {
    claimProcessingJob: async () => claimable ? { ...job } : null,
    getProcessingJob: async () => ({ ...job }),
    updateProcessingJob: async (_id, _token, values) => apply(values),
    getJobCaptureIds: async () => [...jobCaptureIds],
    getRunnableProcessingJobs: async () => [{ ...job }],
    notifyProcessingJobsChanged: () => {},
  },
};

const serviceExports = {};
vm.runInNewContext(code, { exports: serviceExports, require: (name) => {
  if (!(name in mocks)) throw new Error(`Unexpected import: ${name}`);
  return mocks[name];
}, Error });

(async () => {
  // Post-upload work (analysis, matching, filing) is entirely the worker's
  // job now -- the phone's orchestrator only drives the job up to 'uploaded'
  // and nudges the worker. Reuse case: every page is already an uploaded
  // capture row, nothing local to stage -- must reach 'uploaded' without
  // re-uploading, and clear the lease so the worker can claim immediately.
  job = { ...base, stage: 'uploading', uploadedCount: 1, totalCount: 1 };
  staged = null;
  jobCaptureIds = ['capture-1'];
  const reused = await serviceExports.runProcessingJob('job', 'foreground');
  assert.equal(reused.stage, 'uploaded');
  assert.equal(reused.runner_token, null, 'lease must be cleared so the worker can claim immediately');
  assert.equal(reused.lease_expires_at, null, 'lease must be cleared so the worker can claim immediately');
  assert.equal(uploadCalls, 0, 'an already-uploaded page must not be re-uploaded');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(triggerCalls, 1, 'reaching uploaded must fire a best-effort worker trigger');

  // Fresh upload: staged photos present, each must actually upload and count
  // before the job reaches 'uploaded'.
  job = { ...base, stage: 'queued', uploadedCount: 0, totalCount: 2 };
  staged = { photos: [
    { id: 'p1', pageNumber: 1, uri: 'file://p1.jpg', mimeType: 'image/jpeg', capturedAt: 'now', quality: null },
    { id: 'p2', pageNumber: 2, uri: 'file://p2.jpg', mimeType: 'image/jpeg', capturedAt: 'now', quality: null },
  ] };
  jobCaptureIds = [];
  uploadCalls = 0;
  triggerCalls = 0;
  const fresh = await serviceExports.runProcessingJob('job', 'foreground');
  assert.equal(fresh.stage, 'uploaded');
  assert.equal(uploadCalls, 2, 'every staged photo must be uploaded exactly once');
  assert.equal(fresh.uploadedCount, 2);
  assert.equal(triggerCalls, 1);

  // Claim unavailable: another runner already holds the lease -- must not
  // touch anything, just return the current row.
  claimable = false;
  triggerCalls = 0;
  const notClaimed = await serviceExports.runProcessingJob('job', 'background');
  assert.equal(notClaimed.stage, job.stage);
  assert.equal(triggerCalls, 0);
  claimable = true;

  // Re-entry after the job is already past uploading (worker-owned stages,
  // including a still-in-flight 'uploaded') must be a harmless passthrough
  // now that the phone doesn't drive analysis/matching/filing anymore.
  for (const stage of ['uploaded', 'analyzing', 'course_needed', 'filing', 'completed']) {
    job = { ...base, stage };
    staged = null;
    jobCaptureIds = [];
    triggerCalls = 0;
    const passthrough = await serviceExports.runProcessingJob('job', 'screen');
    assert.equal(passthrough.stage, stage, `${stage} must pass through unchanged`);
    assert.equal(triggerCalls, 0, `${stage} must not re-trigger the worker`);
  }

  // Unsupported media type still fails immediately, unchanged from before.
  job = { ...base, stage: 'queued', mediaType: 'audio' };
  const unsupported = await serviceExports.runProcessingJob('job', 'foreground');
  assert.equal(unsupported.stage, 'terminal_failed');
  assert.equal(unsupported.lastErrorCode, 'UNSUPPORTED_MEDIA');

  // A genuine upload failure (staged data missing, counts don't match --
  // e.g. a device/reinstall switch mid-session) still fails through the
  // normal retry/terminal path and notifies 'failure'.
  job = { ...base, stage: 'uploading', uploadedCount: 0, totalCount: 3, retryCount: 0 };
  staged = null;
  jobCaptureIds = ['capture-1'];
  notifications = [];
  const failed = await serviceExports.runProcessingJob('job', 'foreground');
  assert.equal(failed.stage, 'retryable_failed');
  assert.equal(failed.resumeStage, 'uploading');
  assert.deepEqual(notifications, ['failure']);

  // Foreground/background resume still calls the shared orchestrator per job.
  job = { ...base, stage: 'uploading', uploadedCount: 1, totalCount: 1 };
  staged = null;
  jobCaptureIds = ['capture-1'];
  triggerCalls = 0;
  await serviceExports.resumeProcessingJobs('foreground', 1);
  assert.equal(triggerCalls, 1, 'foreground resume calls the shared orchestrator');
  job = { ...base, stage: 'uploading', uploadedCount: 1, totalCount: 1 };
  jobCaptureIds = ['capture-1'];
  triggerCalls = 0;
  await serviceExports.resumeProcessingJobs('background', 1);
  assert.equal(triggerCalls, 1, 'background resume calls the shared orchestrator');

  console.log('PASS: upload-to-uploaded handoff, reuse, claim contention, passthrough for worker-owned stages, unsupported media, upload failure/retry, and resume sweep.');
})().catch((error) => { console.error(error); process.exitCode = 1; });

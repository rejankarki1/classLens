const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');

const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, 'processingOrchestrator.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const serviceExports = {};
const analysis = { sessionId: 'session', photos: [{ captureId: 'capture-1', pageNumber: 1, readability: 'clear', faithfulExtraction: 'notes', unclearSections: [] }], combinedSummary: 'summary', concepts: [], examples: [], assignments: [], examMentions: [], courseSignals: ['CS 3358'], topicSignals: [] };
const base = {
  id: 'job', ownerId: 'owner', captureSessionId: 'session', mediaType: 'photo', stage: 'analyzing', resumeStage: null,
  uploadedCount: 1, totalCount: 1, retryCount: 0, lastErrorCode: null, lastErrorMessage: null, courseId: null,
  suggestedCourseId: null, suggestedCourseLabel: null, matchConfidence: null, matchExplanation: null,
  captureAnalysisId: null, lectureId: null, createdAt: '', updatedAt: '', completedAt: null,
};
let job = { ...base };
let claimable = true;
let geminiCalls = 0;
let uploadCalls = 0;
let filingCalls = 0;
let notifications = 0;

function apply(values) {
  const map = { resume_stage: 'resumeStage', uploaded_count: 'uploadedCount', retry_count: 'retryCount', last_error_code: 'lastErrorCode', last_error_message: 'lastErrorMessage', course_id: 'courseId', suggested_course_id: 'suggestedCourseId', suggested_course_label: 'suggestedCourseLabel', match_confidence: 'matchConfidence', match_explanation: 'matchExplanation', capture_analysis_id: 'captureAnalysisId', lecture_id: 'lectureId', completed_at: 'completedAt' };
  for (const [key, value] of Object.entries(values)) job[map[key] ?? key] = value;
  return { ...job };
}

const mocks = {
  'expo-crypto': { randomUUID: () => 'runner-token' },
  '@/lib/captureAnalysis': { parseCaptureAnalysis: (value) => value },
  '@/features/processing/courseMatcher': { matchEnrolledCourse: () => ({ course: { id: 'cs', code: 'CS 3358', name: 'Data Structures' }, confidence: 0.95, explanation: 'Matched course code.', automatic: true }) },
  '@/features/processing/stateMachine': { MAX_PROCESSING_FAILURES: 3 },
  '@/types': {},
  './ai': { analyzeCaptures: async () => { geminiCalls += 1; return analysis; } },
  './enrollment': { getMyEnrolledCourses: async () => [] },
  './materials': { uploadCapture: async () => { uploadCalls += 1; } },
  './processingLocal': { getStagedCaptureSession: () => null, removeStagedPhoto: () => {} },
  './processingNotifications': { notifyProcessingJob: async () => { notifications += 1; } },
  './processingJobs': {
    claimProcessingJob: async () => claimable ? { ...job } : null,
    getProcessingJob: async () => ({ ...job }),
    updateProcessingJob: async (_id, _token, values) => apply(values),
    getJobCaptureIds: async () => ['capture-1'],
    getCaptureAnalysisRecord: async () => ({ id: 'analysis-id', analysis }),
    fileProcessingJob: async () => { filingCalls += 1; apply({ stage: 'completed', lecture_id: 'lecture-id', completed_at: 'now' }); return 'lecture-id'; },
    getRunnableProcessingJobs: async () => [{ ...job }],
    notifyProcessingJobsChanged: () => {},
  },
};

vm.runInNewContext(code, { exports: serviceExports, require: (name) => {
  if (!(name in mocks)) throw new Error(`Unexpected import: ${name}`);
  return mocks[name];
}, Error });

(async () => {
  const first = await serviceExports.runProcessingJob('job', 'foreground');
  assert.equal(first.stage, 'completed');
  assert.equal(first.lectureId, 'lecture-id');
  assert.equal(geminiCalls, 0, 'saved analysis must skip Gemini');
  assert.equal(uploadCalls, 0, 'uploaded capture must be reused');
  assert.equal(filingCalls, 1);
  assert.equal(notifications, 1);

  claimable = false;
  await serviceExports.runProcessingJob('job', 'background');
  assert.equal(filingCalls, 1, 'a second runner must not file again');
  assert.equal(geminiCalls, 0);

  job = { ...base, stage: 'filing', courseId: 'cs', captureAnalysisId: 'analysis-id' };
  claimable = true;
  await serviceExports.runProcessingJob('job', 'retry');
  assert.equal(filingCalls, 2, 'manual filing uses the saved analysis path');
  assert.equal(geminiCalls, 0);

  job = { ...base };
  await serviceExports.resumeProcessingJobs('foreground', 1);
  assert.equal(filingCalls, 3, 'foreground resume calls the shared orchestrator');
  job = { ...base };
  await serviceExports.resumeProcessingJobs('background', 1);
  assert.equal(filingCalls, 4, 'background resume calls the shared orchestrator');
  console.log('PASS: analysis/upload reuse, runner idempotency, manual filing, and foreground/background shared resume.');
})().catch((error) => { console.error(error); process.exitCode = 1; });

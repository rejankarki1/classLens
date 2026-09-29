const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');

const file = path.join(__dirname, 'processingJobs.ts');
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function load(supabase) {
  const serviceExports = {};
  vm.runInNewContext(code, {
    exports: serviceExports, Error, Set,
    require: (name) => {
      if (name === 'expo-crypto') return { randomUUID: () => 'unused' };
      if (name === './auth') return { getCurrentUserId: async () => 'unused' };
      if (name === './processingLocal') return { stageCaptureSession: async () => ({}) };
      if (name === '@/lib/supabase') return { supabase };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return serviceExports;
}

function jobRow(overrides = {}) {
  return {
    id: 'job-1', owner_id: 'owner-1', capture_session_id: 'session-1', media_type: 'photo',
    stage: 'analyzing', resume_stage: null, uploaded_count: 2, total_count: 2, retry_count: 0,
    last_error_code: null, last_error_message: null, course_id: null, suggested_course_id: null,
    suggested_course_label: null, match_confidence: null, match_explanation: null,
    capture_analysis_id: null, lecture_id: null, created_at: '2026-09-22T00:00:00.000Z',
    updated_at: '2026-09-22T00:00:00.000Z', completed_at: null, ...overrides,
  };
}

(async () => {
  // getActiveProcessingJobs: confirms the exact in-flight stage set (queued,
  // uploading, uploaded, analyzing, filing, retryable_failed) and that it
  // never includes the three inbox-owned outcomes.
  let requestedStages = null;
  const activeSupabase = {
    from: (table) => {
      assert.equal(table, 'processing_jobs');
      return {
        select: () => ({
          in: (column, stages) => {
            assert.equal(column, 'stage');
            requestedStages = stages;
            return { order: () => ({ limit: () => ({ returns: async () => ({ data: [jobRow()], error: null }) }) }) };
          },
        }),
      };
    },
  };
  const activeService = load(activeSupabase);
  const activeJobs = await activeService.getActiveProcessingJobs(5);
  // requestedStages is an array from inside the vm sandbox's realm, so
  // assert.deepEqual against a host-realm array literal can spuriously fail
  // on prototype identity even when the contents match -- compare via a
  // plain host-realm copy instead.
  assert.deepEqual(Array.from(requestedStages), ['queued', 'uploading', 'uploaded', 'analyzing', 'filing', 'retryable_failed']);
  assert.equal(activeJobs.length, 1);
  assert.equal(activeJobs[0].id, 'job-1');
  const stageList = Array.from(requestedStages);
  for (const outcome of ['completed', 'course_needed', 'terminal_failed']) assert.ok(!stageList.includes(outcome));
  console.log('PASS: getActiveProcessingJobs queries exactly the in-flight stages, excluding the three inbox outcomes.');

  // Foreground recovery targets only uploaded jobs whose lease is absent or expired.
  let uploadedStage = null;
  let uploadedLeaseFilter = null;
  const uploadedSupabase = {
    from: (table) => {
      assert.equal(table, 'processing_jobs');
      return {
        select: () => ({
          eq: (column, value) => {
            assert.equal(column, 'stage');
            uploadedStage = value;
            return {
              or: (filter) => {
                uploadedLeaseFilter = filter;
                return { order: () => ({ limit: () => ({ returns: async () => ({
                  data: [jobRow({ id: 'job-uploaded', stage: 'uploaded', lease_expires_at: null })], error: null,
                }) }) }) };
              },
            };
          },
        }),
      };
    },
  };
  const uploadedService = load(uploadedSupabase);
  const uploadedJobs = await uploadedService.getUnleasedUploadedProcessingJobs(3);
  assert.equal(uploadedStage, 'uploaded');
  assert.match(uploadedLeaseFilter, /^lease_expires_at\.is\.null,lease_expires_at\.lt\./);
  assert.equal(uploadedJobs[0].id, 'job-uploaded');
  console.log('PASS: foreground recovery queries unleased uploaded jobs for the authenticated RLS scope.');

  const busyService = load(activeSupabase);
  activeSupabase.from = () => ({
    select: () => ({
      in: () => ({ order: () => ({ limit: () => ({ returns: async () => ({ data: [jobRow({
        stage: 'retryable_failed', last_error_code: 'GEMINI_ALL_BUSY', updated_at: new Date().toISOString(),
      })], error: null }) }) }) }),
    }),
  });
  const busyJobs = await busyService.getActuallyActiveProcessingJobs(5);
  assert.equal(busyJobs.length, 1, 'Gemini capacity backoff must remain visible on Home');

  // getInboxEvents: maps the embedded processing_jobs join into a flat
  // InboxEvent, and silently drops a row whose job join came back null
  // (e.g. a race with the FK) rather than crashing the Home screen.
  const inboxRows = [
    { id: 'evt-1', event_type: 'ready', created_at: '2026-09-22T06:00:00.000Z', processing_jobs: jobRow({ id: 'job-ready', stage: 'completed', lecture_id: 'capture-job:job-ready', completed_at: '2026-09-22T05:58:00.000Z' }) },
    { id: 'evt-2', event_type: 'course_needed', created_at: '2026-09-22T05:00:00.000Z', processing_jobs: jobRow({ id: 'job-course', stage: 'course_needed', suggested_course_label: 'CS 3358' }) },
    { id: 'evt-3', event_type: 'final_failure', created_at: '2026-09-22T04:00:00.000Z', processing_jobs: null },
  ];
  let selectedColumns = null;
  const inboxSupabase = {
    from: (table) => {
      assert.equal(table, 'inbox_events');
      return {
        select: (columns) => {
          selectedColumns = columns;
          return { order: () => ({ limit: () => ({ returns: async () => ({ data: inboxRows, error: null }) }) }) };
        },
      };
    },
  };
  const inboxService = load(inboxSupabase);
  const events = await inboxService.getInboxEvents(10);
  assert.match(selectedColumns, /^id, event_type, created_at, processing_jobs \(/);
  assert.equal(events.length, 2, 'a row with no joined job must be dropped, not crash the mapping');
  assert.equal(events[0].id, 'evt-1');
  assert.equal(events[0].eventType, 'ready');
  assert.equal(events[0].job.id, 'job-ready');
  assert.equal(events[0].job.lectureId, 'capture-job:job-ready');
  assert.equal(events[1].eventType, 'course_needed');
  assert.equal(events[1].job.suggestedCourseLabel, 'CS 3358');
  console.log('PASS: getInboxEvents maps the joined job onto each event and drops rows with no joined job.');
})().catch((error) => { console.error(error); process.exitCode = 1; });

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');

const root = path.resolve(__dirname, '../../..');
const options = {
  strict: true, noEmit: true, skipLibCheck: true, types: [],
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
};
const program = ts.createProgram([path.join(__dirname, 'handler.ts')], options);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (value) => value,
    getCurrentDirectory: () => root,
    getNewLine: () => '\n',
  }));
  process.exit(1);
}

require.extensions['.ts'] = (module, filename) => {
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(code, filename);
};

const { createHandler } = require('./handler.ts');

const ownerId = '11111111-1111-4111-8111-111111111111';
const jobId = '22222222-2222-4222-8222-222222222222';
const ids = ['33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'];
const sessionId = 'worker-test-session';
const courseId = 'cs-3358';
const analysis = {
  sessionId,
  photos: ids.map((captureId, index) => ({
    captureId, pageNumber: index + 1, readability: 'clear',
    faithfulExtraction: `Page ${index + 1} notes`, unclearSections: [],
  })),
  combinedSummary: 'Combined lecture', concepts: ['Concept'], examples: [], assignments: [],
  examMentions: [], courseSignals: ['CS 3358'], topicSignals: ['Trees'],
};
const config = {
  supabaseUrl: 'https://example.invalid', publishableKey: 'public-key',
  serviceRoleKey: 'service-role-key', geminiKey: 'gemini-key',
};

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

function captureRows() {
  return ids.map((id, index) => ({
    id, owner_id: ownerId, capture_session_id: sessionId, page_number: index + 1,
    storage_path: `captures/${ownerId}/${id}/photo.jpg`, mime_type: 'image/jpeg',
  }));
}
function jobRow(overrides = {}) {
  return {
    id: jobId, owner_id: ownerId, capture_session_id: sessionId, media_type: 'photo',
    stage: 'analyzing', total_count: ids.length, capture_analysis_id: null, ...overrides,
  };
}

function setup(overrides = {}) {
  const calls = [];
  const logs = [];
  const state = {
    noJobAvailable: Boolean(overrides.noJobAvailable),
    job: overrides.job ?? jobRow(),
    savedAnalysisId: overrides.savedAnalysisId ?? '55555555-5555-4555-8555-555555555555',
    captureClaimResult: overrides.captureClaimResult ?? true,
    geminiCalls: 0,
    saved: Boolean(overrides.savedAnalysis),
    filedLectureId: overrides.filedLectureId ?? 'capture-job:' + jobId,
    memberships: overrides.memberships ?? [{ course_id: courseId, courses: { id: courseId, code: 'CS 3358', name: 'Data Structures', professor: 'Dr. Lee' } }],
    jobPatches: [],
    fileCalls: 0,
    releasedLease: false,
  };
  const fetcher = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.startsWith(config.supabaseUrl)) {
      assert.equal(init.headers.apikey, url.endsWith('/auth/v1/user') ? config.publishableKey : config.serviceRoleKey);
    }
    if (url.endsWith('/auth/v1/user')) {
      return init.headers.Authorization === 'Bearer user-token' ? json({ id: ownerId }) : json({ error: 'invalid token' }, 401);
    }
    if (url.endsWith('/rest/v1/rpc/claim_next_processing_job') && init.method === 'POST') {
      const body = JSON.parse(init.body);
      assert.match(body.p_runner_token, /^[0-9a-f-]{36}$/);
      return json(state.noJobAvailable ? [] : [state.job]);
    }
    if (url.includes('/rest/v1/captures?processing_job_id=') && (!init.method || init.method === 'GET')) {
      return json(overrides.captureRows ?? captureRows());
    }
    if (url.includes(`/rest/v1/capture_analyses?id=eq.${state.job.capture_analysis_id}`)) {
      return json([{ id: state.job.capture_analysis_id, analysis }]);
    }
    if (url.includes('/rest/v1/capture_analyses?capture_session_id=eq.') && (!init.method || init.method === 'GET')) {
      return json(state.saved ? [{ id: state.savedAnalysisId, analysis, capture_ids: ids }] : []);
    }
    if (url.endsWith('/rest/v1/rpc/worker_claim_captures_for_analysis') && init.method === 'POST') {
      const body = JSON.parse(init.body);
      assert.equal(body.p_owner_id, ownerId);
      assert.equal(body.p_capture_session_id, sessionId);
      assert.deepEqual(body.p_capture_ids, ids);
      return json(state.captureClaimResult);
    }
    if (url.includes('/storage/v1/')) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } });
    if (url.includes(':generateContent')) {
      state.geminiCalls += 1;
      if (overrides.providerFailure) return new Response('private provider detail', { status: 502 });
      return json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(analysis) }] } }] });
    }
    if (url.includes('/rest/v1/capture_analyses?on_conflict=') && init.method === 'POST') {
      const body = JSON.parse(init.body);
      assert.equal(body.owner_id, ownerId, 'worker must set owner_id explicitly, no auth.uid() default available');
      state.saved = true;
      return new Response(null, { status: 204 });
    }
    if (url.includes('/rest/v1/captures?id=in.') && init.method === 'PATCH') {
      const body = JSON.parse(init.body);
      assert.equal(body.status, 'analyzed');
      return json(ids.map((id) => ({ id })));
    }
    if (url.includes('/rest/v1/course_memberships?user_id=eq.') && (!init.method || init.method === 'GET')) {
      return json(state.memberships);
    }
    if (url.includes(`/rest/v1/processing_jobs?id=eq.${jobId}&runner_token=eq.`) && init.method === 'PATCH') {
      const body = JSON.parse(init.body);
      state.jobPatches.push(body);
      if (body.runner_token === null && body.lease_expires_at === null && body.stage === 'retryable_failed') state.releasedLease = true;
      return json([{ id: jobId }]);
    }
    if (url.endsWith('/rest/v1/rpc/worker_file_processing_job') && init.method === 'POST') {
      state.fileCalls += 1;
      const body = JSON.parse(init.body);
      assert.equal(body.p_job_id, jobId);
      return json(state.filedLectureId);
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const logger = { log: (event, details) => logs.push({ level: 'log', event, details }), error: (event, details) => logs.push({ level: 'error', event, details }) };
  return { handler: createHandler({ ...config, ...overrides.config }, fetcher, logger), calls, logs, state };
}

function request(bearer = 'user-token') {
  return new Request('https://example.invalid/process-job', {
    method: 'POST',
    headers: bearer ? { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' } : { 'content-type': 'application/json' },
  });
}

(async () => {
  const unauthenticated = setup();
  assert.equal((await unauthenticated.handler(request(false))).status, 401);

  // Session D: the pg_cron/pg_net recovery schedule has no user JWT, only the
  // exact WORKER_CRON_SECRET value as its bearer. That path must skip
  // /auth/v1/user entirely (no mock registered for it here -- a call would
  // throw "Unexpected request" and fail the test) and still let the job
  // through. A wrong secret must fall through to the JWT path and fail like
  // any other invalid token, not silently succeed.
  const cronSecret = 'cron-secret-value';
  const cronTriggered = setup({ noJobAvailable: true, config: { cronSecret } });
  const cronResponse = await cronTriggered.handler(request(cronSecret));
  assert.equal(cronResponse.status, 200);
  assert.deepEqual(await cronResponse.json(), { claimed: false });
  assert.equal(cronTriggered.calls.some((call) => call.url.endsWith('/auth/v1/user')), false, 'the cron path must never call /auth/v1/user');

  const wrongCronSecret = setup({ config: { cronSecret } });
  assert.equal((await wrongCronSecret.handler(request('not-the-secret'))).status, 401);

  const empty = setup({ noJobAvailable: true });
  const emptyBody = await (await empty.handler(request())).json();
  assert.deepEqual(emptyBody, { claimed: false });

  const unsupportedMedia = setup({ job: jobRow({ media_type: 'audio' }) });
  const unsupportedResponse = await unsupportedMedia.handler(request());
  assert.equal(unsupportedResponse.status, 200);
  assert.deepEqual(await unsupportedResponse.json(), { claimed: true, jobId, stage: 'terminal_failed' });
  assert.equal(unsupportedMedia.state.jobPatches[0].stage, 'terminal_failed');

  const freshAnalysis = setup();
  const freshResponse = await freshAnalysis.handler(request());
  const freshBody = await freshResponse.json();
  assert.equal(freshResponse.status, 200, JSON.stringify(freshBody));
  assert.deepEqual(freshBody, { claimed: true, jobId, stage: 'completed', lectureId: freshAnalysis.state.filedLectureId });
  assert.equal(freshAnalysis.state.geminiCalls, 1, 'no saved analysis on the job or session must call Gemini once');
  assert.equal(freshAnalysis.state.fileCalls, 1);
  assert.equal(freshAnalysis.state.jobPatches.at(-1).stage, 'filing');
  assert.equal(freshAnalysis.state.jobPatches.at(-1).course_id, courseId);

  const reuseByJob = setup({ job: jobRow({ capture_analysis_id: '55555555-5555-4555-8555-555555555555' }) });
  const reuseResponse = await reuseByJob.handler(request());
  assert.equal(reuseResponse.status, 200);
  assert.equal(reuseByJob.state.geminiCalls, 0, 'a job with capture_analysis_id already set must never call Gemini');

  const reuseBySession = setup({ savedAnalysis: true });
  const reuseSessionResponse = await reuseBySession.handler(request());
  assert.equal(reuseSessionResponse.status, 200);
  assert.equal(reuseBySession.state.geminiCalls, 0, 'a saved session analysis must be reused without re-claiming captures');

  const lowConfidence = setup({ memberships: [] });
  const lowConfidenceResponse = await lowConfidence.handler(request());
  const lowConfidenceBody = await lowConfidenceResponse.json();
  assert.equal(lowConfidenceResponse.status, 200);
  assert.deepEqual(lowConfidenceBody, { claimed: true, jobId, stage: 'course_needed' });
  assert.equal(lowConfidence.state.fileCalls, 0);
  const courseNeededPatch = lowConfidence.state.jobPatches.at(-1);
  assert.equal(courseNeededPatch.stage, 'course_needed');
  assert.equal(courseNeededPatch.runner_token, null);
  assert.equal(courseNeededPatch.lease_expires_at, null);

  const captureClaimLost = setup({ captureClaimResult: false });
  const captureClaimLostResponse = await captureClaimLost.handler(request());
  assert.equal(captureClaimLostResponse.status, 409);
  assert.equal(captureClaimLost.state.geminiCalls, 0);

  const providerFailed = setup({ providerFailure: true });
  const providerFailedResponse = await providerFailed.handler(request());
  assert.equal(providerFailedResponse.status, 502);
  assert.equal(providerFailed.state.releasedLease, true, 'a failed claim must release the job lease for retry, not strand it');

  console.log('PASS: claim/reuse-or-run analysis/match/idempotent filing/status update, scoped by owner_id/job_id, no real Gemini calls.');
})().catch((error) => { console.error(error); process.exitCode = 1; });

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
const { parseCaptureAnalysis } = require('../../../src/lib/captureAnalysis.ts');
const ownerId = '11111111-1111-4111-8111-111111111111';
const ids = ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
const sessionId = 'capture-test-session';
const analysis = {
  sessionId,
  photos: ids.map((captureId, index) => ({
    captureId, pageNumber: index + 1, readability: 'clear',
    faithfulExtraction: ` Page ${index + 1} notes `, unclearSections: [],
  })),
  combinedSummary: ' Combined lecture ', concepts: [' Concept '], examples: [], assignments: [],
  examMentions: [], courseSignals: ['CS'], topicSignals: ['Trees'],
};
const parsed = parseCaptureAnalysis(analysis, ids);
assert.equal(parsed.combinedSummary, 'Combined lecture');
assert.equal(parsed.photos[0].faithfulExtraction, 'Page 1 notes');
assert.throws(() => parseCaptureAnalysis({ ...analysis, photos: [analysis.photos[0], analysis.photos[0]] }, ids), /duplicate/);
assert.throws(() => parseCaptureAnalysis({ ...analysis, photos: [analysis.photos[0]] }, ids), /every requested photo/);
assert.throws(() => parseCaptureAnalysis({ ...analysis, photos: [{ ...analysis.photos[0], readability: 'maybe' }, analysis.photos[1]] }, ids), /readability/);

const config = { supabaseUrl: 'https://example.invalid', publishableKey: 'public-key', geminiKey: 'gemini-key' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
function captureRows() {
  return ids.map((id, index) => ({
    id, owner_id: ownerId, capture_session_id: sessionId, page_number: index + 1,
    storage_path: `captures/${ownerId}/${id}/photo.jpg`, mime_type: 'image/jpeg',
  }));
}
function setup(overrides = {}) {
  const calls = [];
  const logs = [];
  const initialStatuses = overrides.statuses ?? ids.map(() => 'uploaded');
  const state = {
    statuses: new Map(ids.map((id, index) => [id, initialStatuses[index]])),
    attemptIds: new Map(ids.map((id) => [id, null])),
    saved: overrides.saved ? analysis : null,
    geminiCalls: 0,
    geminiInlineParts: 0,
    geminiFileParts: 0,
    fileStartCalls: 0,
    fileUploadCalls: 0,
    fileDeleteCalls: 0,
    claimCalls: 0,
    cleanupCalls: 0,
    cleanupUpdatedIds: [],
    cleanupStartedWithFreshSignal: false,
    providerGate: overrides.providerGate ?? null,
    providerStatus: overrides.providerStatus ?? (overrides.providerFailure ? 500 : 200),
    providerHang: Boolean(overrides.providerHang),
  };
  const fetcher = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.startsWith(config.supabaseUrl)) {
      assert.equal(init.headers.apikey, config.publishableKey);
      assert.equal(init.headers.Authorization, 'Bearer user-token');
    }
    if (url.endsWith('/auth/v1/user')) return json({ id: ownerId });
    if (url.includes('/capture_analyses') && (!init.method || init.method === 'GET')) {
      return json(state.saved ? [{ capture_ids: ids, analysis: state.saved }] : []);
    }
    if (url.includes('/rest/v1/captures') && (!init.method || init.method === 'GET')) {
      return json(overrides.rows ?? captureRows());
    }
    if (url.endsWith('/rest/v1/rpc/claim_captures_for_analysis') && init.method === 'POST') {
      state.claimCalls += 1;
      const body = JSON.parse(init.body);
      assert.equal(body.p_capture_session_id, sessionId);
      assert.deepEqual(body.p_capture_ids, ids);
      assert.match(body.p_attempt_id, /^[0-9a-f-]{36}$/);
      const eligible = ids.every((id) => ['uploaded', 'failed'].includes(state.statuses.get(id)));
      if (!eligible) return json(false);
      for (const id of ids) {
        state.statuses.set(id, 'analyzing');
        state.attemptIds.set(id, body.p_attempt_id);
      }
      return json(true);
    }
    if (url.includes('/rest/v1/captures') && init.method === 'PATCH') {
      const body = JSON.parse(init.body);
      const attemptMatch = /analysis_attempt_id=eq\.([0-9a-f-]{36})/.exec(url);
      if (url.includes('status=eq.analyzing') && attemptMatch) {
        const attemptId = attemptMatch[1];
        if (body.status === 'analyzed' && overrides.finalizeFailure) {
          return new Response('private database detail', { status: 503 });
        }
        const updated = [];
        for (const id of ids) {
          if (state.statuses.get(id) === 'analyzing' && state.attemptIds.get(id) === attemptId) {
            state.statuses.set(id, body.status);
            updated.push({ id });
          }
        }
        if (body.status === 'failed') {
          state.cleanupCalls += 1;
          state.cleanupUpdatedIds.push(...updated.map((row) => row.id));
          state.cleanupStartedWithFreshSignal = !init.signal.aborted;
          return new Response(null, { status: 204 });
        }
        assert.equal(body.status, 'analyzed');
        assert.equal(init.headers.Prefer, 'return=representation');
        return json(updated);
      }
      if (url.includes('status=in.(uploaded,failed)')) {
        for (const id of ids) {
          if (['uploaded', 'failed'].includes(state.statuses.get(id))) {
            state.statuses.set(id, 'analyzed');
          }
        }
        return new Response(null, { status: 204 });
      }
    }
    if (url.includes('/storage/v1/')) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } });
    if (url.endsWith('/upload/v1beta/files')) {
      state.fileStartCalls += 1;
      assert.equal(init.headers['x-goog-api-key'], config.geminiKey);
      return new Response(null, { status: 200, headers: { 'x-goog-upload-url': `https://upload.invalid/${state.fileStartCalls}` } });
    }
    if (url.startsWith('https://upload.invalid/')) {
      state.fileUploadCalls += 1;
      const index = Number(url.split('/').at(-1));
      return json({ file: {
        name: `files/classlens-${index}`,
        uri: `https://generativelanguage.googleapis.com/v1beta/files/classlens-${index}`,
        mimeType: 'image/jpeg', state: 'ACTIVE',
      } });
    }
    if (url.includes('/v1beta/files/') && init.method === 'DELETE') {
      state.fileDeleteCalls += 1;
      assert.equal(init.headers['x-goog-api-key'], config.geminiKey);
      return new Response(null, { status: 204 });
    }
    if (url.includes(':generateContent')) {
      state.geminiCalls += 1;
      const body = JSON.parse(init.body);
      state.geminiInlineParts = body.contents[0].parts.filter((part) => part.inlineData).length;
      state.geminiFileParts = body.contents[0].parts.filter((part) => part.fileData).length;
      assert.equal(state.geminiInlineParts + state.geminiFileParts, ids.length);
      assert.equal(body.generationConfig.maxOutputTokens, 16384);
      if (state.providerGate) await state.providerGate;
      if (state.providerHang) {
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('provider timeout')));
        });
      }
      if (state.providerStatus !== 200) return new Response('private provider detail', { status: state.providerStatus });
      return json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(overrides.providerAnalysis ?? analysis) }] } }] });
    }
    if (url.includes('/capture_analyses') && init.method === 'POST') {
      assert.ok(url.includes('on_conflict=owner_id,capture_session_id'));
      assert.equal(init.headers.Prefer, 'resolution=ignore-duplicates,return=minimal');
      const body = JSON.parse(init.body);
      assert.equal(Object.hasOwn(body, 'owner_id'), false, 'owner_id must use its auth.uid() default');
      if (overrides.saveFailure) {
        return json({ code: '42501', message: 'private database detail', details: 'private detail' }, 403);
      }
      state.saved ??= body.analysis;
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const logger = {
    log: (event, details) => logs.push({ level: 'log', event, details }),
    error: (event, details) => logs.push({ level: 'error', event, details }),
  };
  return {
    handler: createHandler({ ...config, maxInlineRequestBytes: overrides.maxInlineRequestBytes }, fetcher, logger),
    calls, logs, state,
  };
}
function request(body = { sessionId, captureIds: ids }) {
  return new Request('https://example.invalid/analyze-captures', {
    method: 'POST',
    headers: { authorization: 'Bearer user-token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

(async () => {
  const success = setup();
  const successResponse = await success.handler(request());
  const successBody = await successResponse.json();
  assert.equal(successResponse.status, 200, JSON.stringify({ successBody, calls: success.calls.map((call) => call.url) }));
  assert.deepEqual(successBody, parsed);
  assert.equal(success.calls.filter((call) => call.url.includes('/storage/v1/')).length, 2);
  assert.equal(success.state.geminiCalls, 1);
  assert.equal(success.state.geminiInlineParts, ids.length);
  assert.equal(success.state.geminiFileParts, 0);
  assert.equal(success.calls.filter((call) => call.init.method === 'POST' && call.url.includes('/capture_analyses')).length, 1);
  assert.ok(success.logs.some((entry) => entry.event.includes('claim-completed')));
  assert.ok(success.logs.some((entry) => entry.event.includes('image-retrieval-completed')));
  assert.ok(success.logs.some((entry) => entry.event.includes('gemini-http') && entry.details.category === 'ok'));

  const oversized = setup({ maxInlineRequestBytes: 1 });
  assert.equal((await oversized.handler(request())).status, 200);
  assert.equal(oversized.state.fileStartCalls, ids.length);
  assert.equal(oversized.state.fileUploadCalls, ids.length);
  assert.equal(oversized.state.fileDeleteCalls, ids.length);
  assert.equal(oversized.state.geminiCalls, 1, 'Files API fallback must still make one generation request');
  assert.equal(oversized.state.geminiInlineParts, 0);
  assert.equal(oversized.state.geminiFileParts, ids.length);

  const cached = setup({ saved: true });
  const cachedResponse = await cached.handler(request());
  assert.equal(cachedResponse.status, 200);
  assert.deepEqual(await cachedResponse.json(), parsed);
  assert.equal(cached.state.geminiCalls, 0);
  assert.equal(cached.state.claimCalls, 0);

  const cachedAfterFinalizeFailure = setup({ saved: true, statuses: ['failed', 'failed'] });
  for (const id of ids) cachedAfterFinalizeFailure.state.attemptIds.set(id, '55555555-5555-4555-8555-555555555555');
  assert.equal((await cachedAfterFinalizeFailure.handler(request())).status, 200);
  assert.ok(ids.every((id) => cachedAfterFinalizeFailure.state.statuses.get(id) === 'analyzed'));
  assert.equal(cachedAfterFinalizeFailure.state.geminiCalls, 0);

  const denied = setup({ rows: [captureRows()[0]] });
  assert.equal((await denied.handler(request())).status, 403);

  assert.equal((await setup().handler(request({ sessionId, captureIds: [ids[0], ids[0]] }))).status, 400);

  let releaseProvider;
  const providerGate = new Promise((resolve) => { releaseProvider = resolve; });
  const concurrent = setup({ providerGate });
  const activeRequest = concurrent.handler(request());
  while (concurrent.state.geminiCalls !== 1) await new Promise((resolve) => setImmediate(resolve));
  const competingResponse = await concurrent.handler(request());
  const competingBody = await competingResponse.json();
  assert.equal(competingResponse.status, 409);
  assert.equal(competingBody.error.code, 'ANALYSIS_IN_PROGRESS');
  assert.equal(concurrent.state.geminiCalls, 1, 'a competing request must not call Gemini');
  assert.equal(concurrent.state.cleanupCalls, 0, 'a competing request must not release another request claim');
  assert.ok(ids.every((id) => concurrent.state.statuses.get(id) === 'analyzing'));
  assert.equal(new Set(ids.map((id) => concurrent.state.attemptIds.get(id))).size, 1);
  releaseProvider();
  assert.equal((await activeRequest).status, 200);
  assert.ok(ids.every((id) => concurrent.state.statuses.get(id) === 'analyzed'));

  const failed = setup({ providerFailure: true });
  assert.equal((await failed.handler(request())).status, 502);
  assert.equal(failed.state.cleanupCalls, 1);
  assert.equal(failed.state.cleanupStartedWithFreshSignal, true);
  assert.ok(ids.every((id) => failed.state.statuses.get(id) === 'failed'));
  assert.deepEqual(failed.state.cleanupUpdatedIds.sort(), [...ids].sort());
  failed.state.providerStatus = 200;
  assert.equal((await failed.handler(request())).status, 200, 'failed captures must be claimable on retry');

  const rejected = setup({ providerStatus: 400 });
  const rejectedResponse = await rejected.handler(request());
  assert.equal(rejectedResponse.status, 502);
  assert.equal((await rejectedResponse.json()).error.code, 'GEMINI_REQUEST_REJECTED');
  assert.ok(ids.every((id) => rejected.state.statuses.get(id) === 'failed'));
  assert.ok(rejected.logs.some((entry) => entry.event.includes('gemini-http')
    && entry.details.status === 400 && entry.details.category === 'request-rejected'));

  const invalidAnalysis = setup({ providerAnalysis: { ...analysis, photos: [analysis.photos[0]] } });
  const invalidAnalysisResponse = await invalidAnalysis.handler(request());
  assert.equal(invalidAnalysisResponse.status, 502);
  assert.equal((await invalidAnalysisResponse.json()).error.code, 'INVALID_ANALYSIS');
  assert.ok(invalidAnalysis.logs.some((entry) => entry.event.includes('analysis-parse-failed')
    && entry.details.category === 'contract-validation'));
  assert.ok(ids.every((id) => invalidAnalysis.state.statuses.get(id) === 'failed'));

  const saveFailed = setup({ saveFailure: true });
  const saveFailedResponse = await saveFailed.handler(request());
  assert.equal(saveFailedResponse.status, 502);
  assert.equal((await saveFailedResponse.json()).error.code, 'ANALYSIS_SAVE');
  assert.ok(saveFailed.logs.some((entry) => entry.event.includes('analysis-save-failed')
    && entry.details.status === 403
    && entry.details.databaseCode === '42501'
    && entry.details.category === 'permission'));
  assert.equal(JSON.stringify(saveFailed.logs).includes('private database detail'), false);
  assert.equal(JSON.stringify(saveFailed.logs).includes('private detail'), false);
  assert.ok(ids.every((id) => saveFailed.state.statuses.get(id) === 'failed'));

  const finalizeFailed = setup({ finalizeFailure: true });
  const finalizeFailedResponse = await finalizeFailed.handler(request());
  assert.equal(finalizeFailedResponse.status, 502);
  assert.equal((await finalizeFailedResponse.json()).error.code, 'ANALYSIS_FINALIZATION');
  assert.ok(finalizeFailed.logs.some((entry) => entry.event.includes('finalization-failed')
    && entry.details.status === 503));
  assert.ok(ids.every((id) => finalizeFailed.state.statuses.get(id) === 'failed'));
  const generationCallsBeforeFinalizeRecovery = finalizeFailed.state.geminiCalls;
  assert.equal((await finalizeFailed.handler(request())).status, 200);
  assert.equal(finalizeFailed.state.geminiCalls, generationCallsBeforeFinalizeRecovery,
    'a saved analysis must repair finalization without another generation request');

  const originalTimer = global.setTimeout;
  global.setTimeout = (callback) => originalTimer(callback, 1);
  const timedOut = setup({ providerHang: true });
  try {
    assert.equal((await timedOut.handler(request())).status, 504);
  } finally {
    global.setTimeout = originalTimer;
  }
  assert.equal(timedOut.state.cleanupCalls, 1);
  assert.equal(timedOut.state.cleanupStartedWithFreshSignal, true);
  assert.ok(ids.every((id) => timedOut.state.statuses.get(id) === 'failed'));
  timedOut.state.providerHang = false;
  assert.equal((await timedOut.handler(request())).status, 200, 'timed-out captures must be claimable on retry');
  const callsAfterCompletion = timedOut.state.geminiCalls;
  assert.equal((await timedOut.handler(request())).status, 200, 'completed retries must return saved analysis');
  assert.equal(timedOut.state.geminiCalls, callsAfterCompletion, 'completed retries must not call Gemini again');

  const partialRace = setup({ statuses: ['uploaded', 'analyzing'] });
  partialRace.state.attemptIds.set(ids[1], '44444444-4444-4444-8444-444444444444');
  const partialRaceResponse = await partialRace.handler(request());
  assert.equal(partialRaceResponse.status, 409);
  assert.equal((await partialRaceResponse.json()).error.code, 'ANALYSIS_IN_PROGRESS');
  assert.equal(partialRace.state.statuses.get(ids[0]), 'uploaded', 'an unsuccessful claim must be all-or-nothing');
  assert.equal(partialRace.state.statuses.get(ids[1]), 'analyzing');
  assert.equal(partialRace.state.geminiCalls, 0);
  assert.equal(partialRace.state.cleanupCalls, 0);

  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260917000000_multi_photo_captures.sql'), 'utf8');
  assert.match(migration, /analysis_attempt_id uuid/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /status in \('uploaded', 'failed'\)/);
  assert.match(migration, /grant execute on function public\.claim_captures_for_analysis/);

  const serviceCode = ts.transpileModule(fs.readFileSync(path.join(root, 'src/services/ai.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let mode = 'supabase';
  let invoked = 0;
  let invokeError = null;
  const clientLogs = [];
  class MockFunctionsHttpError extends Error {
    constructor(context) {
      super('Edge Function returned a non-2xx status code');
      this.name = 'FunctionsHttpError';
      this.context = context;
    }
  }
  const serviceExports = {};
  const from = () => ({
    select: () => ({
      eq: () => ({
        returns: () => ({ maybeSingle: async () => ({ data: { analysis }, error: null }) }),
      }),
    }),
  });
  require('node:vm').runInNewContext(serviceCode, {
    exports: serviceExports, Response, Error,
    require: (name) => {
      if (name === '@/lib/quiz') return require('../../../src/lib/quiz.ts');
      if (name === '@/lib/askLecture') return require('../../../src/lib/askLecture.ts');
      if (name === '@/lib/dataMode') return { getDataMode: () => mode };
      if (name === '@/lib/lectureAnalysis') return require('../../../src/lib/lectureAnalysis.ts');
      if (name === '@/lib/captureAnalysis') return { parseCaptureAnalysis };
      if (name === '@/lib/supabase') return { supabase: {
        functions: { invoke: async (name, options) => {
          assert.equal(name, 'analyze-captures');
          assert.equal(JSON.stringify(options.body), JSON.stringify({ sessionId, captureIds: ids }));
          invoked += 1;
          return invokeError ? { data: null, error: invokeError } : { data: analysis, error: null };
        } },
        from,
      } };
      if (name === '@supabase/supabase-js') return { FunctionsHttpError: MockFunctionsHttpError };
      throw new Error(`Unexpected import: ${name}`);
    },
    __DEV__: true,
    console: { error: (...values) => clientLogs.push(values) },
  });
  assert.equal(JSON.stringify(await serviceExports.analyzeCaptures(sessionId, ids)), JSON.stringify(parsed));
  assert.equal(JSON.stringify(await serviceExports.getCaptureAnalysis(sessionId, ids)), JSON.stringify(parsed));
  invokeError = new MockFunctionsHttpError(new Response(JSON.stringify({
    error: { code: 'GEMINI_INCOMPLETE', message: 'The lecture analysis was incomplete. Try again.' },
  }), { status: 502, headers: { 'content-type': 'application/json' } }));
  await assert.rejects(serviceExports.analyzeCaptures(sessionId, ids),
    /GEMINI_INCOMPLETE: The lecture analysis was incomplete\. Try again\./);
  assert.equal(JSON.stringify(clientLogs), JSON.stringify([[{
    httpStatus: 502,
    errorCode: 'GEMINI_INCOMPLETE',
    message: 'The lecture analysis was incomplete. Try again.',
  }]]));
  invokeError = null;
  mode = 'mock';
  await assert.rejects(serviceExports.analyzeCaptures(sessionId, ids), /supabase/);
  assert.equal(invoked, 2);
  console.log('PASS: oversized Gemini fallback, structured stage failures, atomic concurrency, retry recovery, parser, and mobile service checks.');
})().catch((error) => { console.error(error); process.exitCode = 1; });

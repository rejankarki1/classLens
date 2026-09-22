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
const config = { supabaseUrl: 'https://example.invalid', publishableKey: 'public-key', serviceRoleKey: 'service-role-key' };

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

function jobRow(id, overrides = {}) {
  return { id, owner_id: ownerId, total_count: 2, ...overrides };
}
function captureRows(jobId, count = 2) {
  return Array.from({ length: count }, (_, index) => ({
    id: `capture-${jobId}-${index}`, storage_path: `captures/${ownerId}/${jobId}-${index}/photo.jpg`,
  }));
}

function setup(overrides = {}) {
  const state = {
    jobs: overrides.jobs ?? [],
    captures: overrides.captures ?? {},
    // Maps a job id to the exact set of storage_paths the mock storage
    // backend will actually report as deleted -- lets a test simulate a
    // partial/unconfirmed deletion by omitting one.
    storageRemoves: overrides.storageRemoves ?? {},
    storageStatus: overrides.storageStatus ?? {},
    patches: [],
  };
  const fetcher = async (url, init = {}) => {
    if (url.endsWith('/auth/v1/user')) {
      return init.headers.Authorization === 'Bearer user-token' ? json({ id: ownerId }) : json({ error: 'invalid token' }, 401);
    }
    if (url.includes('/rest/v1/processing_jobs?stage=eq.completed') && (!init.method || init.method === 'GET')) {
      return json(state.jobs);
    }
    if (url.includes('/rest/v1/captures?processing_job_id=') && (!init.method || init.method === 'GET')) {
      const jobId = new URL(url).searchParams.get('processing_job_id')?.replace(/^eq\./, '');
      return json(state.captures[jobId] ?? []);
    }
    if (url.includes('/storage/v1/object/lecture-materials') && init.method === 'DELETE') {
      const body = JSON.parse(init.body);
      const jobId = body.prefixes[0]?.split('/')[2]?.split('-').slice(0, -1).join('-');
      const status = state.storageStatus[jobId] ?? 200;
      if (status !== 200) return new Response('storage error', { status });
      const removedPaths = state.storageRemoves[jobId] ?? body.prefixes;
      return json(removedPaths.map((name) => ({ name })));
    }
    if (url.includes('/rest/v1/processing_jobs?id=eq.') && init.method === 'PATCH') {
      state.patches.push({ url, body: JSON.parse(init.body) });
      return json([{ id: 'patched' }]);
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const logs = [];
  const logger = { log: (event, details) => logs.push({ level: 'log', event, details }), error: (event, details) => logs.push({ level: 'error', event, details }) };
  return { handler: createHandler({ ...config, ...overrides.config }, fetcher, logger), state, logs };
}

function request(bearer = 'user-token') {
  return new Request('https://example.invalid/cleanup-originals', {
    method: 'POST',
    headers: bearer ? { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' } : { 'content-type': 'application/json' },
  });
}

(async () => {
  const unauthenticated = setup();
  assert.equal((await unauthenticated.handler(request(false))).status, 401);

  const cronSecret = 'cleanup-cron-secret-value';
  const wrongCronSecret = setup({ config: { cronSecret } });
  assert.equal((await wrongCronSecret.handler(request('not-the-secret'))).status, 401);

  const cronNoJobs = setup({ config: { cronSecret } });
  const cronResponse = await cronNoJobs.handler(request(cronSecret));
  assert.equal(cronResponse.status, 200);
  assert.deepEqual(await cronResponse.json(), { processed: 0, succeeded: 0, failed: 0 });
  assert.equal(cronNoJobs.state.patches.length, 0);
  console.log('PASS: unauthenticated rejected; wrong cron secret falls through to JWT and fails; correct cron secret skips /auth/v1/user.');

  const jobId = 'job-1';
  const clean = setup({
    jobs: [jobRow(jobId)],
    captures: { [jobId]: captureRows(jobId) },
  });
  const cleanResponse = await clean.handler(request());
  const cleanBody = await cleanResponse.json();
  assert.equal(cleanResponse.status, 200);
  assert.deepEqual(cleanBody, { processed: 1, succeeded: 1, failed: 0 });
  const cleanPatch = clean.state.patches.at(-1).body;
  assert.ok(cleanPatch.cleanup_completed_at, 'a fully confirmed deletion must set cleanup_completed_at');
  assert.equal(cleanPatch.last_cleanup_error, null);
  console.log('PASS: fully confirmed Storage deletion marks the job cleanup_completed_at with no error.');

  const partialJobId = 'job-2';
  const partial = setup({
    jobs: [jobRow(partialJobId)],
    captures: { [partialJobId]: captureRows(partialJobId) },
    storageRemoves: { [partialJobId]: [captureRows(partialJobId)[0].storage_path] },
  });
  const partialResponse = await partial.handler(request());
  const partialBody = await partialResponse.json();
  assert.equal(partialResponse.status, 200);
  assert.deepEqual(partialBody, { processed: 1, succeeded: 0, failed: 1 });
  const partialPatch = partial.state.patches.at(-1).body;
  assert.equal(partialPatch.cleanup_completed_at, undefined, 'an unconfirmed deletion must never set cleanup_completed_at');
  assert.match(partialPatch.last_cleanup_error, /unconfirmed/i);
  console.log('PASS: a partially confirmed deletion records last_cleanup_error and leaves cleanup_completed_at unset for retry.');

  const storageErrorJobId = 'job-3';
  const storageError = setup({
    jobs: [jobRow(storageErrorJobId)],
    captures: { [storageErrorJobId]: captureRows(storageErrorJobId) },
    storageStatus: { [storageErrorJobId]: 500 },
  });
  const storageErrorResponse = await storageError.handler(request());
  assert.deepEqual(await storageErrorResponse.json(), { processed: 1, succeeded: 0, failed: 1 });
  assert.match(storageError.state.patches.at(-1).body.last_cleanup_error, /storage delete failed/i);
  console.log('PASS: a Storage HTTP error is recorded as a retryable failure, not thrown to the client.');

  const mismatchJobId = 'job-4';
  const mismatch = setup({
    jobs: [jobRow(mismatchJobId, { total_count: 3 })],
    captures: { [mismatchJobId]: captureRows(mismatchJobId, 2) },
  });
  const mismatchResponse = await mismatch.handler(request());
  assert.deepEqual(await mismatchResponse.json(), { processed: 1, succeeded: 0, failed: 1 });
  assert.match(mismatch.state.patches.at(-1).body.last_cleanup_error, /do not match the job/i);
  console.log('PASS: a captures/total_count mismatch refuses to delete rather than guessing.');

  const emptyCapturesJobId = 'job-5';
  const emptyCaptures = setup({
    jobs: [jobRow(emptyCapturesJobId, { total_count: 0 })],
    captures: { [emptyCapturesJobId]: [] },
  });
  const emptyCapturesResponse = await emptyCaptures.handler(request());
  assert.deepEqual(await emptyCapturesResponse.json(), { processed: 1, succeeded: 1, failed: 0 });
  console.log('PASS: a job with no captures is marked complete without a Storage call.');

  console.log('PASS: select eligible jobs / delete Storage objects / verify absence / mark complete or record error for retry.');
})().catch((error) => { console.error(error); process.exitCode = 1; });

// Offline checks using the repository's existing TypeScript compiler and Node runtime.
// No secrets, cloud requests, or external test dependencies.
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
    getCanonicalFileName: x => x, getCurrentDirectory: () => root, getNewLine: () => '\n',
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
const { parseLectureAnalysis } = require('../../../src/lib/lectureAnalysis.ts');
const id = '4edd2432-5908-4ca4-ac6f-ad1f35caafcc';
const analysis = { suggestedCourse: ' ', title: ' Trees ', topic: 'Trees', summary: 'Study notes',
  keyConcepts: [' BST ', ' '], importantPoints: [], assignments: [], examMentions: [] };
const config = { supabaseUrl: 'https://example.invalid', publishableKey: 'demo-test-key', geminiKey: 'provider-test-key' };
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
function setup(overrides = {}) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    if (overrides.timeout) throw new DOMException('timeout', 'AbortError');
    if (url.includes('/rest/v1/')) {
      assert.equal(init.headers.apikey, config.publishableKey);
      assert.equal(init.headers.Authorization, undefined);
      return overrides.dbResponse?.() ?? json(overrides.rows ?? [{ id, type: 'photo', storage_path: `materials/${id}/photo.png` }]);
    }
    if (url.includes('/storage/v1/')) return overrides.image?.() ?? new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } });
    assert.match(url, /gemini-3\.1-flash-lite:generateContent$/);
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['x-goog-api-key'], config.geminiKey);
    const body = JSON.parse(init.body);
    assert.equal(body.contents[0].parts[0].inlineData.mimeType, 'image/png');
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
    assert.equal(body.generationConfig.responseJsonSchema.required.length, 8);
    return overrides.provider?.() ?? json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(analysis) }] } }] });
  };
  return { handler: createHandler({ ...config, ...overrides.config }, fetcher), calls };
}
function request(body = JSON.stringify({ materialId: id }), headers = {}, method = 'POST') {
  return new Request('https://example.invalid/analyze-material', { method, headers: { apikey: config.publishableKey, 'content-type': 'application/json', ...headers }, ...(method === 'POST' ? { body } : {}) });
}
(async () => {
  let count = 0;
  const cases = [
    ['success', {}, request(), 200, 3],
    ['preflight', {}, request('', {}, 'OPTIONS'), 204, 0],
    ['method', {}, request('', {}, 'GET'), 405, 0],
    ['missing configuration', { config: { geminiKey: '' } }, request(), 503, 0],
    ['access', {}, request(undefined, { apikey: 'wrong' }), 401, 0],
    ['JSON', {}, request('{'), 400, 0],
    ['UUID', {}, request('{"materialId":"bad"}'), 400, 0],
    ['size', {}, request(' '.repeat(4097)), 413, 0],
    ['content type', {}, request(undefined, { 'content-type': 'text/plain' }), 415, 0],
    ['missing row', { rows: [] }, request(), 404, 1],
    ['database', { dbResponse: () => new Response('private error', { status: 500 }) }, request(), 502, 1],
    ['photo only', { rows: [{ type: 'audio' }] }, request(), 422, 1],
    ['invalid path', { rows: [{ type: 'photo', storage_path: 'https://evil.invalid/image.png' }] }, request(), 422, 1],
    ['storage failure', { image: () => new Response('', { status: 404 }) }, request(), 502, 2],
    ['empty image', { image: () => new Response('', { headers: { 'content-type': 'image/png' } }) }, request(), 422, 2],
    ['image format', { image: () => new Response('test', { headers: { 'content-type': 'image/gif' } }) }, request(), 422, 2],
    ['image size', { image: () => new Response('test', { headers: { 'content-type': 'image/png', 'content-length': '10485761' } }) }, request(), 413, 2],
    ['quota', { provider: () => new Response('secret provider error', { status: 429 }) }, request(), 429, 3],
    ['provider error', { provider: () => new Response('secret provider error', { status: 500 }) }, request(), 502, 3],
    ['blocked', { provider: () => json({ promptFeedback: { blockReason: 'SAFETY' } }) }, request(), 502, 3],
    ['truncated', { provider: () => json({ candidates: [{ finishReason: 'MAX_TOKENS' }] }) }, request(), 502, 3],
    ['invalid JSON', { provider: () => json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'bad' }] } }] }) }, request(), 502, 3],
    ['missing fields', { provider: () => json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{}' }] } }] }) }, request(), 502, 3],
  ];
  for (const [name, overrides, req, status, callCount] of cases) {
    const { handler, calls } = setup(overrides);
    const response = await handler(req);
    assert.equal(response.status, status, name);
    assert.equal(calls.length, callCount, name);
    const text = await response.text();
    assert.ok(!text.includes('secret provider error') && !text.includes(config.geminiKey), name);
    assert.ok(calls.filter(c => !c.url.includes('googleapis')).every(c => !c.init.method || c.init.method === 'GET'));
    if (status === 200) assert.deepEqual(JSON.parse(text), parseLectureAnalysis(analysis));
    count++;
  }
  assert.equal(parseLectureAnalysis(analysis).suggestedCourse, null);
  assert.deepEqual(parseLectureAnalysis(analysis).keyConcepts, ['BST']);
  assert.throws(() => parseLectureAnalysis({ ...analysis, assignments: [3] }));
  assert.throws(() => parseLectureAnalysis({ ...analysis, title: ' ' }));
  // Simulate the real deadline without making the suite wait one minute.
  const originalTimer = global.setTimeout;
  global.setTimeout = fn => originalTimer(fn, 1);
  try {
    const handler = createHandler(config, (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('private timeout detail')));
    }));
    assert.equal((await handler(request())).status, 504);
  } finally { global.setTimeout = originalTimer; }
  // Execute the real mobile service with only its runtime dependencies substituted.
  const vm = require('node:vm');
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/services/ai.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let mode = 'supabase', invoked = 0, result = { data: analysis, error: null };
  const exports = {};
  vm.runInNewContext(code, { exports, Response, Error, require: name => {
    if (name === '@/lib/quiz') return require('../../../src/lib/quiz.ts');
    if (name === '@/lib/askLecture') return require('../../../src/lib/askLecture.ts');
    if (name === '@/lib/dataMode') return { getDataMode: () => mode };
    if (name === '@/lib/lectureAnalysis') return { parseLectureAnalysis };
    if (name === '@/lib/supabase') return { supabase: { functions: { invoke: async (name, options) => {
      assert.equal(name, 'analyze-material'); assert.equal(JSON.stringify(options.body), JSON.stringify({ materialId: id }));
      invoked++; return result;
    } } } };
    throw new Error('Unexpected import');
  } });
  assert.deepEqual(await exports.analyzeMaterial({ id, type: 'photo' }), parseLectureAnalysis(analysis));
  result = { data: null, error: { context: json({ error: { message: 'Quota reached.' } }) } };
  await assert.rejects(exports.analyzeMaterial({ id, type: 'photo' }), /Quota reached/);
  result = { data: {}, error: null };
  await assert.rejects(exports.analyzeMaterial({ id, type: 'photo' }), /Invalid analysis/);
  mode = 'mock';
  await assert.rejects(exports.analyzeMaterial({ id, type: 'photo' }), /supabase/);
  mode = 'supabase';
  await assert.rejects(exports.analyzeMaterial({ id, type: 'audio' }), /Only photos/);
  assert.equal(invoked, 3);
  console.log(`PASS: portable handler type check, ${count} request scenarios, timeout, normalization, and mobile service checks. No network requests.`);
})().catch(error => { console.error(error); process.exitCode = 1; });

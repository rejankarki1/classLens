/* global __dirname */
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
    getCanonicalFileName: (value) => value, getCurrentDirectory: () => root, getNewLine: () => '\n',
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
const { parseQuizResult } = require('../../../src/lib/quiz.ts');

const id = 'test-lecture';
const analysisId = 'analysis-1';
const page1Id = 'e5a09744-2ed8-4f81-a297-05b4cc6f7fa4';
const page2Id = 'a1b2c3d4-2ed8-4f81-a297-05b4cc6f7fa4';
const ownerId = 'f31c6526-1537-4c10-958d-a11f4dfc621a';
const config = { supabaseUrl: 'https://example.invalid', publishableKey: 'test-key', geminiKey: 'secret-test', serviceRoleKey: 'service-test', revenuecatSecretKey: '' };

const lecture = {
  id, title: 'BST', summary: 'Three deletion cases', key_concepts: ['BST'],
  important_points: ['Leaf', 'One child', 'Two children'], assignments: [], exam_mentions: [],
  capture_analysis_id: analysisId,
};
const analysis = {
  sessionId: 'session-1',
  photos: [
    { captureId: page1Id, pageNumber: 1, readability: 'clear', faithfulExtraction: 'A leaf node has no children.', unclearSections: [] },
    { captureId: page2Id, pageNumber: 2, readability: 'clear', faithfulExtraction: 'A node with two children is replaced by its successor.', unclearSections: [] },
  ],
  combinedSummary: 'BST deletion has three cases.', concepts: ['BST'], examples: [], assignments: [],
  examMentions: [], courseSignals: [], topicSignals: [],
};
const quiz = {
  title: 'Test quiz',
  questions: Array.from({ length: 5 }, (_, i) => ({
    question: `Question ${i}`, options: ['A', 'B', 'C', 'D'], correctAnswer: 'A', explanation: 'From the lecture.',
    citedPages: i === 0 ? [1, 99] : i === 1 ? [2] : [],
  })),
};

function json(value) { return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } }); }
function request(body = { lectureId: id }, { key = 'test-key', method = 'POST', bearer = 'user-token' } = {}) {
  const headers = { apikey: key, 'content-type': 'application/json' };
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  return new Request('https://example.invalid', { method, headers, ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
}

function setup(overrides = {}) {
  let calls = 0;
  const requestedUrls = [];
  const usage = { used: overrides.used ?? 0, active: new Set(), states: new Map(), completed: 0, released: 0, finishCalls: 0 };
  const fetcher = async (url, init = {}) => {
    calls += 1;
    requestedUrls.push(url);
    if (url.includes('/auth/v1/user')) return overrides.authFailure ? new Response('', { status: 401 }) : json({ id: ownerId });
    if (url.includes('api.revenuecat.com')) {
      if (overrides.revenuecatOutage) throw new Error('RevenueCat unavailable');
      if (overrides.revenuecatHttpStatus) return new Response('', { status: overrides.revenuecatHttpStatus });
      if (overrides.revenuecatMalformed) return new Response('invalid json', { status: 200 });
      return json({ subscriber: { entitlements: overrides.pro ? { pro: { purchase_date: '2026-01-01', expires_date: null } } : {} } });
    }
    if (url.includes('/rest/v1/rpc/quiz_uses_remaining')) return json(Math.max(0, 3 - usage.used - usage.active.size));
    if (url.includes('/rest/v1/rpc/reserve_quiz_use')) {
      assert.equal(init.headers.apikey, 'service-test');
      assert.equal(JSON.parse(init.body).p_owner_id, ownerId);
      if (usage.used + usage.active.size >= 3) return json({ reservationId: null, remaining: 0 });
      const reservationId = `reservation-${usage.active.size + usage.completed + usage.released}`;
      usage.active.add(reservationId);
      usage.states.set(reservationId, 'reserved');
      return json({ reservationId, remaining: 3 - usage.used - usage.active.size });
    }
    if (url.includes('/rest/v1/rpc/finish_quiz_use')) {
      const body = JSON.parse(init.body);
      usage.finishCalls += 1;
      if (!body.p_success && overrides.releaseHttpFailure) return new Response('', { status: 500 });
      const prior = usage.states.get(body.p_reservation_id);
      let outcome = prior ?? 'not_found';
      if (prior === 'reserved') {
        usage.active.delete(body.p_reservation_id);
        if (body.p_success && overrides.quotaOnFinish) outcome = 'quota_reached';
        else if (body.p_success) { outcome = 'completed'; usage.completed += 1; usage.used += 1; }
        else { outcome = 'released'; usage.released += 1; }
        usage.states.set(body.p_reservation_id, outcome === 'quota_reached' ? 'released' : outcome);
      }
      if (body.p_success && overrides.completionResponseLostOnce && usage.finishCalls === 1) throw new Error('completion response lost');
      if (!body.p_success && overrides.releaseResponseLostOnce && usage.finishCalls === 1) throw new Error('release response lost');
      return json({ outcome });
    }
    if (url.includes('/rest/v1/lectures?')) {
      assert.equal(new URL(url).searchParams.get('id'), `eq.${id}`);
      return overrides.dbError ? new Response('', { status: 500 }) : json(overrides.lectures ?? [lecture]);
    }
    if (url.includes('/rest/v1/capture_analyses?')) {
      if (overrides.analysisError) return new Response('', { status: 500 });
      return json(overrides.analysisRows ?? [{ id: analysisId, analysis }]);
    }
    if (url.includes('/rest/v1/notebook_corrections?')) {
      if (overrides.correctionsError) return new Response('', { status: 500 });
      return json(overrides.corrections ?? []);
    }
    if (url.includes(':generateContent')) {
      assert.equal(init.headers['x-goog-api-key'], 'secret-test');
      const body = JSON.parse(init.body);
      assert.match(body.systemInstruction.parts[0].text, /ONLY the supplied/);
      assert.match(body.systemInstruction.parts[0].text, /five distinct/);
      const sent = JSON.parse(body.contents[0].parts[0].text);
      assert.deepEqual(sent.lecture, { id, title: lecture.title, summary: lecture.summary, key_concepts: lecture.key_concepts, important_points: lecture.important_points, assignments: lecture.assignments, exam_mentions: lecture.exam_mentions });
      if (overrides.assertSentPages) overrides.assertSentPages(sent.pages);
      if (overrides.geminiStatus) return new Response('sensitive', { status: overrides.geminiStatus });
      return json({ candidates: [{ finishReason: overrides.finishReason ?? 'STOP', content: { parts: [{ text: JSON.stringify(overrides.answer ?? quiz) }] } }] });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  return { handler: createHandler({ ...config, ...overrides.config }, fetcher), calls: () => calls, requestedUrls, usage };
}

(async () => {
  // Grounded quiz: citations survive, and an out-of-range page (99) is
  // filtered per-question without disturbing the other questions.
  {
    const { handler, calls } = setup({
      assertSentPages: (pages) => {
        assert.deepEqual(pages, [
          { pageNumber: 1, text: 'A leaf node has no children.', readability: 'clear', unclearSections: [] },
          { pageNumber: 2, text: 'A node with two children is replaced by its successor.', readability: 'clear', unclearSections: [] },
        ]);
      },
    });
    const response = await handler(request());
    assert.equal(response.status, 200);
    const body = parseQuizResult(await response.json());
    assert.deepEqual(body.questions[0].citedPages, [1], 'page 99 must be filtered out');
    assert.deepEqual(body.questions[1].citedPages, [2]);
    assert.deepEqual(body.questions[2].citedPages, []);
    assert.equal(calls(), 7, 'auth + notebook context + reservation + gemini + completion');
  }
  console.log('PASS: a grounded quiz keeps valid citations and strips a page number outside the supplied notebook pages.');

  // No capture_analysis_id: lecture-level-only grounding, no notebook calls.
  {
    const { handler, calls, requestedUrls } = setup({ lectures: [{ ...lecture, capture_analysis_id: null }], assertSentPages: (pages) => assert.deepEqual(pages, []) });
    const response = await handler(request());
    assert.equal(response.status, 200);
    assert.equal(calls(), 5, 'auth + lecture + reservation + gemini + completion');
    assert.equal(requestedUrls.some((url) => url.includes('capture_analyses') || url.includes('notebook_corrections')), false);
  }
  console.log('PASS: a lecture with no capture_analysis_id grounds from lecture fields only, with zero notebook pages.');

  {
    const { handler, usage, requestedUrls } = setup({ used: 3 });
    const response = await handler(request());
    assert.equal(response.status, 429);
    assert.equal((await response.json()).error.code, 'QUIZ_LIMIT_REACHED');
    assert.equal(requestedUrls.some((url) => url.includes(':generateContent')), false);
    assert.equal(usage.active.size, 0);
  }
  console.log('PASS: a fourth free request stops before Gemini.');

  {
    const { handler, usage } = setup({ used: 2 });
    const responses = await Promise.all([handler(request()), handler(request())]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 429]);
    assert.equal(usage.completed, 1);
    assert.equal(usage.active.size, 0);
  }
  console.log('PASS: concurrent free requests share an atomic reservation boundary.');

  {
    const pro = setup({ used: 3, pro: true, config: { revenuecatSecretKey: 'rc-secret' } });
    assert.equal((await pro.handler(request())).status, 200);
    assert.equal(pro.usage.completed, 0);
    assert.equal(pro.requestedUrls.some((url) => url.includes('/reserve_quiz_use')), false);
    const outage = setup({ used: 3, revenuecatOutage: true, config: { revenuecatSecretKey: 'rc-secret' } });
    const response = await outage.handler(request());
    assert.equal(response.status, 429);
    assert.equal((await response.json()).error.code, 'QUIZ_LIMIT_REACHED');
  }
  console.log('PASS: active Pro bypasses the quota and a RevenueCat outage uses the free quota.');

  {
    const originalInfo = console.info;
    const messages = [];
    console.info = (message) => messages.push(message);
    try {
      for (const overrides of [
        { pro: true, expected: 'http_status=200 pro_active=true outcome=active' },
        { expected: 'http_status=200 pro_active=false outcome=inactive' },
        { revenuecatHttpStatus: 401, expected: 'http_status=401 pro_active=false outcome=http_error' },
        { revenuecatMalformed: true, expected: 'http_status=200 pro_active=false outcome=invalid_response' },
        { revenuecatOutage: true, expected: 'http_status=network_error pro_active=false outcome=network_error' },
      ]) {
        const { handler } = setup({ ...overrides, config: { revenuecatSecretKey: 'rc-secret' } });
        await handler(request({ action: 'status' }));
        const message = messages.pop();
        assert.match(message, /^\[generate-quiz\] revenuecat_lookup /);
        assert.ok(message.includes(overrides.expected), message);
        assert.equal(message.includes(ownerId), false);
        assert.equal(message.includes('rc-secret'), false);
      }
    } finally { console.info = originalInfo; }
  }
  console.log('PASS: RevenueCat diagnostics separate active, inactive, HTTP auth, invalid response, and network outcomes without customer or key data.');

  {
    const { handler, usage } = setup({ geminiStatus: 500 });
    assert.equal((await handler(request())).status, 502);
    assert.equal(usage.released, 1);
    assert.equal(usage.used, 0);
    const status = await handler(request({ action: 'status' }));
    assert.deepEqual(await status.json(), { isPro: false, remaining: 3 });
  }
  console.log('PASS: failed Gemini generations release their reservation and status reads server usage.');

  {
    const { handler, usage } = setup({ completionResponseLostOnce: true });
    assert.equal((await handler(request())).status, 200);
    assert.equal(usage.completed, 1);
    assert.equal(usage.finishCalls, 2, 'the same completion must be confirmed by retry');
    assert.equal(usage.active.size, 0);
  }
  console.log('PASS: a lost completion response is confirmed without charging twice.');

  {
    const { handler, usage } = setup({ quotaOnFinish: true });
    const response = await handler(request());
    assert.equal(response.status, 429);
    assert.equal((await response.json()).error.code, 'QUIZ_LIMIT_REACHED');
    assert.equal(usage.completed, 0);
    assert.equal(usage.active.size, 0);
  }
  console.log('PASS: a quota rejection at completion never returns the generated quiz.');

  {
    const lost = setup({ geminiStatus: 500, releaseResponseLostOnce: true });
    assert.equal((await lost.handler(request())).status, 502);
    assert.equal(lost.usage.released, 1);
    assert.equal(lost.usage.finishCalls, 2);
    const failed = setup({ geminiStatus: 500, releaseHttpFailure: true });
    const response = await failed.handler(request());
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, 'USAGE_RELEASE_FAILED');
    assert.equal(failed.usage.finishCalls, 2);
    assert.equal(failed.usage.active.size, 1);
  }
  console.log('PASS: lost release replies retry safely, and failed release responses surface an explicit error.');

  // Missing Authorization: 401 before any REST call is attempted.
  {
    const { handler, calls } = setup();
    const response = await handler(request(undefined, { bearer: false }));
    assert.equal(response.status, 401);
    assert.equal(calls(), 0);
  }
  console.log('PASS: a missing Authorization header is rejected before any database read.');

  const cases = [
    ['bad apikey', { key: 'bad' }, 401, 0],
    ['wrong method', { method: 'GET' }, 405, 0],
    ['preflight', { method: 'OPTIONS' }, 204, 0],
    ['missing config', {}, 503, 0, { config: { geminiKey: '' } }],
    ['missing lecture', {}, 404, 2, { lectures: [] }],
    ['lecture read failure', {}, 502, 2, { dbError: true }],
    ['saved analysis missing', {}, 502, 3, { analysisRows: [] }],
    ['corrections read failure', {}, 502, 4, { correctionsError: true }],
    ['quota', {}, 429, 7, { geminiStatus: 429 }],
    ['provider error', {}, 502, 7, { geminiStatus: 500 }],
    ['invalid quiz', {}, 502, 7, { answer: {} }],
    ['insufficient context', {}, 422, 7, { answer: { error: 'INSUFFICIENT_CONTEXT' } }],
    ['blocked', {}, 502, 7, { finishReason: 'SAFETY' }],
    ['truncated', {}, 502, 7, { finishReason: 'MAX_TOKENS' }],
  ];
  for (const [name, requestOptions, expectedStatus, expectedCalls, setupOverrides = {}] of cases) {
    const { handler, calls } = setup(setupOverrides);
    const response = await handler(request(undefined, requestOptions));
    assert.equal(response.status, expectedStatus, name);
    assert.equal(calls(), expectedCalls, name);
    const text = await response.text();
    assert.ok(!text.includes('sensitive') && !text.includes('secret-test'), name);
  }
  console.log(`PASS: ${cases.length} request-shape and provider-failure scenarios return sanitized errors with no leaked secrets.`);

  const malformedCases = [
    ['bad JSON', '{'],
    ['empty ID', { lectureId: ' ' }],
  ];
  for (const [name, body] of malformedCases) {
    const { handler, calls } = setup();
    const response = await handler(request(body));
    assert.equal(response.status, 400, name);
    assert.equal(calls(), name === 'empty ID' ? 1 : 0, name);
  }
  console.log(`PASS: ${malformedCases.length} malformed-request cases are rejected before any database read.`);

  {
    const { handler, calls } = setup();
    const response = await handler(request(' '.repeat(16385)));
    assert.equal(response.status, 413);
    assert.equal(calls(), 0);
  }
  console.log('PASS: an oversized request body is rejected before any database read.');

  {
    const originalTimer = global.setTimeout;
    global.setTimeout = (fn) => originalTimer(fn, 1);
    try {
      const response = await createHandler(config, (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('timeout')))))(request());
      assert.equal(response.status, 504);
    } finally { global.setTimeout = originalTimer; }
  }
  console.log('PASS: an upstream hang times out as 504.');

  // src/services/ai.ts's generateQuiz client wrapper, mocked at the Supabase client boundary.
  {
    const vm = require('node:vm');
    const exportsObject = {};
    let mode = 'supabase';
    const cleanQuiz = { ...quiz, questions: quiz.questions.map((question) => ({ ...question, citedPages: [] })) };
    let result = { data: cleanQuiz, error: null };
    let invokeCalls = 0;
    const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/services/ai.ts'), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, {
      exports: exportsObject, Error, Response,
      require: (name) => {
        if (name === '@supabase/supabase-js') return { FunctionsHttpError: class FunctionsHttpError extends Error {} };
        if (name === '@/lib/quiz') return require('../../../src/lib/quiz.ts');
        if (name === '@/lib/askLecture') return require('../../../src/lib/askLecture.ts');
        if (name === '@/lib/lectureAnalysis') return {};
        if (name === '@/lib/captureAnalysis') return {};
        if (name === '@/lib/dataMode') return { getDataMode: () => mode };
        if (name === '@/lib/supabase') {
          return {
            supabase: {
              functions: {
                invoke: async (name, { body }) => {
                  invokeCalls += 1;
                  assert.equal(name, 'generate-quiz');
                  assert.equal(body.lectureId, id);
                  return result;
                },
              },
            },
          };
        }
        throw new Error(name);
      },
      __DEV__: false,
    });
    assert.deepEqual(await exportsObject.generateQuiz(id), cleanQuiz);

    result = { data: null, error: { context: json({ error: { message: 'Quota reached.' } }) } };
    await assert.rejects(exportsObject.generateQuiz(id), /Quota/);

    result = { data: { answer: 4 }, error: null };
    await assert.rejects(exportsObject.generateQuiz(id), /Quiz text/);

    mode = 'mock';
    await assert.rejects(exportsObject.generateQuiz(id), /supabase/);
    await assert.rejects(exportsObject.generateQuiz(' '), /required/);
    assert.equal(invokeCalls, 3);
  }
  console.log('PASS: the generateQuiz client wrapper parses citedPages and validates input/data mode as before.');

  for (const mutate of [
    (q) => q.questions.pop(), (q) => q.questions[0].options.pop(), (q) => { q.questions[0].options[1] = 'A'; },
    (q) => { q.questions[0].correctAnswer = 'absent'; }, (q) => { q.questions[0].explanation = ''; },
    (q) => { q.questions[1].question = q.questions[0].question; }, (q) => { q.title = ''; },
    (q) => { q.questions[0].options[0] = 3; },
  ]) {
    const invalid = structuredClone(quiz);
    mutate(invalid);
    assert.throws(() => parseQuizResult(invalid));
  }
  const padded = structuredClone(quiz);
  padded.questions[0].options[0] = ' A ';
  padded.questions[0].correctAnswer = ' A ';
  assert.equal(parseQuizResult(padded).questions[0].correctAnswer, 'A');
  const noCitations = structuredClone(quiz);
  delete noCitations.questions[0].citedPages;
  assert.deepEqual(parseQuizResult(noCitations).questions[0].citedPages, [], 'a missing citedPages field degrades to [] rather than failing');
  console.log('PASS: parseQuizResult rejects malformed quizzes, trims padded answers, and degrades a missing citedPages to [].');
})().catch((error) => { console.error(error); process.exitCode = 1; });

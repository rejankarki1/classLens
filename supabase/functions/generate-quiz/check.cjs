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
const config = { supabaseUrl: 'https://example.invalid', publishableKey: 'test-key', geminiKey: 'secret-test' };

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
  const fetcher = async (url, init = {}) => {
    calls += 1;
    requestedUrls.push(url);
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
  return { handler: createHandler({ ...config, ...overrides.config }, fetcher), calls: () => calls, requestedUrls };
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
    assert.equal(calls(), 4, 'lectures + capture_analyses + notebook_corrections + gemini');
  }
  console.log('PASS: a grounded quiz keeps valid citations and strips a page number outside the supplied notebook pages.');

  // No capture_analysis_id: lecture-level-only grounding, no notebook calls.
  {
    const { handler, calls, requestedUrls } = setup({ lectures: [{ ...lecture, capture_analysis_id: null }], assertSentPages: (pages) => assert.deepEqual(pages, []) });
    const response = await handler(request());
    assert.equal(response.status, 200);
    assert.equal(calls(), 2, 'lectures + gemini only');
    assert.equal(requestedUrls.some((url) => url.includes('capture_analyses') || url.includes('notebook_corrections')), false);
  }
  console.log('PASS: a lecture with no capture_analysis_id grounds from lecture fields only, with zero notebook pages.');

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
    ['missing lecture', {}, 404, 1, { lectures: [] }],
    ['lecture read failure', {}, 502, 1, { dbError: true }],
    ['saved analysis missing', {}, 502, 2, { analysisRows: [] }],
    ['corrections read failure', {}, 502, 3, { correctionsError: true }],
    ['quota', {}, 429, 4, { geminiStatus: 429 }],
    ['provider error', {}, 502, 4, { geminiStatus: 500 }],
    ['invalid quiz', {}, 502, 4, { answer: {} }],
    ['insufficient context', {}, 422, 4, { answer: { error: 'INSUFFICIENT_CONTEXT' } }],
    ['blocked', {}, 502, 4, { finishReason: 'SAFETY' }],
    ['truncated', {}, 502, 4, { finishReason: 'MAX_TOKENS' }],
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
    assert.equal(calls(), 0, name);
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

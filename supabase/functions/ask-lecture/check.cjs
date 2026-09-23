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
    { captureId: page2Id, pageNumber: 2, readability: 'partial', faithfulExtraction: 'A node wtih one child is replcaed by that child.', unclearSections: ['diagram'] },
  ],
  combinedSummary: 'BST deletion has three cases.', concepts: ['BST'], examples: [], assignments: [],
  examMentions: [], courseSignals: [], topicSignals: [],
};
const corrections = [{ page_number: 2, corrected_text: 'A node with one child is replaced by that child.' }];

function json(value) { return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } }); }
function request(body = { lectureId: id, question: 'What are the deletion cases?' }, { key = 'test-key', method = 'POST', bearer = 'user-token' } = {}) {
  const headers = { apikey: key, 'content-type': 'application/json' };
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  return new Request('https://example.invalid', { method, headers, ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
}
function geminiResponse(answer, finishReason = 'STOP') {
  return json({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(answer) }] } }] });
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
      assert.equal(new URL(url).searchParams.get('id'), `eq.${analysisId}`);
      if (overrides.analysisError) return new Response('', { status: 500 });
      return json(overrides.analysisRows ?? [{ id: analysisId, analysis }]);
    }
    if (url.includes('/rest/v1/notebook_corrections?')) {
      assert.equal(new URL(url).searchParams.get('lecture_id'), `eq.${id}`);
      if (overrides.correctionsError) return new Response('', { status: 500 });
      return json(overrides.corrections ?? corrections);
    }
    if (url.includes(':generateContent')) {
      assert.equal(init.headers['x-goog-api-key'], 'secret-test');
      const body = JSON.parse(init.body);
      assert.match(body.systemInstruction.parts[0].text, /ONLY the supplied/);
      assert.match(body.systemInstruction.parts[0].text, /not found in this lecture/);
      const sent = JSON.parse(body.contents[0].parts[0].text);
      assert.deepEqual(sent.lecture, { id, title: lecture.title, summary: lecture.summary, key_concepts: lecture.key_concepts, important_points: lecture.important_points, assignments: lecture.assignments, exam_mentions: lecture.exam_mentions });
      if (overrides.assertSentPages) overrides.assertSentPages(sent.pages);
      if (overrides.geminiStatus) return new Response('sensitive', { status: overrides.geminiStatus });
      return geminiResponse(overrides.answer ?? { answer: 'Leaf, one child, two children.', citedPages: [1, 2] }, overrides.finishReason);
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  return { handler: createHandler({ ...config, ...overrides.config }, fetcher), calls: () => calls, requestedUrls };
}

(async () => {
  // Grounded citation case: a real question over both pages, corrected text
  // for page 2 preferred over its faithful extraction, both pages cited.
  {
    const { handler, calls } = setup({
      assertSentPages: (pages) => {
        assert.deepEqual(pages, [
          { pageNumber: 1, text: 'A leaf node has no children.', readability: 'clear', unclearSections: [] },
          { pageNumber: 2, text: 'A node with one child is replaced by that child.', readability: 'partial', unclearSections: ['diagram'] },
        ]);
      },
    });
    const response = await handler(request());
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.answer, 'Leaf, one child, two children.');
    assert.deepEqual(body.citedPages, [1, 2]);
    assert.equal(calls(), 4, 'lectures + capture_analyses + notebook_corrections + gemini');
  }
  console.log('PASS: grounded citation case uses corrected text over faithful extraction and returns both cited pages.');

  // Absent-fact case: explicit uncertainty, not a fabricated answer.
  {
    const { handler, calls } = setup({ answer: { answer: 'That information was not found in this lecture.', citedPages: [] } });
    const response = await handler(request({ lectureId: id, question: 'Who invented C?' }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.answer, 'That information was not found in this lecture.');
    assert.deepEqual(body.citedPages, []);
    assert.equal(calls(), 4);
  }
  console.log('PASS: an absent fact returns explicit uncertainty, not a fabricated answer.');

  // Out-of-range citations are stripped -- never trust the model's page numbers.
  {
    const { handler } = setup({ answer: { answer: 'Leaf case only.', citedPages: [1, 99] } });
    const response = await handler(request());
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.citedPages, [1]);
  }
  console.log('PASS: a cited page number outside the supplied notebook pages is filtered out.');

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

  // Standard request-shape and provider-failure cases.
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
    ['invalid answer', {}, 502, 4, { answer: { answer: '', citedPages: [] } }],
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

  // Malformed request bodies never reach the database.
  const malformedCases = [
    ['bad JSON', '{'],
    ['empty question', { lectureId: id, question: ' ' }],
    ['long question', { lectureId: id, question: 'x'.repeat(2001) }],
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

  // src/services/ai.ts's askLecture client wrapper, mocked at the Supabase client boundary.
  {
    const vm = require('node:vm');
    const exportsObject = {};
    let mode = 'supabase';
    let result = { data: { answer: ' Grounded answer ', citedPages: [1] }, error: null };
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
                  assert.equal(name, 'ask-lecture');
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
    const answered = await exportsObject.askLecture(id, 'Question');
    assert.equal(answered.answer, 'Grounded answer');
    assert.deepEqual(answered.citedPages, [1]);

    result = { data: null, error: { context: json({ error: { message: 'Quota reached.' } }) } };
    await assert.rejects(exportsObject.askLecture(id, 'Question'), /Quota/);

    result = { data: { answer: 4 }, error: null };
    await assert.rejects(exportsObject.askLecture(id, 'Question'), /Invalid lecture answer/);

    result = { data: { answer: 'No citations here' }, error: null };
    const noCitations = await exportsObject.askLecture(id, 'Question');
    assert.deepEqual(noCitations.citedPages, [], 'a missing citedPages field degrades to no citations rather than failing');

    mode = 'mock';
    await assert.rejects(exportsObject.askLecture(id, 'Question'), /supabase/);
    await assert.rejects(exportsObject.askLecture(id, ' '), /required/);
    assert.equal(invokeCalls, 4);
  }
  console.log('PASS: the askLecture client wrapper parses citedPages, degrades a missing value to [], and validates input/data mode as before.');
})().catch((error) => { console.error(error); process.exitCode = 1; });

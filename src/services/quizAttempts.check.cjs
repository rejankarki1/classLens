const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');

const file = path.join(__dirname, 'quizAttempts.ts');
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function load(dataMode, supabase) {
  const serviceExports = {};
  vm.runInNewContext(code, {
    exports: serviceExports, Error, Date, Map, Array,
    require: (name) => {
      if (name === '@/lib/dataMode') return { getDataMode: () => dataMode };
      if (name === '@/lib/supabase') return { supabase };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return serviceExports;
}

const quiz = {
  title: 'BST Deletion',
  questions: [
    { question: 'What replaces a leaf?', options: ['Nothing', 'Its child', 'Its parent', 'The root'], correctAnswer: 'Nothing', explanation: 'A leaf has no children to promote.', citedPages: [1] },
    { question: 'What replaces a one-child node?', options: ['Nothing', 'Its child', 'Its parent', 'The root'], correctAnswer: 'Its child', explanation: 'The single child takes its place.', citedPages: [2] },
  ],
};

(async () => {
  // Mock mode: full flow -- save, miss, and review, citation intact.
  const mock = load('mock', null);
  const { id: mockAttemptId } = await mock.saveQuizAttempt('lecture-1', quiz);
  await mock.recordMissedQuestion(mockAttemptId, 0, quiz.questions[0], 'Its parent');
  const mockMissed = await mock.getMissedQuestions();
  assert.equal(mockMissed.length, 1);
  assert.deepEqual(mockMissed[0].citedPages, [1]);
  assert.equal(mockMissed[0].selectedAnswer, 'Its parent');
  console.log('PASS: mock mode saves an attempt, records a miss, and returns it with its citation intact.');

  // Supabase mode: full flow -- insert attempt, insert missed question (no
  // existing row), then read it back joined with the lecture title.
  {
    let insertAttemptCalls = 0;
    let selectExistingCalls = 0;
    let insertMissedCalls = 0;
    let updateMissedCalls = 0;
    let hasExistingRow = false;
    const missedRow = {
      id: 'missed-1', quiz_attempt_id: 'attempt-1', question_index: 0,
      question: quiz.questions[0].question, options: quiz.questions[0].options,
      correct_answer: quiz.questions[0].correctAnswer, selected_answer: 'Its parent',
      explanation: quiz.questions[0].explanation, cited_pages: quiz.questions[0].citedPages,
      created_at: '2026-09-23T00:00:00.000Z',
      quiz_attempts: { lecture_id: 'lecture-1', lectures: { title: 'BST Basics' } },
    };
    const supabase = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'owner-1' } } } }) },
      from: (table) => {
        if (table === 'quiz_attempts') {
          return {
            insert: (values) => {
              insertAttemptCalls += 1;
              assert.equal(values.lecture_id, 'lecture-1');
              assert.equal(values.title, quiz.title);
              assert.deepEqual(values.questions, quiz.questions);
              return { select: () => ({ returns: () => ({ single: async () => ({ data: { id: 'attempt-1' }, error: null }) }) }) };
            },
          };
        }
        assert.equal(table, 'quiz_missed_questions');
        return {
          select: (columns) => {
            if (columns === 'id') {
              return {
                eq: () => ({
                  eq: () => ({
                    returns: () => ({ maybeSingle: async () => ({ data: hasExistingRow ? { id: 'missed-1' } : null, error: null }) }),
                  }),
                }),
              };
            }
            assert.equal(columns, 'id,quiz_attempt_id,question_index,question,options,correct_answer,selected_answer,explanation,cited_pages,created_at,quiz_attempts(lecture_id,lectures(title))');
            return { order: () => ({ returns: async () => ({ data: [missedRow], error: null }) }) };
          },
          insert: (values) => {
            insertMissedCalls += 1;
            assert.equal(values.owner_id, 'owner-1');
            assert.equal(values.quiz_attempt_id, 'attempt-1');
            assert.equal(values.question_index, 0);
            assert.deepEqual(values.cited_pages, [1]);
            hasExistingRow = true;
            return Promise.resolve({ error: null });
          },
          update: (values) => {
            updateMissedCalls += 1;
            assert.deepEqual(Object.keys(values), ['selected_answer']);
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      },
    };
    const supabaseMode = load('supabase', supabase);

    const { id: attemptId } = await supabaseMode.saveQuizAttempt('lecture-1', quiz);
    assert.equal(attemptId, 'attempt-1');
    assert.equal(insertAttemptCalls, 1);

    await supabaseMode.recordMissedQuestion(attemptId, 0, quiz.questions[0], 'Its parent');
    assert.equal(insertMissedCalls, 1, 'no existing row must insert once');
    assert.equal(updateMissedCalls, 0);

    // Retaking the same question wrong again must update, not insert again.
    await supabaseMode.recordMissedQuestion(attemptId, 0, quiz.questions[0], 'The root');
    assert.equal(insertMissedCalls, 1, 'a retake must not insert a second row');
    assert.equal(updateMissedCalls, 1);

    const missed = await supabaseMode.getMissedQuestions();
    assert.equal(missed.length, 1);
    assert.equal(missed[0].lectureTitle, 'BST Basics');
    assert.equal(missed[0].lectureId, 'lecture-1');
    assert.deepEqual(missed[0].citedPages, [1]);
    assert.equal(missed[0].selectedAnswer, 'Its parent');
    console.log('PASS: supabase mode inserts once, updates on a retake, and review returns the citation and lecture title intact.');
  }

  // recordMissedQuestion is best-effort: a database error must never throw
  // into the quiz-taking flow.
  {
    const failing = load('supabase', {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'owner-1' } } } }) },
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ returns: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'boom' } }) }) }) }) }),
      }),
    });
    await failing.recordMissedQuestion('attempt-1', 0, quiz.questions[0], 'wrong');
  }
  console.log('PASS: a database error while recording a miss resolves without throwing.');
})().catch((error) => { console.error(error); process.exitCode = 1; });

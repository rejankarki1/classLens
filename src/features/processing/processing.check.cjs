const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');

function load(relative, mocks = {}) {
  const filename = path.join(__dirname, relative);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: (name) => mocks[name] ?? (() => { throw new Error(`Unexpected import: ${name}`); })(),
    Error, Set,
  });
  return exports;
}

const state = load('stateMachine.ts');
assert.equal(state.canTransitionProcessingJob('queued', 'uploading'), true);
assert.equal(state.canTransitionProcessingJob('uploading', 'analyzing'), true);
assert.equal(state.canTransitionProcessingJob('analyzing', 'course_needed'), true);
assert.equal(state.canTransitionProcessingJob('course_needed', 'filing'), true);
assert.equal(state.canTransitionProcessingJob('filing', 'completed'), true);
assert.equal(state.canTransitionProcessingJob('completed', 'uploading'), false);
assert.equal(state.canTransitionProcessingJob('course_needed', 'completed'), false);
assert.throws(() => state.assertProcessingJobTransition('completed', 'filing'), /Invalid/);

const matcher = load('courseMatcher.ts', { '@/types': {} });
const analysis = {
  sessionId: 's', photos: [], combinedSummary: '', concepts: [], examples: [], assignments: [], examMentions: [],
  courseSignals: ['CS-3358', 'Data Structures'], topicSignals: ['binary trees and algorithms'],
};
const cs = { id: 'cs-3358', code: 'CS 3358', name: 'Data Structures', professor: 'Ada Lovelace' };
const math = { id: 'math-3398', code: 'MATH 3398', name: 'Discrete Mathematics II', professor: 'Grace Hopper' };
const unique = matcher.matchEnrolledCourse(analysis, [cs, math]);
assert.equal(unique.course.id, cs.id);
assert.equal(unique.automatic, true);
assert.ok(unique.confidence >= matcher.COURSE_MATCH_AUTO_THRESHOLD);

const ambiguous = matcher.matchEnrolledCourse(analysis, [cs, { ...cs, id: 'duplicate' }]);
assert.equal(ambiguous.automatic, false);
assert.equal(matcher.matchEnrolledCourse({ ...analysis, courseSignals: [], topicSignals: [] }, [cs]).course, null);

const migration = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/20260921000000_durable_processing_jobs.sql'), 'utf8');
for (const expected of [
  'alter table public.processing_jobs enable row level security',
  'owner_id = auth.uid()',
  "media_type in ('photo', 'audio', 'video')",
  'unique (owner_id, capture_session_id)',
  'lectures_owner_capture_session_key',
  'course_memberships membership',
  'validate_processing_job_transition',
]) assert.ok(migration.includes(expected), `Migration is missing ${expected}`);

console.log('PASS: processing transitions, invalid transitions, course scoring, ambiguity, and migration ownership invariants.');

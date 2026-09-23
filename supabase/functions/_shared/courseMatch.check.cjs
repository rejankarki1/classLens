const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');

const file = path.join(__dirname, 'courseMatch.ts');
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const exportsObject = {};
vm.runInNewContext(code, {
  exports: exportsObject,
  require: (name) => { throw new Error(`Unexpected import: ${name}`); },
});
const { matchEnrolledCourse, SCHEDULE_MATCH_WEIGHT, COURSE_MATCH_AUTO_THRESHOLD } = exportsObject;

const cs3358 = { id: 'cs-3358', code: 'CS 3358', name: 'Data Structures', professor: 'Kim' };
const bio1101 = { id: 'bio-1101', code: 'BIO 1101', name: 'Intro Biology', professor: 'Alvarez' };
const courses = [cs3358, bio1101];

// Deliberately NOT the same clock hour in UTC and in the schedule's zone:
// 2026-09-22T14:10:00.000Z is Tuesday 09:10 America/Chicago (CDT, UTC-5),
// but Tuesday 14:10 in raw UTC terms -- outside the 09:00-10:15 window by
// five hours. A fixture that happened to line up in UTC would pass even
// with the pre-fix bug (comparing capturedAt.getUTCHours() directly against
// naive local start_time/end_time); this fixture only passes if the
// timezone conversion actually runs.
const capturedAt = new Date('2026-09-22T14:10:00.000Z');
function chicagoLocal(instant) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(instant);
  return { weekday: parts.find((part) => part.type === 'weekday').value, hour: Number(parts.find((part) => part.type === 'hour').value) % 24, minute: Number(parts.find((part) => part.type === 'minute').value) };
}
assert.deepEqual(chicagoLocal(capturedAt), { weekday: 'Tue', hour: 9, minute: 10 }, 'fixture must be Tuesday 09:10 America/Chicago for this test to mean anything');
assert.notEqual(capturedAt.getUTCHours(), 9, 'fixture must NOT also be 09:xx in raw UTC, or it would pass even with the pre-fix bug');

const weakSignals = { courseSignals: [], topicSignals: ['linked list'] };
const schedules = [{ courseId: 'cs-3358', dayOfWeek: 2, startTime: '09:00', endTime: '10:15', timezone: 'America/Chicago' }];

// Account A: a schedule for CS 3358 at the exact capture time, with weak
// textual signals -- confidence should rise (schedule reason present) but
// must stay well below the auto-file threshold on its own.
const withSchedule = matchEnrolledCourse(weakSignals, courses, { capturedAt, schedules });
assert.equal(withSchedule.course?.id, 'cs-3358');
assert.ok(withSchedule.confidence < COURSE_MATCH_AUTO_THRESHOLD, 'schedule + weak topic signal must not reach auto-file confidence');
assert.equal(withSchedule.automatic, false);
console.log('PASS: a matching schedule raises confidence without crossing the auto-file threshold.');

// Account B: no schedule rows at all -- identical scoring to pre-Session-I
// behavior (regression guard).
const withoutSchedule = matchEnrolledCourse(weakSignals, courses);
const withEmptySchedule = matchEnrolledCourse(weakSignals, courses, { capturedAt, schedules: [] });
assert.deepEqual(withoutSchedule, withEmptySchedule);
assert.ok(withoutSchedule.confidence < withSchedule.confidence, 'no schedule must score no higher than a matching one');
console.log('PASS: an account with no schedule rows scores identically with or without a captured_at value.');

// The schedule bonus can never surface a course absent from the input
// `courses` array -- the matcher only ever ranks what it's given.
const onlyBio = matchEnrolledCourse(weakSignals, [bio1101], { capturedAt, schedules });
assert.notEqual(onlyBio.course?.id, 'cs-3358');
console.log('PASS: a schedule entry for a course outside the enrolled list never surfaces that course.');

// Weight-ceiling assertion: schedule + max topic overlap must stay under the
// auto-file threshold, so schedule can never by itself (or with topic) file
// a lecture automatically.
assert.ok(SCHEDULE_MATCH_WEIGHT + 0.25 < COURSE_MATCH_AUTO_THRESHOLD);
console.log('PASS: SCHEDULE_MATCH_WEIGHT plus the maximum topic bonus stays below the auto-file threshold.');

// A schedule on the wrong day, or outside the grace window, contributes nothing.
// Same local wall-clock time (09:10 Chicago), one calendar day later.
const wrongDayCapturedAt = new Date('2026-09-23T14:10:00.000Z');
assert.deepEqual(chicagoLocal(wrongDayCapturedAt), { weekday: 'Wed', hour: 9, minute: 10 });
const wrongDay = matchEnrolledCourse(weakSignals, courses, { capturedAt: wrongDayCapturedAt, schedules });
assert.deepEqual(wrongDay, withoutSchedule);
console.log('PASS: a schedule on a different day contributes no bonus.');

// An unrecognized stored timezone must skip that row, not throw and break
// the whole match -- schedule rows are never user-typed, but defense here
// still matters (e.g. a stale/renamed IANA zone name).
const badTimezone = matchEnrolledCourse(weakSignals, courses, {
  capturedAt,
  schedules: [{ ...schedules[0], timezone: 'Not/AZone' }],
});
assert.deepEqual(badTimezone, withoutSchedule);
console.log('PASS: an invalid stored timezone is skipped rather than throwing.');

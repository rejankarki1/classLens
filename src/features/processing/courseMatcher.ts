import type { CaptureAnalysis, Course } from '@/types';
import type { CourseMatch } from './types';

export const COURSE_MATCH_AUTO_THRESHOLD = 0.85;
export const COURSE_MATCH_MARGIN = 0.2;
// Chosen so a schedule match combined with the maximum possible topic overlap
// (0.25) still falls well short of the auto-file threshold (0.85): schedule
// alone can never file a lecture, only make an already-supported match rank
// higher.
export const SCHEDULE_MATCH_WEIGHT = 0.15;

// Session I: an optional per-course class time, used only to nudge ranking
// among the courses already returned by the caller's enrolled-only `courses`
// list -- it can never introduce a course that isn't already in that list.
// timezone is the IANA zone the class meets in (captured from the student's
// device when they saved the schedule) -- required because start_time/
// end_time are naive wall-clock values with no zone of their own.
export type ScheduleSignal = { courseId: string; dayOfWeek: number; startTime: string; endTime: string; timezone: string };
export type MatchContext = { capturedAt?: Date | null; schedules?: ScheduleSignal[] };

const stopWords = new Set(['and', 'for', 'from', 'into', 'intro', 'introduction', 'the', 'this', 'that', 'with']);

function normalized(value: string): string {
  return value.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function compact(value: string): string {
  return normalized(value).replace(/\s+/g, '');
}

function tokens(value: string): Set<string> {
  return new Set(normalized(value).split(/\s+/).filter((token) => token.length >= 3 && !stopWords.has(token)));
}

function overlapScore(signals: string[], course: Course): number {
  const source = tokens(signals.join(' '));
  const target = tokens(`${course.code} ${course.name} ${course.professor}`);
  if (!source.size || !target.size) return 0;
  let matches = 0;
  source.forEach((token) => { if (target.has(token)) matches += 1; });
  return Math.min(0.25, (matches / Math.max(2, target.size)) * 0.25);
}

function minutesOfDay(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + (minutes || 0);
}

const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Converts a UTC instant into the day-of-week and minutes-of-day it falls on
 * in the given IANA zone. Uses Intl (full tzdata, DST-correct) rather than a
 * fixed offset -- a captured_at instant and a naive local start_time/end_time
 * are meaningless to compare directly without first anchoring both to the
 * same real-world clock.
 */
function localDayAndMinutes(instant: Date, timeZone: string): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(instant);
  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? '';
  // hour12: false can render midnight as "24" on some ICU builds; normalize it.
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0') % 24;
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  return { day: weekdayNames.indexOf(weekday), minutes: hour * 60 + minute };
}

// Best-effort signal, not a correctness dependency: an unrecognized stored
// timezone (should never happen -- it's captured from Intl, not typed) skips
// that one schedule row rather than failing the whole match.
function scheduleScore(course: Course, capturedAt: Date | null | undefined, schedules: ScheduleSignal[]): number {
  if (!capturedAt || !schedules.length) return 0;
  const graceMinutes = 15;
  const matches = schedules.some((schedule) => {
    if (schedule.courseId !== course.id) return false;
    let local: { day: number; minutes: number };
    try {
      local = localDayAndMinutes(capturedAt, schedule.timezone);
    } catch {
      return false;
    }
    if (schedule.dayOfWeek !== local.day) return false;
    const start = minutesOfDay(schedule.startTime) - graceMinutes;
    const end = minutesOfDay(schedule.endTime) + graceMinutes;
    return local.minutes >= start && local.minutes <= end;
  });
  return matches ? SCHEDULE_MATCH_WEIGHT : 0;
}

function scoreCourse(analysis: CaptureAnalysis, course: Course, capturedAt: Date | null | undefined, schedules: ScheduleSignal[]) {
  const courseSignals = analysis.courseSignals.map(compact).filter(Boolean);
  const combinedSignals = [...analysis.courseSignals, ...analysis.topicSignals];
  const code = compact(course.code);
  const name = compact(course.name);
  const professor = compact(course.professor);
  const codeMatch = Boolean(code && courseSignals.some((signal) => signal === code || signal.includes(code)));
  const nameMatch = Boolean(name && courseSignals.some((signal) => signal === name || signal.includes(name)));
  const professorMatch = Boolean(professor && courseSignals.some((signal) => signal === professor || signal.includes(professor)));
  const topic = overlapScore(combinedSignals, course);
  const schedule = scheduleScore(course, capturedAt, schedules);
  const score = Math.min(1, (codeMatch ? 0.85 : 0) + (nameMatch ? 0.55 : 0) + (professorMatch ? 0.2 : 0) + topic + schedule);
  const reasons = [codeMatch ? 'course code' : '', nameMatch ? 'course name' : '', professorMatch ? 'professor' : '', topic > 0 ? 'topic metadata' : '', schedule > 0 ? 'class schedule' : ''].filter(Boolean);
  return { course, score, reasons };
}

export function matchEnrolledCourse(analysis: CaptureAnalysis, courses: Course[], context: MatchContext = {}): CourseMatch {
  const capturedAt = context.capturedAt ?? null;
  const schedules = context.schedules ?? [];
  const ranked = courses.map((course) => scoreCourse(analysis, course, capturedAt, schedules))
    .sort((a, b) => b.score - a.score || a.course.code.localeCompare(b.course.code) || a.course.id.localeCompare(b.course.id));
  const top = ranked[0];
  if (!top || top.score <= 0) {
    return { course: null, confidence: 0, automatic: false, explanation: 'No enrolled course matched the saved course and topic signals.' };
  }
  const margin = top.score - (ranked[1]?.score ?? 0);
  const automatic = top.score >= COURSE_MATCH_AUTO_THRESHOLD && margin >= COURSE_MATCH_MARGIN;
  const explanation = top.reasons.length
    ? `Matched ${top.reasons.join(', ')}${automatic ? '.' : ', but the result needs confirmation.'}`
    : 'The result needs course confirmation.';
  return { course: top.course, confidence: Number(top.score.toFixed(3)), automatic, explanation };
}

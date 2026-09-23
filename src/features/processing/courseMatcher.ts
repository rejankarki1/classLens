import type { CaptureAnalysis, Course } from '@/types';
import type { CourseMatch } from './types';

export const COURSE_MATCH_AUTO_THRESHOLD = 0.85;
export const COURSE_MATCH_MARGIN = 0.2;

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

function scoreCourse(analysis: CaptureAnalysis, course: Course) {
  const courseSignals = analysis.courseSignals.map(compact).filter(Boolean);
  const combinedSignals = [...analysis.courseSignals, ...analysis.topicSignals];
  const code = compact(course.code);
  const name = compact(course.name);
  const professor = compact(course.professor);
  const codeMatch = Boolean(code && courseSignals.some((signal) => signal === code || signal.includes(code)));
  const nameMatch = Boolean(name && courseSignals.some((signal) => signal === name || signal.includes(name)));
  const professorMatch = Boolean(professor && courseSignals.some((signal) => signal === professor || signal.includes(professor)));
  const topic = overlapScore(combinedSignals, course);
  const score = Math.min(1, (codeMatch ? 0.85 : 0) + (nameMatch ? 0.55 : 0) + (professorMatch ? 0.2 : 0) + topic);
  const reasons = [codeMatch ? 'course code' : '', nameMatch ? 'course name' : '', professorMatch ? 'professor' : '', topic > 0 ? 'topic metadata' : ''].filter(Boolean);
  return { course, score, reasons };
}

export function matchEnrolledCourse(analysis: CaptureAnalysis, courses: Course[]): CourseMatch {
  const ranked = courses.map((course) => scoreCourse(analysis, course))
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

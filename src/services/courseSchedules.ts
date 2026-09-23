import { getDataMode } from '@/lib/dataMode';
import type { CourseSchedule, SaveCourseScheduleInput } from '@/types';

type ScheduleRow = { id: string; course_id: string; day_of_week: number; start_time: string; end_time: string; timezone: string };

const scheduleColumns = 'id, course_id, day_of_week, start_time, end_time, timezone';

function fromRow(row: ScheduleRow): CourseSchedule {
  return { id: row.id, courseId: row.course_id, dayOfWeek: row.day_of_week, startTime: row.start_time, endTime: row.end_time, timezone: row.timezone };
}

/**
 * The IANA zone the class actually meets in, from the device's own clock --
 * never typed by the student. start_time/end_time are naive wall-clock
 * values with no zone of their own; without this, the worker would have no
 * way to convert a UTC captured_at into the class's real local time. Falls
 * back to UTC only if Intl is unavailable, which never happens in practice
 * on a real device.
 */
function deviceTimezone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && zone.trim() ? zone : 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Mock mode has one demo user; schedules start empty and reset on reload. */
const mockSchedules = new Map<string, CourseSchedule>();
const scheduleListeners = new Set<() => void>();

export function onScheduleChange(listener: () => void): () => void {
  scheduleListeners.add(listener);
  return () => { scheduleListeners.delete(listener); };
}

function notifyScheduleChange() {
  scheduleListeners.forEach((listener) => listener());
}

async function session() {
  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(`Could not load your session: ${error.message}`);
  const userId = data.session?.user.id;
  if (!userId) throw new Error('You are signed out. Sign in and try again.');
  return { supabase, userId };
}

function requireTime(value: string, label: string): string {
  const trimmed = value.trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) throw new Error(`${label} must be a time in HH:MM (24-hour) format.`);
  return trimmed;
}

/** All class times for the signed-in student, across every enrolled course. */
export async function getMySchedules(): Promise<CourseSchedule[]> {
  if (getDataMode() === 'mock') {
    return [...mockSchedules.values()].sort((a, b) => a.courseId.localeCompare(b.courseId) || a.dayOfWeek - b.dayOfWeek);
  }

  const { supabase, userId } = await session();
  const { data, error } = await supabase
    .from('course_schedules')
    .select(scheduleColumns)
    .eq('user_id', userId)
    .order('day_of_week')
    .order('start_time')
    .returns<ScheduleRow[]>();

  if (error) throw new Error(`Could not load your class schedule: ${error.message}`);
  return data.map(fromRow);
}

/** Repeat saves for the same course/day/start time update that row in place. */
export async function saveSchedule(input: SaveCourseScheduleInput): Promise<CourseSchedule> {
  const courseId = input.courseId.trim();
  if (!courseId) throw new Error('Course is required.');
  if (!Number.isInteger(input.dayOfWeek) || input.dayOfWeek < 0 || input.dayOfWeek > 6) throw new Error('Day of week must be between 0 and 6.');
  const startTime = requireTime(input.startTime, 'Start time');
  const endTime = requireTime(input.endTime, 'End time');
  if (endTime <= startTime) throw new Error('End time must be after start time.');

  const timezone = deviceTimezone();

  if (getDataMode() === 'mock') {
    const existing = [...mockSchedules.values()].find((row) => row.courseId === courseId && row.dayOfWeek === input.dayOfWeek && row.startTime === startTime);
    const id = existing?.id ?? `${courseId}:${input.dayOfWeek}:${startTime}`;
    const saved: CourseSchedule = { id, courseId, dayOfWeek: input.dayOfWeek, startTime, endTime, timezone };
    mockSchedules.set(id, saved);
    notifyScheduleChange();
    return { ...saved };
  }

  const { supabase, userId } = await session();
  const { data, error } = await supabase
    .from('course_schedules')
    .upsert(
      { user_id: userId, course_id: courseId, day_of_week: input.dayOfWeek, start_time: startTime, end_time: endTime, timezone, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,course_id,day_of_week,start_time' },
    )
    .select(scheduleColumns)
    .returns<ScheduleRow[]>()
    .single();

  if (error) throw new Error(`Could not save your class schedule: ${error.message}`);
  notifyScheduleChange();
  return fromRow(data);
}

/** Removing an absent schedule is a no-op; the catalog course is never touched. */
export async function deleteSchedule(id: string): Promise<void> {
  if (getDataMode() === 'mock') {
    mockSchedules.delete(id);
    notifyScheduleChange();
    return;
  }

  const { supabase, userId } = await session();
  const { error } = await supabase
    .from('course_schedules')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw new Error(`Could not remove that class time: ${error.message}`);
  notifyScheduleChange();
}

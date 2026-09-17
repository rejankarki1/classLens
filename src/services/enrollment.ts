import { getDataMode } from '@/lib/dataMode';
import { getCourse, getCourses } from '@/services/courses';
import type { Course } from '@/types';

/** Mock mode has one demo user; enrollment starts empty and resets on reload. */
const mockEnrollments = new Set<string>();
const enrollmentListeners = new Set<() => void>();

/** Lets the route gate re-check enrollment immediately after a change. */
export function onEnrollmentChange(listener: () => void): () => void {
  enrollmentListeners.add(listener);
  return () => { enrollmentListeners.delete(listener); };
}

function notifyEnrollmentChange() {
  enrollmentListeners.forEach((listener) => listener());
}

async function session() {
  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(`Could not load your session: ${error.message}`);
  const userId = data.session?.user.id;
  if (!userId) throw new Error('You are signed out. Sign in and try again.');
  return { supabase, userId };
}

function requireCourseId(courseId: string): string {
  const id = courseId.trim();
  if (!id) throw new Error('Course ID is required.');
  return id;
}

/** Enrolled courses only. getCourses() continues to return the global catalog. */
export async function getMyEnrolledCourses(): Promise<Course[]> {
  if (getDataMode() === 'mock') {
    return (await getCourses())
      .filter((course) => mockEnrollments.has(course.id))
      .sort((a, b) => a.code.localeCompare(b.code) || a.id.localeCompare(b.id));
  }

  const { supabase, userId } = await session();
  const { data, error } = await supabase
    .from('courses')
    .select('id, code, name, professor, course_memberships!inner(user_id)')
    .eq('course_memberships.user_id', userId)
    .order('code')
    .order('id')
    .returns<Course[]>();

  if (error) throw new Error(`Could not load enrolled courses: ${error.message}`);
  // Return the existing public Course shape, without embedded membership data.
  return data.map(({ id, code, name, professor }) => ({ id, code, name, professor }));
}

/** Repeated enrollment preserves the original membership and joined_at. */
export async function enrollInCourse(courseId: string): Promise<void> {
  const id = requireCourseId(courseId);
  if (getDataMode() === 'mock') {
    if (!(await getCourse(id))) throw new Error('Course not found.');
    mockEnrollments.add(id);
    notifyEnrollmentChange();
    return;
  }

  const { supabase, userId } = await session();
  const { error } = await supabase
    .from('course_memberships')
    .upsert({ user_id: userId, course_id: id }, {
      onConflict: 'user_id,course_id',
      ignoreDuplicates: true,
    });

  // The foreign key rejects unknown catalog courses; never create one implicitly.
  if (error) throw new Error(`Could not enroll in course: ${error.message}`);
  notifyEnrollmentChange();
}

/** Removing an absent membership is a no-op; the catalog course is never deleted. */
export async function unenrollFromCourse(courseId: string): Promise<void> {
  const id = requireCourseId(courseId);
  if (getDataMode() === 'mock') {
    mockEnrollments.delete(id);
    notifyEnrollmentChange();
    return;
  }

  const { supabase, userId } = await session();
  const { error } = await supabase
    .from('course_memberships')
    .delete()
    .eq('user_id', userId)
    .eq('course_id', id);

  if (error) throw new Error(`Could not unenroll from course: ${error.message}`);
  notifyEnrollmentChange();
}

/** Supabase mode requires a session, so signed-out state is not mistaken for no enrollment. */
export async function hasEnrolledCourses(): Promise<boolean> {
  if (getDataMode() === 'mock') return mockEnrollments.size > 0;

  const { supabase, userId } = await session();
  const { data, error } = await supabase
    .from('course_memberships')
    .select('id')
    .eq('user_id', userId)
    .limit(1);

  if (error) throw new Error(`Could not check course enrollment: ${error.message}`);
  return data.length > 0;
}

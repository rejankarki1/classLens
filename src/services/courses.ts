import { mockCourses } from '@/features/courses/mockData';
import { getDataMode } from '@/lib/dataMode';
import type { Course, CreateCourseInput } from '@/types';

const courseColumns = 'id, code, name, professor';

/** Mock-mode store, so a course created in the demo survives until reload. */
const courses = mockCourses.map((course) => ({ ...course }));

/** Course IDs stay human-readable: "CHEM 1301" becomes "chem-1301". */
function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export async function getCourses(): Promise<Course[]> {
  if (getDataMode() === 'mock') {
    return courses.map((course) => ({ ...course }));
  }

  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase
    .from('courses')
    .select(courseColumns)
    .order('code')
    .order('id');

  if (error) throw new Error(`Could not load courses: ${error.message}`);
  return data;
}

export async function getCourse(id: string): Promise<Course | null> {
  if (getDataMode() === 'mock') {
    const course = courses.find((item) => item.id === id);
    return course ? { ...course } : null;
  }

  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase
    .from('courses')
    .select(courseColumns)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`Could not load course: ${error.message}`);
  return data;
}

/**
 * Create a course the student confirmed. Analysis never calls this directly.
 * Idempotent: an existing course with the same derived ID is returned as-is
 * rather than failing, so a retry cannot produce a duplicate or an error.
 */
export async function createCourse(input: CreateCourseInput): Promise<Course> {
  const code = input.code.trim();
  const name = input.name.trim();
  const professor = input.professor.trim();
  if (!code) throw new Error('Course code is required.');
  if (!name) throw new Error('Course name is required.');

  if (getDataMode() === 'mock') {
    const id = slugify(code) || `course-${courses.length + 1}`;
    const existing = courses.find((item) => item.id === id);
    if (existing) return { ...existing };
    const course = { id, code, name, professor };
    courses.push(course);
    return { ...course };
  }

  const { supabase } = await import('@/lib/supabase');
  let id = slugify(code);
  if (!id) {
    const { randomUUID } = await import('expo-crypto');
    id = randomUUID();
  }

  const existing = await getCourse(id);
  if (existing) return existing;

  const { data, error } = await supabase
    .from('courses')
    .insert({ id, code, name, professor })
    .select(courseColumns)
    .returns<Course[]>()
    .single();

  if (error) {
    // A concurrent create wins the unique ID; reuse its row instead of failing.
    const raced = await getCourse(id);
    if (raced) return raced;
    throw new Error(`Could not create course: ${error.message}`);
  }
  if (!data) throw new Error(`No saved course was returned (attempted ID ${id}).`);
  return data;
}

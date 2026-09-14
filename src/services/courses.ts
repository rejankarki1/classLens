import { mockCourses } from '@/features/courses/mockData';
import { getDataMode } from '@/lib/dataMode';
import type { Course } from '@/types';

export async function getCourses(): Promise<Course[]> {
  if (getDataMode() === 'mock') {
    return mockCourses.map((course) => ({ ...course }));
  }

  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase
    .from('courses')
    .select('id, code, name, professor')
    .order('code')
    .order('id');

  if (error) throw new Error(`Could not load courses: ${error.message}`);
  return data;
}

export async function getCourse(id: string): Promise<Course | null> {
  if (getDataMode() === 'mock') {
    const course = mockCourses.find((item) => item.id === id);
    return course ? { ...course } : null;
  }

  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase
    .from('courses')
    .select('id, code, name, professor')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`Could not load course: ${error.message}`);
  return data;
}

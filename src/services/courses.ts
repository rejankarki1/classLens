import { mockCourses } from '@/features/courses/mockData';
import type { Course } from '@/types';

export async function getCourses(): Promise<Course[]> {
  return mockCourses.map((course) => ({ ...course }));
}

export async function getCourse(id: string): Promise<Course | null> {
  const course = mockCourses.find((item) => item.id === id);
  return course ? { ...course } : null;
}
